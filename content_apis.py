"""Google Custom Search + Arxiv + Gemini quiz helpers with SQLite cache."""

from __future__ import annotations

import asyncio
import html
import json
import os
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import quote, urlparse

import httpx
from dotenv import load_dotenv

from db import DB_PATH, init_db
from learner_db import learner_connect

load_dotenv()

GOOGLE_CSE_API_KEY = os.getenv("GOOGLE_CSE_API_KEY", "").strip()
GOOGLE_CSE_ID = os.getenv("GOOGLE_CSE_ID", "d76e1a7c64f04452a").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
# Optional: keyless OpenAlex works but has a small daily budget.
OPENALEX_API_KEY = os.getenv("OPENALEX_API_KEY", "").strip()
QUIZ_GEMINI_MODEL = "gemini-1.5-flash"

_LETTER_TO_INDEX = {"a": 0, "b": 1, "c": 2, "d": 3}
_CITY_LABELS = {
    "ml": "Machine Learning",
    "ai": "Artificial Intelligence",
    "programming": "Programming",
    "web": "Web Development",
}


def _connect():
    """Legacy helper kept for any remaining SQLite-only callers; prefer learner_connect."""
    init_db(DB_PATH)
    import sqlite3

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _cache_get_json(table: str, query: str) -> Any | None:
    with learner_connect() as conn:
        row = conn.execute(
            f"SELECT results_json FROM {table} WHERE query = ?", (query,)
        ).fetchone()
    if not row:
        return None
    try:
        return json.loads(row["results_json"])
    except json.JSONDecodeError:
        return None


def _cache_put_json(table: str, query: str, payload: Any) -> None:
    with learner_connect() as conn:
        conn.execute(
            f"""
            INSERT INTO {table} (query, results_json) VALUES (?, ?)
            ON CONFLICT(query) DO UPDATE SET results_json = excluded.results_json
            """,
            (query, json.dumps(payload)),
        )


_HTTP_HEADERS = {"User-Agent": "PathwayIsle/1.0 (https://pathwayisle.com; educational app)"}
_LEVEL_LABEL_RE = re.compile(r"\bLevel\s+\d+\s*:?", re.IGNORECASE)
_google_error_logged = False


