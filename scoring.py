"""Pure scoring/mapping helpers for the Cluster data pipeline."""

import hashlib
import math


def compute_scale(value: float, scale: float = 8.0) -> float:
    """Log-scale a raw value: log(value + 1) * scale."""
    return math.log(value + 1) * scale


def assign_room(username: str, floor: int) -> str:
    """Deterministically map a username to a room number like '{floor}{2-digit-number}'."""
    digest = hashlib.sha256(username.encode("utf-8")).hexdigest()
    number = int(digest, 16) % 100
    return f"{floor}{number:02d}"
