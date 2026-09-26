"""Educational city topics schema helpers + queries."""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from db import DB_PATH, init_db

CITIES = ("ml", "ai", "programming", "web")

CITY_META = {
    "ml": {
        "id": "ml",
        "label": "Machine Learning",
        "description": "Supervised, unsupervised, neural nets & RL topic towers.",
        "accent": "#3de7ff",
        "streets": ["ML Street", "Supervised Ave", "Unsupervised Blvd", "Neural Net Ave", "RL Street"],
    },
    "ai": {
        "id": "ai",
        "label": "Artificial Intelligence",
        "description": "Agents, NLP, vision, reasoning, and AI systems skyline.",
        "accent": "#a78bfa",
        "streets": ["Agent Row", "NLP Lane", "Vision Ave", "Reasoning Blvd", "Systems Street"],
    },
    "programming": {
        "id": "programming",
        "label": "Programming",
        "description": "Languages, data structures, systems, and craft as a city.",
        "accent": "#ffb347",
        "streets": ["Syntax Street", "Data Structures Ave", "Algorithms Blvd", "Systems Way", "Craft Lane"],
    },
    "web": {
        "id": "web",
        "label": "Web Development",
        "description": "Frontend, backend, APIs, and full-stack districts.",
        "accent": "#34d399",
        "streets": ["HTML Street", "CSS Ave", "JavaScript Blvd", "API Way", "Full-Stack Lane"],
    },
}


def _connect() -> sqlite3.Connection:
    init_db(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def list_topics(city: str) -> list[dict[str, Any]]:
    if city not in CITIES:
        raise ValueError(f"Unknown city: {city}")
    conn = _connect()
    try:
        rows = conn.execute(
            """
            SELECT id, city, topic_name, subtopics, street
            FROM topics
            WHERE city = ?
            ORDER BY id
            """,
            (city,),
        ).fetchall()
    finally:
        conn.close()

    out = []
    for row in rows:
        try:
            subs = json.loads(row["subtopics"] or "[]")
        except json.JSONDecodeError:
            subs = []
        out.append(
            {
                "id": f"{row['city']}-{row['id']}",
                "dbId": row["id"],
                "city": row["city"],
                "name": row["topic_name"],
                "subtopics": subs,
                "subtopicCount": len(subs),
                "street": row["street"] or CITY_META[city]["streets"][0],
            }
        )
    return out


def upsert_topic(
    city: str,
    topic_name: str,
    subtopics: list[str],
    street: str | None = None,
) -> None:
    if city not in CITIES:
        raise ValueError(f"Unknown city: {city}")
    streets = CITY_META[city]["streets"]
    street = street or streets[hash(topic_name) % len(streets)]
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO topics (city, topic_name, subtopics, street)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(city, topic_name) DO UPDATE SET
              subtopics = excluded.subtopics,
              street = excluded.street
            """,
            (city, topic_name, json.dumps(subtopics), street),
        )
        conn.commit()
    finally:
        conn.close()


def topic_count(city: str) -> int:
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM topics WHERE city = ?", (city,)
        ).fetchone()
        return int(row["n"] if row else 0)
    finally:
        conn.close()


def clear_city_topics(city: str) -> None:
    conn = _connect()
    try:
        conn.execute("DELETE FROM topics WHERE city = ?", (city,))
        conn.commit()
    finally:
        conn.close()
