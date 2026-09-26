"""Database schema and setup for the Cluster data pipeline."""

import sqlite3

DB_PATH = "city.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT UNIQUE NOT NULL,
    owner TEXT,
    name TEXT,
    description TEXT,
    stars INTEGER,
    forks INTEGER,
    language TEXT,
    topics TEXT,
    district TEXT,
    contributor_count INTEGER,
    recent_commit_activity INTEGER,
    height REAL,
    width REAL,
    created_at TEXT,
    pushed_at TEXT
);

CREATE TABLE IF NOT EXISTS contributors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id INTEGER NOT NULL,
    github_username TEXT,
    contributions INTEGER,
    floor INTEGER,
    room_number INTEGER,
    FOREIGN KEY (repo_id) REFERENCES repos (id)
);

CREATE TABLE IF NOT EXISTS user_progress (
    user_id INTEGER NOT NULL,
    district TEXT NOT NULL,
    building_id TEXT NOT NULL,
    subtopics_done INTEGER NOT NULL DEFAULT 0,
    quiz_score REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, district, building_id)
);

CREATE TABLE IF NOT EXISTS youtube_cache (
    query TEXT PRIMARY KEY,
    playlist_id TEXT,
    title TEXT,
    thumbnail TEXT,
    channel TEXT,
    video_count INTEGER
);

CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL,
    topic_name TEXT NOT NULL,
    subtopics TEXT NOT NULL DEFAULT '[]',
    street TEXT,
    UNIQUE(city, topic_name)
);

CREATE TABLE IF NOT EXISTS search_cache (
    query TEXT PRIMARY KEY,
    results_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS papers_cache (
    query TEXT PRIMARY KEY,
    results_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_cache (
    topic TEXT NOT NULL,
    city TEXT NOT NULL,
    questions_json TEXT NOT NULL,
    PRIMARY KEY (topic, city)
);

CREATE TABLE IF NOT EXISTS topic_engagement (
    user_id INTEGER NOT NULL,
    city TEXT NOT NULL,
    building_id TEXT NOT NULL,
    opened_reading INTEGER NOT NULL DEFAULT 0,
    opened_video INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, city, building_id)
);

CREATE TABLE IF NOT EXISTS level_progress (
    user_id INTEGER NOT NULL,
    city TEXT NOT NULL,
    level_id TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    quiz_score REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, city, level_id)
);

CREATE TABLE IF NOT EXISTS roadmap_prefs (
    user_id INTEGER NOT NULL,
    city TEXT NOT NULL,
    tutorial_dismissed INTEGER NOT NULL DEFAULT 0,
    last_level_id TEXT,
    PRIMARY KEY (user_id, city)
);
"""


def init_db(db_path: str = DB_PATH) -> None:
    """Create tables if missing; migrate legacy progress schema if needed."""
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(SCHEMA)
        # Legacy MVP used (user_id, district) without building_id.
        cols = {
            row[1]
            for row in conn.execute("PRAGMA table_info(user_progress)").fetchall()
        }
        if cols and "building_id" not in cols:
            conn.execute("ALTER TABLE user_progress RENAME TO user_progress_legacy")
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS user_progress (
                    user_id INTEGER NOT NULL,
                    district TEXT NOT NULL,
                    building_id TEXT NOT NULL,
                    subtopics_done INTEGER NOT NULL DEFAULT 0,
                    quiz_score REAL NOT NULL DEFAULT 0,
                    PRIMARY KEY (user_id, district, building_id)
                );
                """
            )
            conn.commit()

        # Migrate quiz_cache from topic-only PK → (topic, city)
        quiz_cols = {
            row[1]
            for row in conn.execute("PRAGMA table_info(quiz_cache)").fetchall()
        }
        if quiz_cols and "city" not in quiz_cols:
            conn.execute("ALTER TABLE quiz_cache RENAME TO quiz_cache_legacy")
            conn.execute(
                """
                CREATE TABLE quiz_cache (
                    topic TEXT NOT NULL,
                    city TEXT NOT NULL,
                    questions_json TEXT NOT NULL,
                    PRIMARY KEY (topic, city)
                )
                """
            )
            conn.execute(
                """
                INSERT INTO quiz_cache (topic, city, questions_json)
                SELECT topic, 'ml', questions_json FROM quiz_cache_legacy
                """
            )
            conn.execute("DROP TABLE quiz_cache_legacy")
            conn.commit()

        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    init_db()
