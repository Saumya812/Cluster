"""ElevenLabs text-to-speech with on-disk cache."""

from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "").strip()
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM").strip() or "21m00Tcm4TlvDq8ikWAM"
ELEVENLABS_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_monolingual_v1").strip() or "eleven_monolingual_v1"
ELEVENLABS_URL = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"

# Prefer /tmp/narration_cache; fall back to system temp on Windows.
_TMP = Path("/tmp/narration_cache")
if os.name == "nt" and not _TMP.parent.exists():
    CACHE_DIR = Path(tempfile.gettempdir()) / "narration_cache"
else:
    CACHE_DIR = _TMP


def narration_configured() -> bool:
    return bool(ELEVENLABS_API_KEY)


def _cache_path(text: str) -> Path:
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return CACHE_DIR / f"{digest}.mp3"


async def synthesize_speech(text: str) -> bytes | None:
    """Return MPEG audio bytes for text, or None on failure / missing key."""
    text = (text or "").strip()
    if not text or not ELEVENLABS_API_KEY:
        return None

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(text)
    if path.is_file() and path.stat().st_size > 0:
        try:
            return path.read_bytes()
        except OSError:
            pass

    payload = {
        "text": text,
        "model_id": ELEVENLABS_MODEL,
        "voice_settings": {
            "stability": 0.4,
            "similarity_boost": 0.75,
        },
    }
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(ELEVENLABS_URL, headers=headers, json=payload)
            if resp.status_code != 200:
                return None
            audio = resp.content
            if not audio:
                return None
            try:
                path.write_bytes(audio)
            except OSError:
                pass
            return audio
    except Exception:
        return None
