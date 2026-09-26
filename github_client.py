"""Thin wrapper around the GitHub REST API for the Cluster data pipeline."""

import os
import time

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

load_dotenv()

API_BASE = "https://api.github.com"


class GitHubClient:
    def __init__(self, token: str | None = None):
        self.token = token or os.getenv("GITHUB_TOKEN")
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {self.token}" if self.token else "",
                # A long-lived keep-alive connection can go stale (GitHub or
                # an intermediate proxy closes it, but the client doesn't
                # notice) and then hang on the next reused request well
                # past any read timeout, since the hang happens waiting for
                # a connection-level event, not a slow response body. This
                # was observed twice during a large pipeline run. Closing
                # the connection after every request avoids reusing a
                # socket that might already be half-dead.
                "Connection": "close",
            }
        )
        # Also retry actual connection-level failures (not just the 403
        # rate-limit case handled below), since those are the ones a
        # stale/dropped connection actually raises.
        retry = Retry(total=3, backoff_factor=1, connect=3, read=2)
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount("https://", adapter)

    def _request(self, method: str, url: str, timeout: float = 15, **kwargs) -> requests.Response:
        """Make a request, handling a 403 rate limit by sleeping until reset and retrying once.

        timeout is a (connect, read) style bound in effect via the float
        applying to both -- a stalled connection with no timeout can hang
        forever with no way to recover, so every request is explicitly
        bounded; callers already handle the resulting exception
        (pipeline.py's per-repo try/except just logs it and moves on).
        """
        response = self.session.request(method, url, timeout=timeout, **kwargs)

        if response.status_code == 403 and "X-RateLimit-Reset" in response.headers:
            reset_time = int(response.headers["X-RateLimit-Reset"])
            sleep_seconds = max(reset_time - time.time(), 0) + 1
            time.sleep(sleep_seconds)
            response = self.session.request(method, url, timeout=timeout, **kwargs)

        response.raise_for_status()
        return response

    def search_repos_by_topic(self, topic: str, per_page: int = 30, pages: int = 1) -> list[dict]:
        """Search repositories by topic, sorted by stars descending.

        GitHub caps per_page at 100, so pages > 1 paginates via the `page`
        param to go deeper into the ranked list (e.g. pages=3 with
        per_page=100 fetches up to the top 300 repos for this topic).
        """
        url = f"{API_BASE}/search/repositories"
        items = []

        for page in range(1, pages + 1):
            params = {
                "q": f"topic:{topic}",
                "sort": "stars",
                "order": "desc",
                "per_page": per_page,
                "page": page,
            }
            response = self._request("GET", url, params=params)
            page_items = response.json().get("items", [])
            if not page_items:
                break
            items.extend(page_items)

            # The search endpoint has a much stricter rate limit (30
            # req/min authenticated) than the rest of the REST API -- a
            # small pause between pages keeps repeated topic pagination
            # from tripping it.
            if page < pages:
                time.sleep(1)

        return items

    def get_contributors(self, owner: str, repo: str, max_pages: int = 3) -> list[dict]:
        """Fetch up to max_pages of contributors (100 per page, capped at 300 total)."""
        contributors = []
        url = f"{API_BASE}/repos/{owner}/{repo}/contributors"
        per_page = 100

        for page in range(1, max_pages + 1):
            params = {"per_page": per_page, "page": page}
            response = self._request("GET", url, params=params)
            page_data = response.json()

            if not page_data:
                break

            contributors.extend(page_data)

            if len(contributors) >= 300:
                break

            if len(page_data) < per_page:
                break

        return contributors[:300]

    def get_participation(self, owner: str, repo: str) -> int:
        """Return total commits over the last 52 weeks from the participation stats endpoint."""
        url = f"{API_BASE}/repos/{owner}/{repo}/stats/participation"
        response = self._request("GET", url)
        data = response.json()
        weekly_commits = data.get("all", [])
        return sum(weekly_commits)