def _clean_topic_query(query: str) -> str:
    """'Activation Threshold Machine Learning · Level 1: Perceptron' -> 'Activation Threshold Perceptron'.

    Subject labels and 'Level N:' prefixes drown the topic in Wikipedia/arXiv relevance.
    """
    cleaned = _LEVEL_LABEL_RE.sub(" ", query.replace("·", " "))
    for label in _CITY_LABELS.values():
        cleaned = re.sub(rf"\b{re.escape(label)}\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or query


async def wikipedia_search(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Keyless fallback for the Reading tab."""
    query = _clean_topic_query((query or "").strip())
    if not query:
        return []
    cache_key = f"wiki:{query}"
    cached = _cache_get_json("search_cache", cache_key)
    if cached:
        return cached

    params = {
        "action": "query",
        "list": "search",
        "srsearch": query,
        "srlimit": min(limit, 10),
        "format": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=_HTTP_HEADERS, follow_redirects=True) as client:
            resp = await client.get("https://en.wikipedia.org/w/api.php", params=params)
            resp.raise_for_status()
            hits = resp.json().get("query", {}).get("search") or []
    except (httpx.HTTPError, ValueError) as exc:
        print(f"[content_apis] Wikipedia search failed for {query!r}: {exc!r}")
        return []

    results = []
    for hit in hits[:limit]:
        title = hit.get("title") or "Wikipedia"
        snippet = html.unescape(re.sub(r"<[^>]+>", "", hit.get("snippet") or ""))
        results.append(
            {
                "title": title,
                "link": f"https://en.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}",
                "snippet": snippet,
                "displayLink": "en.wikipedia.org",
            }
        )
    if results:
        _cache_put_json("search_cache", cache_key, results)
    return results


async def google_search(query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Google Custom Search, falling back to Wikipedia when CSE is unavailable."""
    global _google_error_logged
    query = (query or "").strip()
    if not query:
        return []
    cached = _cache_get_json("search_cache", query)
    if cached:
        # Ignore stale placeholder entries cached before CSE was configured.
        if not (
            len(cached) == 1
            and "Add GOOGLE_CSE_API_KEY" in str((cached[0] or {}).get("snippet") or "")
        ):
            return cached

    if not GOOGLE_CSE_API_KEY or not GOOGLE_CSE_ID:
        return await wikipedia_search(query, limit)

    params = {
        "key": GOOGLE_CSE_API_KEY,
        "cx": GOOGLE_CSE_ID,
        "q": query,
        "num": min(limit, 10),
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get("https://www.googleapis.com/customsearch/v1", params=params)
    except httpx.HTTPError as exc:
        print(f"[content_apis] Google search request failed: {exc!r}")
        return await wikipedia_search(query, limit)
    if resp.status_code != 200:
        if not _google_error_logged:
            _google_error_logged = True
            try:
                message = resp.json().get("error", {}).get("message", "")
            except ValueError:
                message = resp.text[:200]
            print(
                f"[content_apis] Google Custom Search returned {resp.status_code} ({message}); "
                "using Wikipedia for Reading results."
            )
        return await wikipedia_search(query, limit)
    items = resp.json().get("items") or []
    if not items:
        return await wikipedia_search(query, limit)

    results = []
    for item in items[:limit]:
        link = item.get("link") or ""
        host = urlparse(link).netloc.replace("www.", "")
        results.append(
            {
                "title": item.get("title") or "Result",
                "link": link,
                "snippet": item.get("snippet") or "",
                "displayLink": item.get("displayLink") or host,
            }
        )
    _cache_put_json("search_cache", query, results)
    return results


def _openalex_abstract(inverted: dict[str, list[int]] | None) -> str:
    if not inverted:
        return ""
    words = sorted((pos, word) for word, positions in inverted.items() for pos in positions)
    return " ".join(word for _, word in words)


async def openalex_search(query: str, limit: int = 3) -> list[dict[str, Any]]:
    """Keyless scholarly search — faster and far less rate-limited than arXiv."""
    query = _clean_topic_query((query or "").strip())
    if not query:
        return []
    cache_key = f"openalex:{query}"
    cached = _cache_get_json("papers_cache", cache_key)
    if cached:
        return cached

    params = {
        "search": query,
        "per-page": limit,
        "filter": "has_abstract:true",
        "select": "id,title,doi,publication_year,authorships,abstract_inverted_index,primary_location",
    }
    if OPENALEX_API_KEY:
        params["api_key"] = OPENALEX_API_KEY
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=_HTTP_HEADERS) as client:
            resp = await client.get("https://api.openalex.org/works", params=params)
            if resp.status_code == 429:
                # Burst limit — one short retry is usually enough.
                await asyncio.sleep(1.5)
                resp = await client.get("https://api.openalex.org/works", params=params)
            resp.raise_for_status()
            works = resp.json().get("results") or []
    except (httpx.HTTPError, ValueError) as exc:
        print(f"[content_apis] OpenAlex search failed for {query!r}: {exc!r}")
        return []

    papers = []
    for work in works[:limit]:
        summary = _openalex_abstract(work.get("abstract_inverted_index"))
        authors = [
            (a.get("author") or {}).get("display_name") or ""
            for a in (work.get("authorships") or [])[:6]
        ]
        landing = (work.get("primary_location") or {}).get("landing_page_url")
        year = work.get("publication_year")
        title = work.get("title") or "Untitled"
        papers.append(
            {
                "title": f"{title} ({year})" if year else title,
                "authors": [a for a in authors if a],
                "summary": summary[:400] + ("…" if len(summary) > 400 else ""),
                "link": work.get("doi") or landing or work.get("id") or "",
            }
        )
    if papers:
        _cache_put_json("papers_cache", cache_key, papers)
    return papers


async def paper_search(query: str, limit: int = 3) -> list[dict[str, Any]]:
    return await openalex_search(query, limit) or await arxiv_search(query, limit)


async def arxiv_search(query: str, limit: int = 3) -> list[dict[str, Any]]:
    query = (query or "").strip()
    if not query:
        return []
    cached = _cache_get_json("papers_cache", query)
    if cached:
        return cached

    terms = re.findall(r"[A-Za-z0-9]+", _clean_topic_query(query))
    params = {
        "search_query": " AND ".join(f"all:{t}" for t in terms) or f"all:{query}",
        "start": 0,
        "max_results": limit,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }
    try:
        async with httpx.AsyncClient(timeout=12.0, headers=_HTTP_HEADERS, follow_redirects=True) as client:
            resp = await client.get("https://export.arxiv.org/api/query", params=params)
            resp.raise_for_status()
            text = resp.text
        root = ET.fromstring(text)
    except (httpx.HTTPError, ET.ParseError) as exc:
        # arXiv is often slow; a timeout should read as "no papers", not a 500.
        print(f"[content_apis] arXiv search failed for {query!r}: {exc!r}")
        return []

    ns = {"a": "http://www.w3.org/2005/Atom"}
    papers = []
    for entry in root.findall("a:entry", ns)[:limit]:
        title = re.sub(r"\s+", " ", (entry.findtext("a:title", default="", namespaces=ns) or "").strip())
        summary = re.sub(
            r"\s+", " ", (entry.findtext("a:summary", default="", namespaces=ns) or "").strip()
        )
        link = ""
        for l in entry.findall("a:link", ns):
            if l.attrib.get("type") == "text/html" or l.attrib.get("rel") == "alternate":
                link = l.attrib.get("href") or link
        if not link:
            link = entry.findtext("a:id", default="", namespaces=ns)
        authors = [
            a.findtext("a:name", default="", namespaces=ns)
            for a in entry.findall("a:author", ns)
        ]
        papers.append(
            {
                "title": title,
                "authors": [a for a in authors if a],
                "summary": summary[:400] + ("…" if len(summary) > 400 else ""),
                "link": link,
            }
        )
    if papers:
        _cache_put_json("papers_cache", query, papers)
    return papers


def _quiz_cache_get(topic: str, city: str) -> list[dict] | None:
    with learner_connect() as conn:
        row = conn.execute(
            "SELECT questions_json FROM quiz_cache WHERE topic = ? AND city = ?",
            (topic, city),
        ).fetchone()
    if not row:
        return None
    try:
        data = json.loads(row["questions_json"])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, list) else None


def _quiz_cache_put(topic: str, city: str, questions: list[dict]) -> None:
    with learner_connect() as conn:
        conn.execute(
            """
            INSERT INTO quiz_cache (topic, city, questions_json) VALUES (?, ?, ?)
            ON CONFLICT(topic, city) DO UPDATE SET questions_json = excluded.questions_json
            """,
            (topic, city, json.dumps(questions)),
        )


def _fallback_quiz(topic: str) -> list[dict]:
    return [
        {
            "prompt": f"What best describes “{topic}”?",
            "choices": [
                "A learning topic with concepts and practice",
                "A database primary key",
                "A CSS unit",
                "A GPU driver",
            ],
            "correct": 0,
        },
        {
            "prompt": f"A good way to study {topic} is to…",
            "choices": [
                "Read explanations and try examples",
                "Ignore fundamentals",
                "Only memorize unrelated trivia",
                "Avoid practice problems",
            ],
            "correct": 0,
        },
        {
            "prompt": f"Which resource helps most for {topic}?",
            "choices": [
                "Tutorials, docs, and papers",
                "Random passwords",
                "Street maps only",
                "Unrelated sports scores",
            ],
            "correct": 0,
        },
        {
            "prompt": f"When stuck on {topic}, you should…",
            "choices": [
                "Revisit basics and test a small example",
                "Delete all notes",
                "Skip the topic forever",
                "Change the city name",
            ],
            "correct": 0,
        },
        {
            "prompt": f"Progress on {topic} in EduCluster updates…",
            "choices": [
                "The Growth Tower",
                "The OS kernel",
                "DNS records",
                "Printer drivers",
            ],
            "correct": 0,
        },
    ]


def _normalize_quiz_items(raw: list[dict]) -> list[dict] | None:
    """Convert Gemini (or legacy) items into UI/scoring shape: prompt/choices/correct."""
    out: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            return None
        # Already in internal format (legacy cache)
        if "prompt" in item and "choices" in item and "correct" in item:
            choices = item.get("choices") or []
            if len(choices) < 4:
                return None
            try:
                correct = int(item["correct"])
            except (TypeError, ValueError):
                return None
            if correct < 0 or correct > 3:
                return None
            out.append(
                {
                    "prompt": str(item["prompt"]),
                    "choices": [str(c) for c in choices[:4]],
                    "correct": correct,
                    "explanation": str(item.get("explanation") or ""),
                }
            )
            continue

        question = item.get("question")
        options = item.get("options")
        correct_letter = str(item.get("correct") or "").strip().lower()
        if not question or not isinstance(options, dict) or correct_letter not in _LETTER_TO_INDEX:
            return None
        choices = [
            str(options.get("a", "")),
            str(options.get("b", "")),
            str(options.get("c", "")),
            str(options.get("d", "")),
        ]
        if any(not c for c in choices):
            return None
        out.append(
            {
                "prompt": str(question),
                "choices": choices,
                "correct": _LETTER_TO_INDEX[correct_letter],
                "explanation": str(item.get("explanation") or ""),
            }
        )
    if len(out) < 5:
        return None
    return out[:5]


def _call_gemini_quiz(topic: str, city_label: str) -> list[dict] | None:
    """Call Gemini; return Gemini-format question list or None on failure."""
    if not GEMINI_API_KEY:
        return None
    try:
        import google.generativeai as genai
    except ImportError:
        return None

    prompt = (
        f'Generate 5 multiple choice quiz questions about "{topic}" '
        f'in the context of learning "{city_label}".\n'
        "Return ONLY a JSON array with no extra text, no markdown, no backticks.\n"
        "Each item must have:\n"
        '- "question": the question text\n'
        '- "options": object with keys "a", "b", "c", "d" as answer choices\n'
        '- "correct": the correct answer letter ("a", "b", "c", or "d")\n'
        '- "explanation": one sentence explaining why the correct answer is right'
    )

    # Prefer requested model; fall through to currently available Flash models.
    models_to_try = (
        QUIZ_GEMINI_MODEL,
        "gemini-2.5-flash",
        "gemini-flash-latest",
    )

    try:
        genai.configure(api_key=GEMINI_API_KEY)
        text = ""
        last_err: Exception | None = None
        for model_name in models_to_try:
            try:
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(
                    prompt,
                    generation_config={
                        "temperature": 0.4,
                        "max_output_tokens": 2048,
                    },
                )
                text = (getattr(response, "text", None) or "").strip()
                if text:
                    break
            except Exception as exc:  # noqa: BLE001 — try next model
                last_err = exc
                continue
        if not text:
            if last_err:
                return None
            return None

        match = re.search(r"\[.*\]", text, re.S)
        raw = match.group(0) if match else text
        data = json.loads(raw)
        if not isinstance(data, list) or len(data) < 5:
            return None
        for item in data[:5]:
            if not isinstance(item, dict):
                return None
            opts = item.get("options")
            if (
                not item.get("question")
                or not isinstance(opts, dict)
                or str(item.get("correct") or "").strip().lower() not in _LETTER_TO_INDEX
                or not all(str(opts.get(k, "")).strip() for k in ("a", "b", "c", "d"))
            ):
                return None
        return data[:5]
    except Exception:
        return None


async def generate_quiz(topic: str, city: str = "ml") -> list[dict]:
    topic = (topic or "").strip()
    city = (city or "ml").strip().lower() or "ml"
    if not topic:
        return []

    city_label = _CITY_LABELS.get(city, city)

    cached = _quiz_cache_get(topic, city)
    if cached is not None:
        normalized = _normalize_quiz_items(cached)
        if normalized:
            return normalized

    gemini_items = _call_gemini_quiz(topic, city_label)
    if gemini_items:
        _quiz_cache_put(topic, city, gemini_items)
        normalized = _normalize_quiz_items(gemini_items)
        if normalized:
            return normalized

    return _fallback_quiz(topic)


def mark_engagement(
    city: str,
    building_id: str,
    *,
    reading: bool = False,
    video: bool = False,
    user_id: int = 1,
) -> dict[str, Any]:
    with learner_connect() as conn:
        conn.execute(
            """
            INSERT INTO topic_engagement (user_id, city, building_id, opened_reading, opened_video)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, city, building_id) DO UPDATE SET
              opened_reading = MAX(topic_engagement.opened_reading, excluded.opened_reading),
              opened_video = MAX(topic_engagement.opened_video, excluded.opened_video)
            """,
            (user_id, city, building_id, 1 if reading else 0, 1 if video else 0),
        )
        row = conn.execute(
            """
            SELECT opened_reading, opened_video FROM topic_engagement
            WHERE user_id = ? AND city = ? AND building_id = ?
            """,
            (user_id, city, building_id),
        ).fetchone()
    return {
        "opened_reading": bool(row["opened_reading"]),
        "opened_video": bool(row["opened_video"]),
        "quiz_unlocked": bool(row["opened_reading"] or row["opened_video"]),
    }


def get_engagement(city: str, building_id: str, user_id: int = 1) -> dict[str, Any]:
    with learner_connect() as conn:
        row = conn.execute(
            """
            SELECT opened_reading, opened_video FROM topic_engagement
            WHERE user_id = ? AND city = ? AND building_id = ?
            """,
            (user_id, city, building_id),
        ).fetchone()
    if not row:
        return {"opened_reading": False, "opened_video": False, "quiz_unlocked": False}
    return {
        "opened_reading": bool(row["opened_reading"]),
        "opened_video": bool(row["opened_video"]),
        "quiz_unlocked": bool(row["opened_reading"] or row["opened_video"]),
    }
