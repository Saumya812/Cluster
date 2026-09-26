"""Pipeline: pull GitHub repo/contributor data and populate city.db."""

import sqlite3
import sys
import time

from db import DB_PATH, init_db
from github_client import GitHubClient
from scoring import assign_room, compute_scale

# Python block-buffers stdout when it isn't a terminal (e.g. redirected to a
# log file for a background run), which can hide progress prints for a long
# time. Line-buffer it so progress shows up immediately.
sys.stdout.reconfigure(line_buffering=True)

TOPICS = [
    "machine-learning",
    "web",
    "game-development",
    "devops",
    "blockchain",
    "android",
    "ios",
    "data-science",
    "security",
    "rust",
    "python",
    "javascript",
    "cli",
    "database",
    "computer-vision",
    "nlp",
    "robotics",
    "compiler",
    "operating-system",
    "graphics",
    # Added to grow the city from 20 to 50 districts/blocks.
    "kubernetes",
    "docker",
    "linux",
    "networking",
    "cryptography",
    "testing",
    "continuous-integration",
    "monitoring",
    "logging",
    "graphql",
    "rest-api",
    "microservices",
    "serverless",
    "iot",
    "embedded-systems",
    "augmented-reality",
    "virtual-reality",
    "bioinformatics",
    "chatbot",
    "reinforcement-learning",
    "distributed-systems",
    "web3",
    "frontend",
    "backend",
    "devtools",
    "package-manager",
    "static-site-generator",
    "animation",
    "physics-engine",
    "terminal",
    # Added to grow the city roughly 30x (~125,000 repos) -- at up to 1000
    # repos/topic (GitHub search's hard cap, see SEARCH_PAGES_PER_TOPIC),
    # 50 topics tops out around 50,000, so reaching the target needs a much
    # bigger topic list, not just deeper paging into the same 50.
    "react", "vue", "angular", "svelte", "nextjs", "nuxtjs", "sveltekit", "remix",
    "nodejs", "deno", "bun", "express", "nestjs", "django", "flask", "fastapi",
    "spring-boot", "laravel", "symfony", "rails", "dotnet", "aspnetcore",
    "flutter", "react-native", "xamarin", "unity", "unreal-engine", "godot",
    "webassembly", "electron", "tauri", "css", "sass", "tailwindcss",
    "bootstrap", "material-ui", "design-system", "ui-components", "accessibility",
    "i18n", "image-processing", "video-processing", "audio-processing",
    "speech-recognition", "text-to-speech", "machine-translation",
    "recommendation-system", "search-engine", "elasticsearch", "vector-database",
    "embeddings", "llm", "gpt", "transformers", "langchain", "prompt-engineering",
    "autonomous-agents", "rag", "data-visualization", "data-engineering",
    "big-data", "etl", "pandas", "numpy", "scikit-learn", "tensorflow",
    "pytorch", "keras", "jupyter-notebook", "kafka", "rabbitmq", "redis",
    "postgresql", "mysql", "mongodb", "sqlite", "orm", "database-migration",
    "terraform", "ansible", "puppet", "infrastructure-as-code", "aws", "azure",
    "gcp", "cloud-native", "edge-computing", "cdn", "load-balancer",
    "api-gateway", "message-queue", "observability", "distributed-tracing",
    "alerting", "penetration-testing", "vulnerability-scanner", "malware-analysis",
    "digital-forensics", "smart-contract", "defi", "nft", "cryptocurrency",
    "trading-bot", "quant-finance", "fintech", "healthtech", "edtech",
    "home-automation", "drone", "gis", "mapping", "algorithms", "data-structures",
    "competitive-programming", "boilerplate", "cms", "ecommerce",
    "chat-application", "low-code", "no-code", "browser-extension",
    "vscode-extension", "discord-bot", "telegram-bot", "slack-bot",
    "web-scraping", "crawler", "proxy", "vpn", "firewall", "dns", "ssh",
    "email-client", "calendar", "note-taking", "task-management",
    "project-management", "password-manager", "file-manager", "media-player",
    "podcast", "photo-gallery", "video-editor", "screen-recorder", "pdf",
    "ocr", "qr-code", "weather", "rss-reader", "url-shortener", "seo",
    "analytics", "feature-flags", "dependency-injection", "build-tool",
    "bundler", "transpiler", "linter", "code-formatter", "static-analysis",
    "documentation-generator", "api-documentation",
]

REPOS_PER_TOPIC = 100      # GitHub search caps per_page at 100
# GitHub's search API hard-caps results at 1000 per query regardless of
# paging (page * per_page <= 1000), so pages=10 pulls the maximum possible
# per topic -- needed to have any chance at ~125,000 repos across the
# expanded topic list above. Popular topics will hit the full 1000; niche
# ones will fall short and just contribute fewer, smaller districts.
SEARCH_PAGES_PER_TOPIC = 10
# GitHub's actual rate limit (5000 req/hour, enforced with a sleep-until-
# reset retry in github_client.py) is what really paces this run, not this
# sleep -- at ~125,000 repos and ~2-4 requests each (contributors +
# participation), that's tens of hours no matter what. This sleep only
# needs to be polite between consecutive repo-detail calls, not a rate
# limiter in its own right, so it's kept small rather than adding hours of
# its own on top of the rate-limit-bound total.
SLEEP_BETWEEN_REPOS = 0.1


