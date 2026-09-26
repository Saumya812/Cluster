"""Learner progress + API cache storage.

Prefers TigerData (Postgres via TIGERDATA_URL). Falls back to SQLite city.db
silently if Tiger is unavailable. City pipeline tables (repos, topics, …)
stay on SQLite.
"""

from __future__ import annotations

import os
import re
import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator

from dotenv import load_dotenv

from db import DB_PATH, init_db

load_dotenv()

TIGERDATA_URL = (
    os.getenv("TIGERDATA_URL", "").strip()
    or os.getenv("TIMESCALE_SERVICE_URL", "").strip()
)

_backend: str | None = None  # "postgres" | "sqlite"
_postgres_ready = False
_migrated_once = False

LEARNER_TABLES = (
    "user_progress",
    "level_progress",
    "roadmap_prefs",
    "topic_engagement",
    "quiz_cache",
    "search_cache",
    "papers_cache",
    "youtube_cache",
    "backboard_user_threads",
)

PG_SCHEMA = """
CREATE TABLE IF NOT EXISTS user_progress (
    user_id INTEGER NOT NULL,
    district TEXT NOT NULL,
    building_id TEXT NOT NULL,
    subtopics_done INTEGER NOT NULL DEFAULT 0,
    quiz_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, district, building_id)
);

CREATE TABLE IF NOT EXISTS level_progress (
    user_id INTEGER NOT NULL,
    city TEXT NOT NULL,
    level_id TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    quiz_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, city, level_id)
);

CREATE TABLE IF NOT EXISTS roadmap_prefs (
    user_id INTEGER NOT NULL,
    city TEXT NOT NULL,
    tutorial_dismissed INTEGER NOT NULL DEFAULT 0,
    last_level_id TEXT,
    PRIMARY KEY (user_id, city)
);

CREATE TABLE IF NOT EXISTS topic_engagement (
    user_id INTEGER NOT NULL,
    city TEXT NOT NULL,
    building_id TEXT NOT NULL,
    opened_reading INTEGER NOT NULL DEFAULT 0,
    opened_video INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, city, building_id)
);

CREATE TABLE IF NOT EXISTS quiz_cache (
    topic TEXT NOT NULL,
    city TEXT NOT NULL,
    questions_json TEXT NOT NULL,
    PRIMARY KEY (topic, city)
);

CREATE TABLE IF NOT EXISTS search_cache (
    query TEXT PRIMARY KEY,
    results_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS papers_cache (
    query TEXT PRIMARY KEY,
    results_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS youtube_cache (
    query TEXT PRIMARY KEY,
    playlist_id TEXT,
    title TEXT,
    thumbnail TEXT,
    channel TEXT,
    video_count INTEGER
);

CREATE TABLE IF NOT EXISTS backboard_user_threads (
    user_id INTEGER PRIMARY KEY,
    assistant_id TEXT NOT NULL,
    thread_id TEXT NOT NULL
);
"""


def _adapt_sql(sql: str, backend: str) -> str:
    """Translate SQLite-flavored SQL to the active backend."""
    if backend == "sqlite":
        return sql
    out = sql
    out = out.replace("?", "%s")
    out = re.sub(r"\bexcluded\.", "EXCLUDED.", out, flags=re.IGNORECASE)
    out = re.sub(
        r"MAX\(([^,]+),\s*EXCLUDED\.([^)]+)\)",
        r"GREATEST(\1, EXCLUDED.\2)",
        out,
        flags=re.IGNORECASE,
    )
    return out


def _try_postgres() -> bool:
    global _postgres_ready
    if not TIGERDATA_URL:
        return False
    try:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(TIGERDATA_URL, connect_timeout=8) as conn:
            conn.execute(PG_SCHEMA)
            conn.commit()
        _postgres_ready = True
        return True
    except Exception:
        _postgres_ready = False
        return False


