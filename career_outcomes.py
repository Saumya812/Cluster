"""
Career outcomes per learning city, from the HackUMBC 2026 DoIT synthetic dataset.

Parses alumni.csv, employment_history.csv and student_experience.csv once
(stdlib csv only) and keeps per-city and per-level summaries in memory.
"""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path
from typing import Any

from level_skill_map import LEVEL_SKILLS

DATA_DIR = Path(__file__).resolve().parent / "data" / "hackumbc-2026-main" / "data"
NA = "Not Applicable"

# Requested family -> job_family values that actually exist in the dataset.
FAMILY_ALIASES: dict[str, list[str]] = {
    "Data & Analytics": ["Data & Analytics"],
    "Software Engineering": ["Software Engineering"],
    "Research": ["Machine Learning & AI"],
    "IT & Systems": ["Infrastructure & Cloud", "IT Support & Operations"],
    "Product & Design": ["IT Business & Product"],
}

CITY_JOB_FAMILIES: dict[str, list[str]] = {
    "ml": ["Data & Analytics", "Software Engineering"],
    "ai": ["Data & Analytics", "Research"],
    "programming": ["Software Engineering", "IT & Systems"],
    "web": ["Software Engineering", "Product & Design"],
}

INTERNSHIP_TYPES = {"Internship", "Co-op"}

# (highest level number, seniority_level values): later islands lead to more senior roles.
LEVEL_SENIORITY: list[tuple[int, set[str]]] = [
    (3, {"Entry"}),
    (4, {"Entry", "Mid"}),
    (7, {"Mid"}),
    (8, {"Mid", "Senior"}),
    (10, {"Senior", "Lead"}),
]
MIN_TITLE_SPELLS = 10
MIN_LEVEL_SAMPLE = 30
DIVERSITY_FLOOR = 0.05
_SEASON_ORDER = {"Spring": 0, "Summer": 1, "Fall": 2}

_cache: dict[str, dict[str, Any]] = {}