def insert_repo(conn: sqlite3.Connection, repo: dict, topic: str,
                 contributor_count: int, recent_commit_activity: int,
                 height: float, width: float) -> int:
    """Insert a repo row and return its id."""
    cursor = conn.execute(
        """
        INSERT INTO repos (
            full_name, owner, name, description, stars, forks,
            language, topics, district, contributor_count,
            recent_commit_activity, height, width, created_at, pushed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            repo["full_name"],
            repo["owner"]["login"],
            repo["name"],
            repo.get("description"),
            repo.get("stargazers_count", 0),
            repo.get("forks_count", 0),
            repo.get("language"),
            ",".join(repo.get("topics", [])),
            topic,
            contributor_count,
            recent_commit_activity,
            height,
            width,
            repo.get("created_at"),
            repo.get("pushed_at"),
        ),
    )
    conn.commit()
    return cursor.lastrowid


def insert_contributor(conn: sqlite3.Connection, repo_id: int,
                        username: str, contributions: int,
                        floor: int, room_number: str) -> None:
    conn.execute(
        """
        INSERT INTO contributors (
            repo_id, github_username, contributions, floor, room_number
        ) VALUES (?, ?, ?, ?, ?)
        """,
        (repo_id, username, contributions, floor, room_number),
    )
    conn.commit()


def run() -> None:
    init_db()
    conn = sqlite3.connect(DB_PATH)
    client = GitHubClient()

    # Load repos already tracked from a prior run so this run only spends
    # API budget on genuinely new ones, instead of re-fetching contributors
    # and participation stats for 503 repos just to fail on a duplicate
    # full_name insert at the end. Also what makes this run safe to kill and
    # restart at any point -- expected, since a ~125,000-repo crawl at
    # GitHub's rate limit realistically spans multiple days and will likely
    # outlive any single terminal session.
    seen_full_names = {row[0] for row in conn.execute("SELECT full_name FROM repos")}
    starting_count = len(seen_full_names)
    print(f"[pipeline] {starting_count} repos already tracked, skipping those, adding new ones")

    total_repos_saved = 0
    total_contributors_saved = 0
    run_start = time.time()
    PROGRESS_EVERY = 100  # print a rate/ETA summary every N newly-saved repos

    for topic in TOPICS:
        print(f"[topic] {topic}")
        try:
            repos = client.search_repos_by_topic(topic, per_page=REPOS_PER_TOPIC, pages=SEARCH_PAGES_PER_TOPIC)
        except Exception as exc:
            print(f"  ! failed to search topic {topic}: {exc}")
            continue

        for repo in repos:
            full_name = repo.get("full_name")

            if full_name in seen_full_names:
                print(f"  - skipping {full_name} (already seen)")
                continue
            seen_full_names.add(full_name)

            try:
                owner = repo["owner"]["login"]
                name = repo["name"]

                print(f"  + processing {full_name}")

                contributors = client.get_contributors(owner, name, max_pages=3)
                recent_commit_activity = client.get_participation(owner, name)

                height = compute_scale(repo.get("stargazers_count", 0))
                width = compute_scale(repo.get("forks_count", 0))

                repo_id = insert_repo(
                    conn, repo, topic,
                    contributor_count=len(contributors),
                    recent_commit_activity=recent_commit_activity,
                    height=height,
                    width=width,
                )
                total_repos_saved += 1

                for floor, contributor in enumerate(contributors):
                    username = contributor.get("login", "")
                    contributions = contributor.get("contributions", 0)
                    room_number = assign_room(username, floor)

                    insert_contributor(
                        conn, repo_id, username, contributions,
                        floor, room_number,
                    )
                    total_contributors_saved += 1

                print(
                    f"    saved {full_name} "
                    f"({len(contributors)} contributors, "
                    f"{recent_commit_activity} recent commits)"
                )

                if total_repos_saved % PROGRESS_EVERY == 0:
                    elapsed_hours = (time.time() - run_start) / 3600
                    rate = total_repos_saved / elapsed_hours if elapsed_hours > 0 else 0
                    print(
                        f"[pipeline] progress: {total_repos_saved} new repos saved "
                        f"({starting_count + total_repos_saved} total tracked) in "
                        f"{elapsed_hours:.1f}h -- ~{rate:.0f} repos/hour"
                    )

            except Exception as exc:
                print(f"  ! failed on {full_name}: {exc}")
                continue

            time.sleep(SLEEP_BETWEEN_REPOS)

    conn.close()

    print("\n--- Summary ---")
    print(f"New repos saved this run: {total_repos_saved}")
    print(f"New contributors saved this run: {total_contributors_saved}")
    print(f"Total repos now tracked: {starting_count + total_repos_saved}")


if __name__ == "__main__":
    run()
