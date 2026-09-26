"""YouTube Data API v3 — playlists & videos with learner-store cache."""

from __future__ import annotations

import json
import os
from typing import Any
from urllib.parse import quote

import httpx
from dotenv import load_dotenv

from learner_db import learner_connect

load_dotenv()

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "").strip()
SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
PLAYLISTS_URL = "https://www.googleapis.com/youtube/v3/playlists"


def youtube_configured() -> bool:
    return bool(YOUTUBE_API_KEY)


def _list_cache_get(cache_key: str) -> list[dict] | None:
    with learner_connect() as conn:
        row = conn.execute(
            "SELECT results_json FROM search_cache WHERE query = ?",
            (cache_key,),
        ).fetchone()
    if not row:
        return None
    try:
        data = json.loads(row["results_json"])
        return data if isinstance(data, list) else None
    except json.JSONDecodeError:
        return None


def _list_cache_put(cache_key: str, results: list[dict]) -> None:
    with learner_connect() as conn:
        conn.execute(
            """
            INSERT INTO search_cache (query, results_json) VALUES (?, ?)
            ON CONFLICT(query) DO UPDATE SET results_json = excluded.results_json
            """,
            (cache_key, json.dumps(results)),
        )


async def _playlist_details(client: httpx.AsyncClient, playlist_ids: list[str]) -> dict[str, dict]:
    if not playlist_ids or not YOUTUBE_API_KEY:
        return {}
    resp = await client.get(
        PLAYLISTS_URL,
        params={
            "part": "snippet,contentDetails",
            "id": ",".join(playlist_ids),
            "key": YOUTUBE_API_KEY,
        },
    )
    out: dict[str, dict] = {}
    if resp.status_code != 200:
        return out
    for item in resp.json().get("items") or []:
        pid = item.get("id")
        snip = item.get("snippet") or {}
        thumbs = snip.get("thumbnails") or {}
        thumb = (thumbs.get("medium") or thumbs.get("high") or thumbs.get("default") or {}).get("url") or ""
        out[pid] = {
            "title": snip.get("title") or "Playlist",
            "channelTitle": snip.get("channelTitle") or "",
            "thumbnail": thumb,
            "videoCount": int(item.get("contentDetails", {}).get("itemCount") or 0),
        }
    return out


async def search_playlists(query: str, limit: int = 3) -> dict[str, Any]:
    query = (query or "").strip()
    if not query:
        return {"results": [], "empty": True}

    cache_key = f"yt:playlists:{limit}:{query}"
    cached = _list_cache_get(cache_key)
    if cached is not None:
        return {"results": cached, "cached": True, "empty": len(cached) == 0}

    if not YOUTUBE_API_KEY:
        return {
            "results": [],
            "empty": True,
            "error": "YOUTUBE_API_KEY not configured",
            "fallbackUrl": f"https://www.youtube.com/results?search_query={quote(query)}",
        }

    params = {
        "part": "snippet",
        "type": "playlist",
        "q": query,
        "maxResults": limit,
        "key": YOUTUBE_API_KEY,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(SEARCH_URL, params=params)
        if resp.status_code != 200:
            _list_cache_put(cache_key, [])
            return {
                "results": [],
                "empty": True,
                "error": f"YouTube search HTTP {resp.status_code}",
                "fallbackUrl": f"https://www.youtube.com/results?search_query={quote(query)}",
            }
        items = resp.json().get("items") or []
        ids = [it.get("id", {}).get("playlistId") for it in items if it.get("id", {}).get("playlistId")]
        details = await _playlist_details(client, ids)

    results = []
    for it in items:
        pid = it.get("id", {}).get("playlistId")
        if not pid:
            continue
        snip = it.get("snippet") or {}
        thumbs = snip.get("thumbnails") or {}
        thumb = (thumbs.get("medium") or thumbs.get("high") or thumbs.get("default") or {}).get("url") or ""
        detail = details.get(pid) or {}
        results.append(
            {
                "playlistId": pid,
                "title": detail.get("title") or snip.get("title") or "Playlist",
                "thumbnail": detail.get("thumbnail") or thumb,
                "channelTitle": detail.get("channelTitle") or snip.get("channelTitle") or "",
                "videoCount": detail.get("videoCount"),
                "url": f"https://www.youtube.com/playlist?list={pid}",
                "kind": "playlist",
            }
        )

    _list_cache_put(cache_key, results)
    return {"results": results, "empty": len(results) == 0, "cached": False}


async def search_videos(query: str, limit: int = 2) -> dict[str, Any]:
    query = (query or "").strip()
    if not query:
        return {"results": [], "empty": True}

    cache_key = f"yt:videos:{limit}:{query}"
    cached = _list_cache_get(cache_key)
    if cached is not None:
        return {"results": cached, "cached": True, "empty": len(cached) == 0}

    if not YOUTUBE_API_KEY:
        return {
            "results": [],
            "empty": True,
            "fallbackUrl": f"https://www.youtube.com/results?search_query={quote(query)}",
        }

    params = {
        "part": "snippet",
        "type": "video",
        "q": query,
        "maxResults": limit,
        "key": YOUTUBE_API_KEY,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(SEARCH_URL, params=params)
        if resp.status_code != 200:
            _list_cache_put(cache_key, [])
            return {"results": [], "empty": True}

        results = []
        for it in resp.json().get("items") or []:
            vid = it.get("id", {}).get("videoId")
            if not vid:
                continue
            snip = it.get("snippet") or {}
            thumbs = snip.get("thumbnails") or {}
            thumb = (thumbs.get("medium") or thumbs.get("high") or thumbs.get("default") or {}).get("url") or ""
            results.append(
                {
                    "videoId": vid,
                    "title": snip.get("title") or "Video",
                    "thumbnail": thumb,
                    "channelTitle": snip.get("channelTitle") or "",
                    "url": f"https://www.youtube.com/watch?v={vid}",
                    "kind": "video",
                }
            )

    _list_cache_put(cache_key, results)
    return {"results": results, "empty": len(results) == 0, "cached": False}


async def search_playlist(query: str) -> dict[str, Any]:
    """Backward-compatible single playlist result."""
    data = await search_playlists(query, limit=1)
    results = data.get("results") or []
    if not results:
        return {
            "empty": True,
            "error": data.get("error"),
            "fallbackUrl": data.get("fallbackUrl")
            or f"https://www.youtube.com/results?search_query={quote(query)}",
        }
    top = results[0]
    return {**top, "empty": False, "cached": data.get("cached", False)}
