"""Live GitHub push-event feed for the Cluster city.

Loads tracked repos from city.db, polls the GitHub Events API for a
rotating slice of them every 30 seconds, and broadcasts new PushEvents to
any connected WebSocket clients so the 3D city can react in near-real-time.

Also serves the interactive map + Gemini tour-guide HTTP API used by the
frontend HUD.

Run with:
    uvicorn live_server:app --port 8002 --reload
"""

import asyncio
import json
import os
import sqlite3
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from content_apis import (
    paper_search,
    generate_quiz,
    get_engagement,
    google_search,
    mark_engagement,
)
from career_outcomes import CITY_JOB_FAMILIES, get_career_outcomes, load_career_outcomes
from curriculum import score_building_quiz
from db import DB_PATH, init_db
from edu_topics import CITY_META, list_topics, topic_count
from guide import ask_guide, is_configured as gemini_configured
from progress import (
    get_district_progress,
    get_level_progress,
    get_roadmap_prefs,
    save_building_quiz,
    save_roadmap_prefs,
    set_subtopics_done,
    sync_level_completion,
)
from level_curriculum import building_id_for, get_city_levels, get_level
from quiz_bank import bank_quiz_for_building
from youtube_search import search_playlists, search_playlist, search_videos, youtube_configured
from narration import narration_configured, narration_last_error, synthesize_speech
from learner_db import ensure_backend, using_tiger
from backboard_memory import (
    close_backboard,
    init_backboard,
    schedule_record_completion,
    schedule_session_sync,
)

# Python block-buffers stdout when it isn't a terminal (e.g. redirected to a
# log file, or run under some process managers), so print() output from the
# poll loop can sit invisible in a buffer for a long time. Line-buffer it so
# every cycle's activity shows up immediately, not just on process exit.
sys.stdout.reconfigure(line_buffering=True)

load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
API_BASE = "https://api.github.com"

BATCH_SIZE = 30        # repos checked per poll cycle
POLL_INTERVAL = 30      # seconds between cycles
# At 503 repos this was a ~12.6 minute full sweep. The city has since grown
# to 4180 repos -- at the same BATCH_SIZE=20 that becomes ~105 minutes, and
# cranking BATCH_SIZE further to compensate blows straight through GitHub's
# 5000 req/hour limit (e.g. BATCH_SIZE=150 here would be 18000 req/hour).
# Real fix: conditional requests (ETags, below) -- GitHub does not count a
# request against your rate limit if it comes back 304 Not Modified, which
# is what most repos return most cycles. BATCH_SIZE=30 is sized to stay
# safely under the rate limit even in the worst case (a cold cache, every
# request a real 200) -- 30/30s = 3600 req/hour, leaving headroom for
# pipeline.py or manual testing sharing the same token. Full sweep is ~70
# minutes cold, but every repo gets progressively cheaper to recheck once
# its ETag is cached, so this is safe to raise later without new risk.

# --- In-memory state -------------------------------------------------------

tracked_repos: list[dict] = []       # [{full_name, owner, name}, ...]
seen_event_ids: set[str] = set()      # dedupe across polls
etags: dict[str, str] = {}            # full_name -> ETag from its last 200 response
connected_clients: set[WebSocket] = set()
_batch_cursor = 0
district_catalog: list[dict[str, Any]] = []