def ensure_backend() -> str:
    """Pick postgres if Tiger is reachable, else sqlite. Silent fallback."""
    global _backend
    if _backend is not None:
        # Re-check postgres periodically only if we fell back; keep sticky success.
        if _backend == "postgres":
            return _backend
        # Was sqlite — try promoting once more if URL exists
        if TIGERDATA_URL and _try_postgres():
            _backend = "postgres"
            _maybe_migrate_sqlite_to_postgres()
        return _backend

    if _try_postgres():
        _backend = "postgres"
        _maybe_migrate_sqlite_to_postgres()
    else:
        _backend = "sqlite"
        init_db(DB_PATH)
    return _backend


def using_tiger() -> bool:
    return ensure_backend() == "postgres"


def _sqlite_conn() -> sqlite3.Connection:
    init_db(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _pg_conn():
    import psycopg
    from psycopg.rows import dict_row

    conn = psycopg.connect(TIGERDATA_URL, connect_timeout=8)
    conn.row_factory = dict_row
    return conn


class _CursorProxy:
    """Normalize fetch results to attribute/key access like sqlite3.Row."""

    def __init__(self, backend: str, raw_cursor):
        self._backend = backend
        self._cur = raw_cursor
        self._rows: list[Any] | None = None

    def fetchone(self):
        row = self._cur.fetchone()
        return _wrap_row(row)

    def fetchall(self):
        return [_wrap_row(r) for r in self._cur.fetchall()]


def _wrap_row(row):
    if row is None:
        return None
    if isinstance(row, dict):
        return row
    # sqlite3.Row
    return row


class _ConnProxy:
    def __init__(self, backend: str, conn):
        self.backend = backend
        self._conn = conn

    def execute(self, sql: str, params: tuple | list = ()):
        adapted = _adapt_sql(sql, self.backend)
        if self.backend == "postgres":
            cur = self._conn.execute(adapted, params)
            return _CursorProxy(self.backend, cur)
        cur = self._conn.execute(adapted, params)
        return cur

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


@contextmanager
def learner_connect() -> Iterator[_ConnProxy]:
    """Yield a connection to the learner store (Tiger or SQLite fallback)."""
    backend = ensure_backend()
    if backend == "postgres":
        try:
            conn = _pg_conn()
            proxy = _ConnProxy("postgres", conn)
            try:
                yield proxy
                proxy.commit()
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
                raise
            finally:
                proxy.close()
            return
        except Exception:
            # Silent fall back for this call
            global _backend
            _backend = "sqlite"

    conn = _sqlite_conn()
    proxy = _ConnProxy("sqlite", conn)
    try:
        yield proxy
        proxy.commit()
    finally:
        proxy.close()


def _table_empty_pg(conn, table: str) -> bool:
    row = conn.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()
    n = row["n"] if isinstance(row, dict) else row[0]
    return int(n) == 0


def _maybe_migrate_sqlite_to_postgres() -> None:
    """One-time copy of learner tables from SQLite → Tiger when Tiger is empty."""
    global _migrated_once
    if _migrated_once or not TIGERDATA_URL:
        return
    _migrated_once = True
    try:
        import psycopg
        from psycopg.rows import dict_row

        init_db(DB_PATH)
        sq = sqlite3.connect(DB_PATH)
        sq.row_factory = sqlite3.Row
        pg = psycopg.connect(TIGERDATA_URL, connect_timeout=8)
        pg.row_factory = dict_row
        try:
            for table in LEARNER_TABLES:
                # Skip if SQLite table missing
                exists = sq.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                    (table,),
                ).fetchone()
                if not exists:
                    continue
                if not _table_empty_pg(pg, table):
                    continue
                rows = sq.execute(f"SELECT * FROM {table}").fetchall()
                if not rows:
                    continue
                cols = rows[0].keys()
                col_list = ", ".join(cols)
                placeholders = ", ".join(["%s"] * len(cols))
                insert = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
                for row in rows:
                    pg.execute(insert, tuple(row[c] for c in cols))
            pg.commit()
        finally:
            pg.close()
            sq.close()
    except Exception:
        # Silent — app continues with empty Tiger or SQLite fallback
        pass