def _read(name: str) -> list[dict[str, str]]:
    with open(DATA_DIR / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _term_key(term: str) -> int | None:
    parts = (term or "").split()
    if len(parts) != 2 or parts[0] not in _SEASON_ORDER or not parts[1].isdigit():
        return None
    return int(parts[1]) * 3 + _SEASON_ORDER[parts[0]]


def _dataset_families(city: str) -> set[str]:
    out: set[str] = set()
    for fam in CITY_JOB_FAMILIES[city]:
        out.update(FAMILY_ALIASES.get(fam, [fam]))
    return out


def _top(counter: Counter, n: int) -> list[str]:
    return [name for name, _ in counter.most_common(n)]


def _level_band(level_id: str) -> set[str]:
    n = int(level_id.lstrip("l") or 1)
    for max_level, band in LEVEL_SENIORITY:
        if n <= max_level:
            return band
    return LEVEL_SENIORITY[-1][1]


def _level_outcomes(
    city: str, jobs: list[dict[str, str]], interned_before_grad: set[str]
) -> dict[str, dict[str, Any]]:
    """
    Per level: rank job titles by how strongly their roles call for the level's
    skills (support x precision) within a seniority band that rises with level.
    Adjacent levels avoid repeating the previous level's two headline titles.
    """
    out: dict[str, dict[str, Any]] = {}
    prev_pair: list[str] = []
    for level_id, skill_list in LEVEL_SKILLS.get(city, {}).items():
        skills = set(skill_list)
        band = _level_band(level_id)
        pool = [j for j in jobs if j["seniority_level"] in band]

        title_total: Counter = Counter(j["job_title"] for j in pool)
        support: Counter = Counter()
        for j in pool:
            overlap = len(skills & j["_tags"])
            if overlap:
                support[j["job_title"]] += overlap
        score = {
            t: s * s / (title_total[t] * len(skills))
            for t, s in support.items()
            if title_total[t] >= MIN_TITLE_SPELLS
        }
        ranked = sorted(score, key=lambda t: -score[t])
        if ranked:
            best = score[ranked[0]]
            fresh = [t for t in ranked if t not in prev_pair and score[t] >= DIVERSITY_FLOOR * best]
            if not fresh and ranked[0] in prev_pair[:1] and len(ranked) > 1:
                fresh = [ranked[1]]
            ranked = fresh[:2] + [t for t in ranked if t not in fresh[:2]]
        prev_pair = ranked[:2]

        need = min(2, len(skills))
        matched = [j for j in pool if len(skills & j["_tags"]) >= need]
        if len(matched) < MIN_LEVEL_SAMPLE:
            matched = [j for j in pool if skills & j["_tags"]]
        salaries = [int(j["annual_salary_usd"]) for j in matched if j["annual_salary_usd"].isdigit()]
        people = {j["campus_id"] for j in matched}

        out[level_id] = {
            "skills": skill_list,
            "seniority": sorted(band),
            "top_job_titles": ranked[:5],
            "avg_salary": round(sum(salaries) / len(salaries)) if salaries else None,
            "top_employers": _top(Counter(j["employer"] for j in matched), 3),
            "top_regions": _top(Counter(j["region"] for j in matched), 3),
            "internship_pct": (
                round(100 * len(people & interned_before_grad) / len(people)) if people else None
            ),
            "sample_size": len(matched),
        }
    return out


def load_career_outcomes() -> dict[str, dict[str, Any]]:
    """Parse the CSVs and precompute every city's summary. Safe to call again."""
    _cache.clear()
    if not DATA_DIR.is_dir():
        print(f"[career_outcomes] dataset not found at {DATA_DIR}")
        return _cache

    alumni = _read("alumni.csv")
    jobs = _read("employment_history.csv")
    experience = _read("student_experience.csv")
    for j in jobs:
        j["_tags"] = set(filter(None, j["role_skill_tags"].split("|")))

    grad_term = {a["campus_id"]: _term_key(a["graduation_term"]) for a in alumni}
    interned_before_grad: set[str] = set()
    for rec in experience:
        if rec["experience_type"] not in INTERNSHIP_TYPES:
            continue
        cid = rec["campus_id"]
        grad = grad_term.get(cid)
        term = _term_key(rec["term"])
        if grad is not None and term is not None and term <= grad:
            interned_before_grad.add(cid)

    for city in CITY_JOB_FAMILIES:
        families = _dataset_families(city)

        titles: Counter = Counter()
        employers: Counter = Counter()
        for j in jobs:
            if j["job_family"] in families:
                titles[j["job_title"]] += 1
                employers[j["employer"]] += 1

        cohort = [a for a in alumni if a["first_job_family"] in families]
        salaries = [
            int(a["first_job_annual_salary_usd"])
            for a in cohort
            if a["first_job_annual_salary_usd"] not in ("", NA)
        ]
        regions = Counter(
            a["first_job_region"] for a in cohort if a["first_job_region"] not in ("", NA)
        )
        interned = sum(1 for a in cohort if a["campus_id"] in interned_before_grad)

        _cache[city] = {
            "city": city,
            "job_families": CITY_JOB_FAMILIES[city],
            "dataset_job_families": sorted(families),
            "top_job_titles": _top(titles, 5),
            "avg_first_salary": round(sum(salaries) / len(salaries)) if salaries else None,
            "top_employers": _top(employers, 3),
            "top_regions": _top(regions, 3),
            "internship_pct": round(100 * interned / len(cohort)) if cohort else None,
            "sample_size": len(cohort),
            "levels": _level_outcomes(city, jobs, interned_before_grad),
        }

    print(
        f"[career_outcomes] cached {len(_cache)} cities from "
        f"{len(alumni)} alumni / {len(jobs)} jobs / {len(experience)} experiences"
    )
    return _cache


def get_career_outcomes(city: str) -> dict[str, Any] | None:
    if not _cache:
        load_career_outcomes()
    return _cache.get(city)
