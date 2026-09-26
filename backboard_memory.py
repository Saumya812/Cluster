"""Backboard persistent memory for EduCluster learners.

One Backboard assistant + thread per user_id. Uses memory=\"Auto\".
TigerData remains the primary store; Backboard mirrors progress and can
rehydrate Tiger on session start.
"""

from __future__ import annotations

import asyncio
import os
import re
from typing import Any

from dotenv import load_dotenv

from learner_db import ensure_backend, learner_connect
from progress import (
    HARDCODED_USER_ID,
    get_district_progress,
    get_level_progress,
    get_roadmap_prefs,
    save_building_quiz,
    save_roadmap_prefs,
)

load_dotenv()

BACKBOARD_API_KEY = os.getenv("BACKBOARD_API_KEY", "").strip()
ASSISTANT_PREFIX = "EduCluster-user-"

_client = None
_lock = asyncio.Lock()
_synced_users: set[int] = set()
_ready = False

_COMPLETION_RE = re.compile(
    r"User completed (?P<topic>.+?) in (?P<city>\w+) Level (?P<level>\d+) with score (?P<score>[\d.]+)%",
    re.IGNORECASE,
)
_LAST_LEVEL_RE = re.compile(
    r"Last level visited in (?P<city>\w+):\s*(?:Level\s*)?(?P<level>\d+|l\d+)",
    re.IGNORECASE,
)
_XP_RE = re.compile(
    r"(?:Total XP|progress)\s*[:=]?\s*(?P<xp>[\d.]+)\s*%?",
    re.IGNORECASE,
)


def backboard_configured() -> bool:
    return bool(BACKBOARD_API_KEY)


def get_client():
    return _client


async def init_backboard() -> bool:
    """Initialize BackboardClient on app startup. Silent no-op if key missing."""
    global _client, _ready
    if not BACKBOARD_API_KEY:
        print("[backboard] BACKBOARD_API_KEY missing — memory disabled")
        return False
    try:
        from backboard import BackboardClient

        _client = BackboardClient(api_key=BACKBOARD_API_KEY, timeout=45)
        await ensure_user_thread(HARDCODED_USER_ID)
        await sync_user_session(HARDCODED_USER_ID, force=True)
        _ready = True
        print("[backboard] ready — persistent memory enabled")
        return True
    except Exception as exc:
        _client = None
        _ready = False
        print(f"[backboard] init failed (continuing without memory): {exc}")
        return False


async def close_backboard() -> None:
    global _client, _ready
    if _client is not None:
        try:
            await _client.aclose()
        except Exception:
            pass
    _client = None
    _ready = False


