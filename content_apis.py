"""Google Custom Search + Arxiv + Gemini quiz helpers with SQLite cache."""

from __future__ import annotations

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


async def google_search(query: str, limit: int = 5) -> list[dict[str, Any]]:
    query = (query or "").strip()
    if not query:
        return []
    cached = _cache_get_json("search_cache", query)
    if cached is not None:
        # Ignore stale placeholder entries cached before CSE was configured.
        if not (
            len(cached) == 1
            and "Add GOOGLE_CSE_API_KEY" in str((cached[0] or {}).get("snippet") or "")
        ):
            return cached

    if not GOOGLE_CSE_API_KEY or not GOOGLE_CSE_ID:
        return []

    params = {
        "key": GOOGLE_CSE_API_KEY,
        "cx": GOOGLE_CSE_ID,
        "q": query,
        "num": min(limit, 10),
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get("https://www.googleapis.com/customsearch/v1", params=params)
        if resp.status_code != 200:
            return []
        items = resp.json().get("items") or []

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


async def arxiv_search(query: str, limit: int = 3) -> list[dict[str, Any]]:
    query = (query or "").strip()
    if not query:
        return []
    cached = _cache_get_json("papers_cache", query)
    if cached is not None:
        return cached

    params = {
        "search_query": f"all:{query}",
        "start": 0,
        "max_results": limit,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get("https://export.arxiv.org/api/query", params=params)
        if resp.status_code != 200:
            _cache_put_json("papers_cache", query, [])
            return []
        text = resp.text

    ns = {"a": "http://www.w3.org/2005/Atom"}
    root = ET.fromstring(text)
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
