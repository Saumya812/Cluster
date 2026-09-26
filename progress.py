"""Learner progress for educational district cities (building-level)."""

from __future__ import annotations

from typing import Any

from learner_db import learner_connect

HARDCODED_USER_ID = 1


def get_district_progress(
    district: str,
    user_id: int = HARDCODED_USER_ID,
) -> list[dict[str, Any]]:
    with learner_connect() as conn:
        rows = conn.execute(
            """
            SELECT district, building_id, subtopics_done, quiz_score
            FROM user_progress
            WHERE user_id = ? AND district = ?
            ORDER BY building_id
            """,
            (user_id, district),
        ).fetchall()

    return [
        {
            "district": row["district"],
            "building_id": row["building_id"],
            "subtopics_done": int(row["subtopics_done"]),
            "quiz_score": float(row["quiz_score"]),
        }
        for row in rows
    ]


def set_subtopics_done(
    district: str,
    building_id: str,
    subtopics_done: int,
    user_id: int = HARDCODED_USER_ID,
) -> dict[str, Any]:
    subtopics_done = max(0, int(subtopics_done))
    with learner_connect() as conn:
        conn.execute(
            """
            INSERT INTO user_progress (user_id, district, building_id, subtopics_done, quiz_score)
            VALUES (?, ?, ?, ?, 0)
            ON CONFLICT(user_id, district, building_id) DO UPDATE SET
              subtopics_done = MAX(user_progress.subtopics_done, excluded.subtopics_done)
            """,
            (user_id, district, building_id, subtopics_done),
        )
        row = conn.execute(
            """
            SELECT district, building_id, subtopics_done, quiz_score
            FROM user_progress
            WHERE user_id = ? AND district = ? AND building_id = ?
            """,
            (user_id, district, building_id),
        ).fetchone()

    return {
        "district": row["district"],
        "building_id": row["building_id"],
        "subtopics_done": int(row["subtopics_done"]),
        "quiz_score": float(row["quiz_score"]),
    }


def save_building_quiz(
    district: str,
    building_id: str,
    score: float,
    user_id: int = HARDCODED_USER_ID,
) -> dict[str, Any]:
    score = max(0.0, min(100.0, float(score)))
    with learner_connect() as conn:
        conn.execute(
            """
            INSERT INTO user_progress (user_id, district, building_id, subtopics_done, quiz_score)
            VALUES (?, ?, ?, 0, ?)
            ON CONFLICT(user_id, district, building_id) DO UPDATE SET
              quiz_score = MAX(user_progress.quiz_score, excluded.quiz_score)
            """,
            (user_id, district, building_id, score),
        )
        row = conn.execute(
            """
            SELECT district, building_id, subtopics_done, quiz_score
            FROM user_progress
            WHERE user_id = ? AND district = ? AND building_id = ?
            """,
            (user_id, district, building_id),
        ).fetchone()

    return {
        "district": row["district"],
        "building_id": row["building_id"],
        "subtopics_done": int(row["subtopics_done"]),
        "quiz_score": float(row["quiz_score"]),
        "submitted_score": score,
    }


def get_level_progress(
    city: str,
    user_id: int = HARDCODED_USER_ID,
) -> list[dict[str, Any]]:
    with learner_connect() as conn:
        rows = conn.execute(
            """
            SELECT city, level_id, completed, quiz_score
            FROM level_progress
            WHERE user_id = ? AND city = ?
            ORDER BY level_id
            """,
            (user_id, city),
        ).fetchall()
    return [
        {
            "city": row["city"],
            "level_id": row["level_id"],
            "completed": bool(row["completed"]),
            "quiz_score": float(row["quiz_score"]),
        }
        for row in rows
    ]


def save_level_progress(
    city: str,
    level_id: str,
    *,
    completed: bool = False,
    quiz_score: float = 0.0,
    user_id: int = HARDCODED_USER_ID,
) -> dict[str, Any]:
    quiz_score = max(0.0, min(100.0, float(quiz_score)))
    with learner_connect() as conn:
        conn.execute(
            """
            INSERT INTO level_progress (user_id, city, level_id, completed, quiz_score)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, city, level_id) DO UPDATE SET
              completed = MAX(level_progress.completed, excluded.completed),
              quiz_score = MAX(level_progress.quiz_score, excluded.quiz_score)
            """,
            (user_id, city, level_id, 1 if completed else 0, quiz_score),
        )
        row = conn.execute(
            """
            SELECT city, level_id, completed, quiz_score
            FROM level_progress
            WHERE user_id = ? AND city = ? AND level_id = ?
            """,
            (user_id, city, level_id),
        ).fetchone()
    return {
        "city": row["city"],
        "level_id": row["level_id"],
        "completed": bool(row["completed"]),
        "quiz_score": float(row["quiz_score"]),
    }


def sync_level_completion(
    city: str,
    level_id: str,
    subtopic_building_ids: list[str],
    user_id: int = HARDCODED_USER_ID,
) -> dict[str, Any]:
    """Mark level completed when every subtopic building has a quiz score."""
    if not subtopic_building_ids:
        return {"city": city, "level_id": level_id, "completed": False, "quiz_score": 0.0}

    progress = {
        p["building_id"]: p
        for p in get_district_progress(city, user_id=user_id)
    }
    scores = []
    for bid in subtopic_building_ids:
        row = progress.get(bid)
        score = float(row["quiz_score"]) if row else 0.0
        if score <= 0:
            return {
                "city": city,
                "level_id": level_id,
                "completed": False,
                "quiz_score": 0.0,
                "done": len(scores),
                "total": len(subtopic_building_ids),
            }
        scores.append(score)

    avg = sum(scores) / len(scores)
    return save_level_progress(city, level_id, completed=True, quiz_score=avg, user_id=user_id)


def get_roadmap_prefs(city: str, user_id: int = HARDCODED_USER_ID) -> dict[str, Any]:
    with learner_connect() as conn:
        row = conn.execute(
            """
            SELECT city, tutorial_dismissed, last_level_id
            FROM roadmap_prefs
            WHERE user_id = ? AND city = ?
            """,
            (user_id, city),
        ).fetchone()
    if not row:
        return {
            "city": city,
            "tutorial_dismissed": False,
            "last_level_id": None,
        }
    return {
        "city": row["city"],
        "tutorial_dismissed": bool(row["tutorial_dismissed"]),
        "last_level_id": row["last_level_id"],
    }


def save_roadmap_prefs(
    city: str,
    *,
    tutorial_dismissed: bool | None = None,
    last_level_id: str | None = None,
    user_id: int = HARDCODED_USER_ID,
) -> dict[str, Any]:
    current = get_roadmap_prefs(city, user_id=user_id)
    dismissed = (
        True
        if tutorial_dismissed
        else bool(current["tutorial_dismissed"])
    )
    last = current["last_level_id"] if last_level_id is None else last_level_id
    with learner_connect() as conn:
        conn.execute(
            """
            INSERT INTO roadmap_prefs (user_id, city, tutorial_dismissed, last_level_id)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, city) DO UPDATE SET
              tutorial_dismissed = excluded.tutorial_dismissed,
              last_level_id = excluded.last_level_id
            """,
            (user_id, city, 1 if dismissed else 0, last),
        )
    return get_roadmap_prefs(city, user_id=user_id)