def _ensure_mapping_table() -> None:
    ensure_backend()
    with learner_connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS backboard_user_threads (
                user_id INTEGER PRIMARY KEY,
                assistant_id TEXT NOT NULL,
                thread_id TEXT NOT NULL
            )
            """
        )


def _get_mapping(user_id: int) -> dict[str, str] | None:
    _ensure_mapping_table()
    with learner_connect() as conn:
        row = conn.execute(
            "SELECT assistant_id, thread_id FROM backboard_user_threads WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        return None
    return {"assistant_id": str(row["assistant_id"]), "thread_id": str(row["thread_id"])}


def _save_mapping(user_id: int, assistant_id: str, thread_id: str) -> None:
    _ensure_mapping_table()
    with learner_connect() as conn:
        conn.execute(
            """
            INSERT INTO backboard_user_threads (user_id, assistant_id, thread_id)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              assistant_id = excluded.assistant_id,
              thread_id = excluded.thread_id
            """,
            (user_id, assistant_id, thread_id),
        )


async def ensure_user_thread(user_id: int = HARDCODED_USER_ID) -> dict[str, str] | None:
    """Create or reuse one Backboard assistant+thread for this user."""
    if _client is None:
        return None
    existing = _get_mapping(user_id)
    if existing:
        return existing

    async with _lock:
        existing = _get_mapping(user_id)
        if existing:
            return existing
        try:
            name = f"{ASSISTANT_PREFIX}{user_id}"
            assistants = await _client.list_assistants(name=name, limit=10)
            if assistants:
                assistant = assistants[0]
            else:
                assistant = await _client.create_assistant(
                    name=name,
                    description=f"Persistent learning memory for EduCluster user {user_id}",
                    system_prompt=(
                        "You are the EduCluster progress memory keeper. "
                        "Remember the user's last level per city, completed topics, "
                        "quiz scores, and overall XP/progress percentage. "
                        "When asked, summarize their learning state clearly."
                    ),
                )
            assistant_id = str(assistant.assistant_id)

            threads = await _client.list_threads_for_assistant(assistant_id, limit=5)
            if threads:
                thread = threads[0]
            else:
                thread = await _client.create_thread(assistant_id)
            thread_id = str(thread.thread_id)

            _save_mapping(user_id, assistant_id, thread_id)
            return {"assistant_id": assistant_id, "thread_id": thread_id}
        except Exception as exc:
            print(f"[backboard] ensure_user_thread failed: {exc}")
            return None


async def record_completion(
    *,
    city: str,
    topic: str,
    level: int | str | None,
    score: float,
    user_id: int = HARDCODED_USER_ID,
) -> None:
    """Send a quiz/topic completion fact into Backboard with memory=Auto."""
    if _client is None:
        return
    mapping = await ensure_user_thread(user_id)
    if not mapping:
        return

    level_num: int | str | None = level
    if isinstance(level, str):
        m = re.search(r"(\d+)", level)
        level_num = int(m.group(1)) if m else level
    if level_num is None:
        level_num = "?"

    text = (
        f"User completed {topic} in {city} Level {level_num} with score {float(score):.0f}%. "
        f"Last level visited in {city}: Level {level_num}."
    )
    try:
        await _client.add_message(
            thread_id=mapping["thread_id"],
            content=text,
            memory="Auto",
            send_to_llm="false",
            llm_provider="openai",
            model_name="gpt-4o-mini",
        )
        try:
            await _client.add_memory(
                mapping["assistant_id"],
                text,
                metadata={
                    "city": city,
                    "topic": topic,
                    "level": str(level_num),
                    "score": float(score),
                    "user_id": user_id,
                },
            )
        except Exception:
            pass
    except Exception as exc:
        print(f"[backboard] record_completion failed: {exc}")


def _level_id_from_num(n: int | str) -> str:
    if isinstance(n, str) and n.startswith("l"):
        return n
    return f"l{int(n)}"


def _apply_memories_to_tiger(user_id: int, memories: list[Any]) -> dict[str, Any]:
    """Parse Backboard memories and upsert into TigerData via progress helpers."""
    applied = {"topics": 0, "prefs": 0, "xp_hint": None}
    last_by_city: dict[str, str] = {}

    for mem in memories:
        content = getattr(mem, "content", None) or (
            mem.get("content") if isinstance(mem, dict) else ""
        ) or ""
        meta = getattr(mem, "metadata", None) or (
            mem.get("metadata") if isinstance(mem, dict) else None
        ) or {}

        m = _COMPLETION_RE.search(content)
        city = None
        topic = None
        level_id = None
        score = None
        if m:
            city = m.group("city").lower()
            topic = m.group("topic").strip()
            level_id = _level_id_from_num(m.group("level"))
            score = float(m.group("score"))
        elif meta.get("city") and meta.get("topic") and meta.get("score") is not None:
            city = str(meta["city"]).lower()
            topic = str(meta["topic"])
            level_id = _level_id_from_num(meta.get("level") or 1)
            score = float(meta["score"])

        if city and topic and score is not None:
            slug = re.sub(r"[^a-z0-9]+", "-", topic.lower()).strip("-")[:40]
            building_id = f"{city}-{level_id or 'l1'}-mem-{slug}"
            try:
                save_building_quiz(city, building_id, score, user_id=user_id)
                applied["topics"] += 1
            except Exception:
                pass
            if level_id:
                last_by_city[city] = level_id

        lm = _LAST_LEVEL_RE.search(content)
        if lm:
            city = lm.group("city").lower()
            raw = lm.group("level")
            last_by_city[city] = raw if str(raw).startswith("l") else _level_id_from_num(raw)

        xp = _XP_RE.search(content)
        if xp:
            try:
                applied["xp_hint"] = float(xp.group("xp"))
            except ValueError:
                pass

    for city, level_id in last_by_city.items():
        try:
            save_roadmap_prefs(city, last_level_id=level_id, user_id=user_id)
            applied["prefs"] += 1
        except Exception:
            pass

    return applied


def _build_tiger_snapshot(user_id: int) -> str:
    cities = ("ml", "ai", "programming", "web")
    parts = [f"EduCluster progress snapshot for user {user_id}:"]
    total_score = 0.0
    total_n = 0
    for city in cities:
        try:
            prefs = get_roadmap_prefs(city, user_id=user_id)
            if prefs.get("last_level_id"):
                parts.append(f"Last level visited in {city}: {prefs['last_level_id']}.")
            prog = get_district_progress(city, user_id=user_id)
            for p in prog:
                if float(p.get("quiz_score") or 0) > 0:
                    bid = p["building_id"]
                    lvl = bid.split("-")[1] if "-" in bid else "l1"
                    parts.append(
                        f"User completed {bid} in {city} Level {lvl} "
                        f"with score {float(p['quiz_score']):.0f}%."
                    )
                    total_score += float(p["quiz_score"])
                    total_n += 1
            levels = get_level_progress(city, user_id=user_id)
            for lv in levels:
                if lv.get("completed"):
                    parts.append(f"Completed level {lv['level_id']} in {city}.")
        except Exception:
            continue
    if total_n:
        xp = total_score / total_n
        parts.append(f"Total XP/progress: {xp:.0f}%.")
    return " ".join(parts) if len(parts) > 1 else ""


async def sync_user_session(user_id: int = HARDCODED_USER_ID, *, force: bool = False) -> dict[str, Any]:
    """Fetch Backboard memory for the user and sync into TigerData."""
    if _client is None:
        return {"ok": False, "reason": "disabled"}
    if not force and user_id in _synced_users:
        return {"ok": True, "skipped": True}

    mapping = await ensure_user_thread(user_id)
    if not mapping:
        return {"ok": False, "reason": "no_thread"}

    try:
        memories_resp = await _client.get_memories(
            mapping["assistant_id"], page=1, page_size=100
        )
        memories = list(memories_resp.memories or [])
        applied = _apply_memories_to_tiger(user_id, memories)

        snapshot = _build_tiger_snapshot(user_id)
        if snapshot:
            try:
                await _client.add_message(
                    thread_id=mapping["thread_id"],
                    content=snapshot,
                    memory="Auto",
                    send_to_llm="false",
                    llm_provider="openai",
                    model_name="gpt-4o-mini",
                )
            except Exception:
                pass

        _synced_users.add(user_id)
        return {"ok": True, "memories": len(memories), "applied": applied}
    except Exception as exc:
        print(f"[backboard] sync_user_session failed: {exc}")
        return {"ok": False, "reason": str(exc)}


def schedule_record_completion(**kwargs) -> None:
    """Fire-and-forget from sync FastAPI handlers."""
    if _client is None:
        return
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(record_completion(**kwargs))
    except RuntimeError:
        pass


def schedule_session_sync(user_id: int = HARDCODED_USER_ID) -> None:
    if _client is None:
        return
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(sync_user_session(user_id))
    except RuntimeError:
        pass
