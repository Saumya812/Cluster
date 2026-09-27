"""Hand-written quizzes: 5 questions for every subtopic of every level.

Each city module defines ``LEVELS = {level_id: {subtopic_name: [question, ...]}}``
where a question is ``(prompt, correct_answer, [wrong, wrong, wrong], explanation)``.
"""

from __future__ import annotations

import random

from level_curriculum import get_city_levels, get_level

from . import ai, ml, programming, web

QUESTIONS_PER_TOPIC = 5

_BANK: dict[str, dict[str, dict[str, list[tuple]]]] = {
    "ml": ml.LEVELS,
    "ai": ai.LEVELS,
    "programming": programming.LEVELS,
    "web": web.LEVELS,
}


def _parse_building_id(building_id: str) -> tuple[str, str, int] | None:
    """``"{city}-{level_id}-s{index}-{slug}"`` → (city, level_id, index)."""
    parts = (building_id or "").split("-")
    if len(parts) < 3 or not parts[1].startswith("l") or not parts[2].startswith("s"):
        return None
    try:
        index = int(parts[2][1:])
    except ValueError:
        return None
    return parts[0], parts[1], index


def _build_questions(key: str, raw: list[tuple]) -> list[dict]:
    out = []
    for prompt, answer, wrong, explanation in raw:
        choices = [answer, *wrong]
        # Seeded per question so GET /api/quiz and submit always agree.
        random.Random(f"{key}|{prompt}").shuffle(choices)
        out.append(
            {
                "prompt": prompt,
                "choices": choices,
                "correct": choices.index(answer),
                "explanation": explanation,
            }
        )
    return out


def bank_quiz_for_building(city: str, building_id: str) -> list[dict] | None:
    """Questions for a level-city topic building, or None if not in the bank."""
    parsed = _parse_building_id(building_id)
    if not parsed:
        return None
    id_city, level_id, index = parsed
    city = (city or id_city).strip().lower()
    level = get_level(city, level_id)
    if not level or index >= len(level["subtopics"]):
        return None
    subtopic = level["subtopics"][index]
    raw = _BANK.get(city, {}).get(level_id, {}).get(subtopic)
    if not raw:
        return None
    return _build_questions(f"{city}:{level_id}:{subtopic}", raw)


def validate_bank() -> list[str]:
    """Problems with bank coverage/shape (empty list means complete)."""
    problems = []
    for city, levels in _BANK.items():
        for level in get_city_levels(city):
            topics = levels.get(level["id"], {})
            for subtopic in level["subtopics"]:
                qs = topics.get(subtopic)
                where = f"{city} {level['id']} {subtopic!r}"
                if not qs:
                    problems.append(f"{where}: missing")
                    continue
                if len(qs) != QUESTIONS_PER_TOPIC:
                    problems.append(f"{where}: {len(qs)} questions")
                for q in qs:
                    if len(q) != 4 or len(q[2]) != 3 or q[1] in q[2]:
                        problems.append(f"{where}: bad question {q[0][:40]!r}")
            extra = set(topics) - set(level["subtopics"])
            if extra:
                problems.append(f"{city} {level['id']}: unknown subtopics {sorted(extra)}")
    return problems
