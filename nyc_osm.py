"""Fetch a Midtown Manhattan slice from OpenStreetMap (Overpass) and
cache it as frontend/public/nyc.json for the gamified NYC mode.

Free data — no Google Maps key required.
If Overpass is down, writes a Midtown-style procedural grid so NYC mode
still works for demos. Re-run later for real footprints.

Run:  python nyc_osm.py
"""

from __future__ import annotations

import json
import math
import random
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

OUTPUT = Path("frontend/public/nyc.json")

BBOX = {
    "south": 40.7500,
    "west": -73.9900,
    "north": 40.7580,
    "east": -73.9750,
}

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
]

METERS_TO_WORLD = 0.08


def overpass_query(bbox: dict) -> str:
    s, w, n, e = bbox["south"], bbox["west"], bbox["north"], bbox["east"]
    return f"""
[out:json][timeout:90];
(
  way["building"]({s},{w},{n},{e});
  way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian"]({s},{w},{n},{e});
);
out body;
>;
out skel qt;
"""


def fetch_overpass(query: str) -> dict:
    body = urllib.parse.urlencode({"data": query}).encode("utf-8")
    last_error = None
    for url in OVERPASS_URLS:
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "User-Agent": "ClusterNYC/1.0 (hackathon demo; student project)",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            print(f"[nyc_osm] {url} failed: {exc}; trying next…")
            time.sleep(2)
    raise RuntimeError(f"All Overpass endpoints failed: {last_error}")


def project(lat: float, lon: float, lat0: float, lon0: float) -> tuple[float, float]:
    meters_per_deg_lat = 111_320.0
    meters_per_deg_lon = 111_320.0 * math.cos(math.radians(lat0))
    x = (lon - lon0) * meters_per_deg_lon * METERS_TO_WORLD
    z = -(lat - lat0) * meters_per_deg_lat * METERS_TO_WORLD
    return round(x, 3), round(z, 3)


def ring_centroid(ring: list[tuple[float, float]]) -> tuple[float, float]:
    if not ring:
        return 0.0, 0.0
    xs = [p[0] for p in ring]
    zs = [p[1] for p in ring]
    return sum(xs) / len(xs), sum(zs) / len(zs)


def footprint_size(ring: list[tuple[float, float]]) -> tuple[float, float]:
    if len(ring) < 2:
        return 4.0, 4.0
    xs = [p[0] for p in ring]
    zs = [p[1] for p in ring]
    return max(max(xs) - min(xs), 2.5), max(max(zs) - min(zs), 2.5)


def building_height(tags: dict) -> float:
    if "height" in tags:
        raw = tags["height"].replace("m", "").strip()
        try:
            return max(float(raw) * METERS_TO_WORLD, 4.0)
        except ValueError:
            pass
    if "building:levels" in tags:
        try:
            return max(float(tags["building:levels"]) * 3.2 * METERS_TO_WORLD, 4.0)
        except ValueError:
            pass
    kind = tags.get("building", "yes")
    defaults = {
        "skyscraper": 55.0,
        "commercial": 28.0,
        "office": 32.0,
        "apartments": 22.0,
        "residential": 14.0,
        "hotel": 36.0,
        "retail": 10.0,
    }
    return defaults.get(kind, 16.0)


