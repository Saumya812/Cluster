"""Gemini-powered city tour guide (free AI Studio API key).

Uses the Generative Language API over HTTP so we don't need an extra SDK.
Set GEMINI_API_KEY in .env (from https://aistudio.google.com/apikey).
"""

from __future__ import annotations

import os
from typing import Any

import httpx

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
# Fast, free-tier friendly default. Override with GEMINI_MODEL if needed.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip()
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)

SYSTEM_PROMPT = """You are the in-world tour guide for CLUSTER — a flyable night city
where every skyscraper is a real GitHub repository, grouped into topic districts
(like neighborhoods). Speak briefly, vividly, and like a game narrator (2-4 short
sentences max unless asked for more). Never invent fake repo names. If the player
asks where to go, suggest a real district from the city context provided. Prefer
actionable tips: fly to X, look for Y, what that district is known for."""


def is_configured() -> bool:
    return bool(GEMINI_API_KEY)


def build_city_context(districts: list[dict[str, Any]]) -> str:
    """Compact district digest for the model (keeps token use low)."""
    lines = []
    for d in districts[:80]:
        lines.append(
            f"- {d['name']}: {d['repo_count']} towers, "
            f"{d['stars']:,} stars, center=({d['cx']:.0f},{d['cz']:.0f})"
        )
    return "DISTRICTS IN THIS CITY:\n" + "\n".join(lines)


async def ask_guide(
    question: str,
    *,
    districts: list[dict[str, Any]],
    near_district: str | None = None,
) -> dict[str, Any]:
    if not GEMINI_API_KEY:
        return {
            "ok": False,
            "error": "missing_key",
            "answer": (
                "Add GEMINI_API_KEY to your .env file "
                "(free key: https://aistudio.google.com/apikey), then restart the server."
            ),
        }

    context = build_city_context(districts)
    location = f"\nPlayer is near district: {near_district}." if near_district else ""
    user_text = f"{context}{location}\n\nPlayer asks: {question.strip()}"

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_text}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 220,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                GEMINI_URL,
                params={"key": GEMINI_API_KEY},
                json=payload,
            )
    except httpx.HTTPError as exc:
        return {"ok": False, "error": "network", "answer": f"Guide radio static: {exc}"}

    if response.status_code != 200:
        detail = response.text[:280]
        return {
            "ok": False,
            "error": f"http_{response.status_code}",
            "answer": f"Guide couldn't reach Gemini ({response.status_code}). {detail}",
        }

    data = response.json()
    try:
        answer = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, TypeError):
        return {"ok": False, "error": "bad_response", "answer": "Guide went quiet — try again."}

    return {"ok": True, "answer": answer, "model": GEMINI_MODEL}