def load_tracked_repos() -> list[dict]:
    """Load (full_name, owner, name) for every repo in city.db."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("SELECT full_name, owner, name FROM repos").fetchall()
    finally:
        conn.close()
    return [dict(row) for row in rows]


def load_district_catalog() -> list[dict[str, Any]]:
    """Aggregate district stats for the interactive map + Gemini guide.

    Positions come from city.json when present (the laid-out city the
    frontend actually flies through). Falls back to name-only stats from
    the DB if the export file is missing.
    """
    city_path = Path(__file__).resolve().parent / "frontend" / "public" / "city.json"
    if city_path.exists():
        data = json.loads(city_path.read_text(encoding="utf-8"))
        repos = data.get("repos", [])
        by_district: dict[str, dict[str, Any]] = {}
        for repo in repos:
            name = repo.get("district") or "unknown"
            bucket = by_district.setdefault(
                name,
                {
                    "name": name,
                    "repo_count": 0,
                    "stars": 0,
                    "sum_x": 0.0,
                    "sum_z": 0.0,
                },
            )
            bucket["repo_count"] += 1
            bucket["stars"] += int(repo.get("stars") or 0)
            bucket["sum_x"] += float(repo.get("x") or 0)
            bucket["sum_z"] += float(repo.get("z") or 0)

        catalog = []
        for bucket in by_district.values():
            n = max(bucket["repo_count"], 1)
            catalog.append(
                {
                    "name": bucket["name"],
                    "repo_count": bucket["repo_count"],
                    "stars": bucket["stars"],
                    "cx": bucket["sum_x"] / n,
                    "cz": bucket["sum_z"] / n,
                }
            )
        catalog.sort(key=lambda d: d["stars"], reverse=True)
        return catalog

    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(
            """
            SELECT district AS name,
                   COUNT(*) AS repo_count,
                   COALESCE(SUM(stars), 0) AS stars
            FROM repos
            GROUP BY district
            ORDER BY stars DESC
            """
        ).fetchall()
    finally:
        conn.close()
    return [
        {
            "name": row[0],
            "repo_count": row[1],
            "stars": row[2],
            "cx": 0.0,
            "cz": 0.0,
        }
        for row in rows
    ]


def next_batch() -> list[dict]:
    """Return the next rotating slice of ~BATCH_SIZE repos, wrapping around."""
    global _batch_cursor

    if not tracked_repos:
        return []

    n = len(tracked_repos)
    start = _batch_cursor % n
    end = start + BATCH_SIZE

    if end <= n:
        batch = tracked_repos[start:end]
    else:
        batch = tracked_repos[start:n] + tracked_repos[0 : end - n]

    _batch_cursor = end % n
    return batch


async def broadcast(message: dict) -> None:
    """Send a JSON message to every connected WebSocket client, dropping any that fail."""
    dead = set()
    for client in connected_clients:
        try:
            await client.send_json(message)
        except Exception:
            dead.add(client)
    connected_clients.difference_update(dead)


async def fetch_push_events(client: httpx.AsyncClient, repo: dict) -> int:
    """Fetch recent events for one repo, broadcasting any new PushEvents.

    Returns the number of new push events found, and prints exactly what it
    saw for this repo -- new events (with pusher + timestamp), "not
    modified" (a free conditional-request hit), or "no new events" -- so
    the poll loop's activity is visible in the console.
    """
    url = f"{API_BASE}/repos/{repo['owner']}/{repo['name']}/events"
    full_name = repo["full_name"]

    request_headers = {"If-None-Match": etags[full_name]} if full_name in etags else {}

    try:
        response = await client.get(url, headers=request_headers)
    except httpx.HTTPError as exc:
        print(f"[live_server]   {full_name}: request failed ({exc})")
        return 0

    if response.status_code == 304:
        # Nothing changed since our last check -- and per GitHub's docs,
        # a 304 from a conditional request does NOT count against the
        # rate limit, so this check was effectively free.
        print(f"[live_server]   {full_name}: not modified (free check)")
        return 0
    if response.status_code == 403:
        print(f"[live_server]   {full_name}: rate limited, skipping this cycle")
        return 0
    if response.status_code != 200:
        print(f"[live_server]   {full_name}: HTTP {response.status_code}")
        return 0

    if "ETag" in response.headers:
        etags[full_name] = response.headers["ETag"]

    new_event_count = 0
    for event in response.json():
        if event.get("type") != "PushEvent":
            continue

        event_id = event.get("id")
        if event_id is None or event_id in seen_event_ids:
            continue
        seen_event_ids.add(event_id)
        new_event_count += 1

        pusher_username = event.get("actor", {}).get("login", "unknown")
        timestamp = event.get("created_at") or datetime.now(timezone.utc).isoformat()

        print(f"[live_server]   {repo['full_name']}: NEW PushEvent -- {pusher_username} @ {timestamp}")

        await broadcast(
            {
                "repo": repo["full_name"],
                "username": pusher_username,
                "timestamp": timestamp,
            }
        )

    if new_event_count == 0:
        print(f"[live_server]   {repo['full_name']}: no new events")

    return new_event_count


_cycle_number = 0


async def poll_cycle(client: httpx.AsyncClient) -> None:
    global _cycle_number
    _cycle_number += 1

    batch = next_batch()
    if not batch:
        print(f"[live_server] cycle {_cycle_number}: no tracked repos loaded, skipping")
        return

    names = ", ".join(repo["full_name"] for repo in batch)
    print(f"[live_server] cycle {_cycle_number}: checking {len(batch)} repos -> {names}")

    results = await asyncio.gather(*(fetch_push_events(client, repo) for repo in batch))

    total_new = sum(results)
    print(f"[live_server] cycle {_cycle_number}: done -- {total_new} new push event(s) broadcast")


async def poll_loop() -> None:
    print(f"[live_server] poll loop starting -- checking {BATCH_SIZE} repos every {POLL_INTERVAL}s")
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {GITHUB_TOKEN}" if GITHUB_TOKEN else "",
    }
    async with httpx.AsyncClient(headers=headers, timeout=10) as client:
        while True:
            try:
                await poll_cycle(client)
            except Exception as exc:
                print(f"[live_server] poll cycle failed: {exc}")
            await asyncio.sleep(POLL_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(DB_PATH)
    backend = ensure_backend()
    tracked_repos.extend(load_tracked_repos())
    district_catalog.clear()
    district_catalog.extend(load_district_catalog())
    print(f"[live_server] loaded {len(tracked_repos)} tracked repos from {DB_PATH}")
    print(f"[live_server] map catalog: {len(district_catalog)} districts")
    print(
        f"[live_server] learner store: "
        f"{'TigerData (postgres)' if using_tiger() else 'SQLite fallback'} ({backend})"
    )
    print(
        f"[live_server] YouTube playlists: "
        f"{'ready' if youtube_configured() else 'waiting for YOUTUBE_API_KEY'}"
    )
    print(
        f"[live_server] Gemini guide: "
        f"{'ready' if gemini_configured() else 'waiting for GEMINI_API_KEY'}"
    )
    await init_backboard()
    try:
        await asyncio.to_thread(load_career_outcomes)
    except Exception as exc:
        print(f"[live_server] career outcomes failed to load: {exc}")

    task = asyncio.create_task(poll_loop())
    print(f"[live_server] background poll task created: {task.get_name()} (done={task.done()})")
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        await close_backboard()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GuideRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    near_district: str | None = None


class QuizSubmitRequest(BaseModel):
    answers: list[int] = Field(min_length=1, max_length=10)


class EduQuizSubmitRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    city: str = Field(min_length=1, max_length=40)
    building_id: str = Field(min_length=1, max_length=120)
    answers: list[int] = Field(min_length=1, max_length=10)


class EngagementRequest(BaseModel):
    city: str
    building_id: str
    kind: str = Field(description="reading | video")


class RoadmapPrefsRequest(BaseModel):
    city: str = Field(min_length=1, max_length=40)
    tutorial_dismissed: bool | None = None
    last_level_id: str | None = None


class NarrateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class SubtopicProgressRequest(BaseModel):
    subtopics_done: int = Field(ge=0, le=50)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "gemini": gemini_configured(),
        "youtube": youtube_configured(),
        "elevenlabs": narration_configured(),
        "elevenlabs_error": narration_last_error(),
        "districts": len(district_catalog),
        "topics": {cid: topic_count(cid) for cid in CITY_META},
    }


@app.get("/api/levels")
async def api_levels(city: str = "ml") -> dict:
    levels = get_city_levels(city)
    if not levels:
        return {"error": f"Unknown city: {city}", "city": city, "levels": []}

    rows = {r["level_id"]: r for r in get_level_progress(city)}
    building_prog = {
        p["building_id"]: p for p in get_district_progress(city)
    }

    out = []
    prev_completed = True
    for level in levels:
        lp = rows.get(level["id"]) or {}
        completed = bool(lp.get("completed"))
        building_ids = [
            building_id_for(city, level["id"], name, i)
            for i, name in enumerate(level["subtopics"])
        ]
        done = sum(
            1 for bid in building_ids if float((building_prog.get(bid) or {}).get("quiz_score") or 0) > 0
        )
        total = len(building_ids) or 1
        pct = done / total
        # Auto-heal completion if all quizzes done but row missing
        if not completed and done == total:
            synced = sync_level_completion(city, level["id"], building_ids)
            completed = bool(synced.get("completed"))
            lp = synced

        state = "locked"
        if completed:
            state = "completed"
        elif prev_completed:
            state = "current"

        out.append(
            {
                **level,
                "state": state,
                "completed": completed,
                "quiz_score": float(lp.get("quiz_score") or 0),
                "subtopics_done": done,
                "subtopics_total": total,
                "progress_pct": pct,
                "building_ids": building_ids,
            }
        )
        prev_completed = completed

    meta = CITY_META.get(city, {})
    return {
        "city": city,
        "label": meta.get("label", city),
        "accent": meta.get("accent", "#3de7ff"),
        "levels": out,
        "count": len(out),
    }


@app.get("/api/levels/{city}/{level_id}")
async def api_level_detail(city: str, level_id: str) -> dict:
    level = get_level(city, level_id)
    if not level:
        return {"error": "Level not found"}
    payload = await api_levels(city)
    match = next((L for L in payload.get("levels") or [] if L["id"] == level_id), None)
    return {"city": city, "level": match or level}


@app.get("/api/roadmap/prefs")
async def api_get_roadmap_prefs(city: str = "ml") -> dict:
    # Session open: rehydrate Tiger from Backboard memory (no new endpoint).
    schedule_session_sync()
    return get_roadmap_prefs(city)


@app.post("/api/roadmap/prefs")
async def api_post_roadmap_prefs(req: RoadmapPrefsRequest) -> dict:
    return save_roadmap_prefs(
        req.city,
        tutorial_dismissed=req.tutorial_dismissed,
        last_level_id=req.last_level_id,
    )


@app.get("/api/career-outcomes")
async def api_career_outcomes(city: str = "ml", level: str | None = None) -> dict:
    if city not in CITY_JOB_FAMILIES:
        return {"error": f"Unknown city: {city}", "city": city}
    data = get_career_outcomes(city)
    if not data:
        return {"error": "Career outcomes dataset unavailable", "city": city}
    label = CITY_META.get(city, {}).get("label", city)
    if level:
        level_data = (data.get("levels") or {}).get(level)
        if not level_data:
            return {"error": f"Unknown level: {level}", "city": city}
        return {"city": city, "label": label, "level": level, **level_data}
    return {**data, "label": label}


@app.post("/api/narrate")
async def api_narrate(req: NarrateRequest):
    audio = await synthesize_speech(req.text)
    if not audio:
        return Response(status_code=204)
    return Response(content=audio, media_type="audio/mpeg")


@app.get("/api/topics")
async def api_topics(city: str = "ml") -> dict:
    try:
        topics = list_topics(city)
    except ValueError as exc:
        return {"error": str(exc), "topics": []}
    meta = CITY_META.get(city, {})
    return {
        "city": city,
        "label": meta.get("label", city),
        "streets": meta.get("streets", []),
        "topics": topics,
        "count": len(topics),
    }


@app.get("/api/youtube")
async def api_youtube(query: str = "", limit: int = 3, type: str = "playlist") -> dict:
    """YouTube playlists (default) or videos."""
    if type == "video":
        return await search_videos(query, limit=min(max(limit, 1), 5))
    if limit <= 1:
        return await search_playlist(query)
    return await search_playlists(query, limit=min(max(limit, 1), 5))


@app.get("/api/search")
async def api_search(query: str = "") -> dict:
    results = await google_search(query, limit=5)
    return {"query": query, "results": results}


@app.get("/api/papers")
async def api_papers(query: str = "") -> dict:
    results = await paper_search(query, limit=3)
    return {"query": query, "results": results}


async def _quiz_questions(topic: str, city: str, building_id: str = "") -> tuple[list[dict], str]:
    """Hand-written bank for level topics; Gemini/fallback for anything else."""
    banked = bank_quiz_for_building(city, building_id) if building_id else None
    if banked:
        return banked, "bank"
    return await generate_quiz(topic, city=city), "generated"


@app.get("/api/quiz")
async def api_quiz(topic: str = "", city: str = "ml", building_id: str = "") -> dict:
    questions, source = await _quiz_questions(topic, city, building_id)
    # Hide answers from client; scoring happens on submit.
    public = [
        {"prompt": q.get("prompt"), "choices": q.get("choices") or []}
        for q in questions
    ]
    return {"topic": topic, "city": city, "source": source, "questions": public}


@app.post("/api/quiz/submit")
async def api_quiz_submit(req: EduQuizSubmitRequest) -> dict:
    questions, _ = await _quiz_questions(req.topic, req.city, req.building_id)
    if len(req.answers) != len(questions):
        return {"error": "answers length mismatch"}
    correct_count = 0
    review = []
    for ans, q in zip(req.answers, questions):
        correct = int(q.get("correct", -1))
        if ans == correct:
            correct_count += 1
        review.append({"correct": correct, "explanation": q.get("explanation") or ""})
    total = len(questions) or 1
    score = (correct_count / total) * 100.0
    result = save_building_quiz(req.city, req.building_id, score)
    result["correct_count"] = correct_count
    result["total"] = total
    result["submitted_score"] = score
    result["review"] = review

    # building_id: "{city}-{level_id}-s{n}-..."
    parts = req.building_id.split("-")
    level_id = None
    level_num = None
    if len(parts) >= 2 and parts[1].startswith("l"):
        level_id = parts[1]
        try:
            level_num = int(parts[1][1:])
        except ValueError:
            level_num = parts[1]
    if level_id:
        level = get_level(req.city, level_id)
        if level:
            bids = [
                building_id_for(req.city, level_id, name, i)
                for i, name in enumerate(level["subtopics"])
            ]
            level_row = sync_level_completion(req.city, level_id, bids)
            result["level"] = level_row

    schedule_record_completion(
        city=req.city,
        topic=req.topic or req.building_id,
        level=level_num if level_num is not None else level_id,
        score=score,
    )
    return result


@app.post("/api/engagement")
async def api_engagement(req: EngagementRequest) -> dict:
    kind = req.kind.lower().strip()
    return mark_engagement(
        req.city,
        req.building_id,
        reading=(kind == "reading"),
        video=(kind in {"video", "videos", "visualization"}),
    )


@app.get("/api/engagement")
async def api_get_engagement(city: str, building_id: str) -> dict:
    return get_engagement(city, building_id)


@app.get("/api/progress/{district}")
async def api_get_district_progress(district: str) -> dict:
    """Building-level progress for hardcoded user_id=1."""
    rows = get_district_progress(district)
    return {"user_id": 1, "district": district, "progress": rows}


@app.post("/api/progress/{district}/{building_id}/subtopic")
async def api_subtopic_progress(
    district: str,
    building_id: str,
    req: SubtopicProgressRequest,
) -> dict:
    return set_subtopics_done(district, building_id, req.subtopics_done)


@app.post("/api/progress/{district}/{building_id}/quiz")
async def api_building_quiz(
    district: str,
    building_id: str,
    req: QuizSubmitRequest,
) -> dict:
    try:
        score, correct_count, total = score_building_quiz(
            district, building_id, req.answers
        )
        result = save_building_quiz(district, building_id, score)
    except ValueError as exc:
        return {"error": str(exc)}
    result["correct_count"] = correct_count
    result["total"] = total
    parts = building_id.split("-")
    level_num = None
    if len(parts) >= 2 and parts[1].startswith("l"):
        try:
            level_num = int(parts[1][1:])
        except ValueError:
            level_num = parts[1]
    schedule_record_completion(
        city=district,
        topic=building_id,
        level=level_num,
        score=score,
    )
    return result


# Legacy no-op endpoints kept so old clients don't 404 hard during transition.
@app.get("/api/progress")
async def api_get_progress_legacy() -> dict:
    return {"user_id": 1, "progress": get_district_progress("ml")}


@app.get("/api/map/districts")
async def map_districts() -> dict:
    """District centers + stats for the interactive city map."""
    return {"districts": district_catalog}


@app.post("/api/guide")
async def guide(req: GuideRequest) -> dict:
    """Ask the Gemini tour guide about the city / nearby district."""
    return await ask_guide(
        req.question,
        districts=district_catalog,
        near_district=req.near_district,
    )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    connected_clients.add(websocket)
    try:
        while True:
            # Clients aren't expected to send anything; this just keeps the
            # connection open and lets us detect disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        connected_clients.discard(websocket)


# Production: serve the built frontend (`npm run build`) from this same server,
# so the site, /api and /ws share one origin. Mounted last so API routes win.
FRONTEND_DIST = Path(__file__).resolve().parent / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