def parse_elements(payload: dict, bbox: dict) -> dict:
    lat0 = (bbox["south"] + bbox["north"]) / 2
    lon0 = (bbox["west"] + bbox["east"]) / 2
    nodes: dict[int, tuple[float, float]] = {}
    for el in payload.get("elements", []):
        if el.get("type") == "node":
            nodes[el["id"]] = project(el["lat"], el["lon"], lat0, lon0)

    buildings = []
    streets = []
    for el in payload.get("elements", []):
        if el.get("type") != "way":
            continue
        tags = el.get("tags") or {}
        ring = [nodes[nid] for nid in (el.get("nodes") or []) if nid in nodes]
        if len(ring) < 2:
            continue
        if "building" in tags:
            cx, cz = ring_centroid(ring[:-1] if ring[0] == ring[-1] else ring)
            width, depth = footprint_size(ring)
            buildings.append(
                {
                    "id": el["id"],
                    "name": tags.get("name") or tags.get("addr:housenumber") or f"bldg-{el['id']}",
                    "x": round(cx, 3),
                    "z": round(cz, 3),
                    "width": round(min(width, 18), 3),
                    "depth": round(min(depth, 18), 3),
                    "height": round(building_height(tags), 3),
                    "kind": tags.get("building", "yes"),
                }
            )
        elif "highway" in tags:
            streets.append(
                {
                    "id": el["id"],
                    "name": tags.get("name") or tags.get("highway"),
                    "highway": tags.get("highway"),
                    "points": [{"x": x, "z": z} for x, z in ring],
                }
            )

    return {
        "meta": {
            "source": "OpenStreetMap / Overpass",
            "place": "Midtown Manhattan, New York",
            "bbox": bbox,
            "origin": {"lat": lat0, "lon": lon0},
            "meters_to_world": METERS_TO_WORLD,
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "buildings": buildings,
        "streets": streets,
    }


def generate_fallback_midtown() -> dict:
    rng = random.Random(42)
    avenue_xs = [i * 18.0 for i in range(-6, 7)]
    street_zs = [i * 12.0 for i in range(-8, 9)]
    names = [
        "Empire State", "Chrysler", "Rockefeller", "Times Tower", "Bryant Park Tower",
        "Herald Square", "Penn Plaza", "Madison Ave", "5th Ave Loft", "Broadway Hub",
    ]
    buildings = []
    bid = 1
    for ax_i, ax in enumerate(avenue_xs[:-1]):
        for sz_i, sz in enumerate(street_zs[:-1]):
            if rng.random() < 0.12:
                continue
            cx = (ax + avenue_xs[ax_i + 1]) / 2 + rng.uniform(-1.5, 1.5)
            cz = (sz + street_zs[sz_i + 1]) / 2 + rng.uniform(-1.0, 1.0)
            w = rng.uniform(5.5, 14)
            d = rng.uniform(5.0, 11)
            dist = math.hypot(cx, cz)
            h = 14 + max(0, 40 - dist * 0.35) + rng.uniform(0, 35)
            label = names[bid % len(names)] if bid % 7 == 0 else f"{100 + bid} Midtown"
            buildings.append(
                {
                    "id": bid,
                    "name": label,
                    "x": round(cx, 3),
                    "z": round(cz, 3),
                    "width": round(w, 3),
                    "depth": round(d, 3),
                    "height": round(h, 3),
                    "kind": "office" if h > 35 else "commercial",
                }
            )
            bid += 1

    streets = []
    sid = 1
    min_z, max_z = street_zs[0] - 4, street_zs[-1] + 4
    min_x, max_x = avenue_xs[0] - 4, avenue_xs[-1] + 4
    for i, ax in enumerate(avenue_xs):
        streets.append(
            {
                "id": sid,
                "name": f"Avenue {chr(65 + (i % 26))}",
                "highway": "primary" if i % 3 == 0 else "secondary",
                "points": [{"x": ax, "z": min_z}, {"x": ax, "z": max_z}],
            }
        )
        sid += 1
    for i, sz in enumerate(street_zs):
        streets.append(
            {
                "id": sid,
                "name": f"{40 + i}th Street",
                "highway": "residential",
                "points": [{"x": min_x, "z": sz}, {"x": max_x, "z": sz}],
            }
        )
        sid += 1

    return {
        "meta": {
            "source": "procedural Midtown fallback (Overpass unavailable)",
            "place": "Midtown Manhattan, New York (gamified)",
            "bbox": BBOX,
            "meters_to_world": METERS_TO_WORLD,
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "note": "Re-run python nyc_osm.py when Overpass is up for real OSM footprints.",
        },
        "buildings": buildings,
        "streets": streets,
    }


def main() -> None:
    print(f"[nyc_osm] querying Overpass for bbox {BBOX}…")
    try:
        payload = fetch_overpass(overpass_query(BBOX))
        city = parse_elements(payload, BBOX)
        if len(city["buildings"]) < 20:
            raise RuntimeError(f"too few buildings ({len(city['buildings'])})")
    except Exception as exc:
        print(f"[nyc_osm] Overpass failed ({exc}); writing Midtown fallback grid…")
        city = generate_fallback_midtown()

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(city), encoding="utf-8")
    print(
        f"[nyc_osm] wrote {len(city['buildings'])} buildings + "
        f"{len(city['streets'])} streets to {OUTPUT} "
        f"[{city['meta'].get('source')}]"
    )


if __name__ == "__main__":
    main()
