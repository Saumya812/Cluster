"""Export city.db repos into frontend/public/city.json for the 3D scene.

Repos are grouped by district (topic). Each district gets its own "block"
arranged in a grid of grids: buildings are laid out in rows/columns within
a district, and district blocks themselves are laid out in a larger grid,
with generous gaps at both levels so streets are visible and buildings
never overlap regardless of their width.

NOTE: ASSUMED_MAX_FOOTPRINT here must match RANDOM_MAX_FOOTPRINT in
frontend/src/main.js. Building size is now fully randomized in the
frontend (not derived from repo.width at all), so this spacing math no
longer looks at real repo data -- it just assumes every building could be
as large as the frontend's actual max and spaces the grid accordingly.
"""

import json
import math
import random
import sqlite3
from collections import OrderedDict
from pathlib import Path

from db import DB_PATH

OUTPUT_PATH = Path("frontend/public/city.json")

ASSUMED_MAX_FOOTPRINT = 6.5  # must match RANDOM_MAX_FOOTPRINT in main.js
BUILDING_GAP = 5.5       # clearance between neighboring building edges (room for real local streets)
DISTRICT_GAP = 24.0      # empty "street" width between district blocks

# Parks used to be stamped directly on top of avenue intersections in the
# frontend -- a "garden" sitting in the middle of a road crossing, which is
# exactly the absurd look that needed fixing. Real parks occupy their own
# city block. Giving each park block the same extent/packing treatment as a
# district (see build_entries) means it gets the same guaranteed
# non-overlapping footprint, bordered by streets on its own, instead of
# being wedged into a crossing.
# Park count scales with the number of real districts (roughly one park
# per 8 districts) rather than a fixed number -- otherwise 6 parks that
# looked reasonable at 50 districts would be lost as sparse specks once the
# topic list grows toward a much bigger city. Each park's own SIZE is set
# per-instance to fill whichever row it's placed into (see build_entries),
# clamped to this range so a park in the tallest row doesn't dwarf its
# neighbors and one in the shortest row doesn't shrink to nothing.
PARK_BLOCKS_PER_DISTRICT = 1 / 3
MIN_PARK_BLOCKS = 12
PARK_BLOCK_MIN_SIZE = 36.0
PARK_BLOCK_MAX_SIZE = 160.0
PARK_BLOCK_EDGE_MARGIN = 6.0  # inset the grass circle from the block's own edges

# Plaza / pocket-park kinds stamped onto exported parks so the frontend can
# mix formal gardens, playgrounds, and cafe terraces instead of cloning one
# layout. Seeded in export so a re-run keeps the same city personality.
PARK_KINDS = ("garden", "playground", "cafe", "plaza")


def fetch_repos(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    return conn.execute(
        """
        SELECT full_name, district, height, width, stars, contributor_count
        FROM repos
        ORDER BY district, stars DESC
        """
    ).fetchall()


def group_by_district(repos: list[sqlite3.Row]) -> "OrderedDict[str, list[sqlite3.Row]]":
    groups: "OrderedDict[str, list[sqlite3.Row]]" = OrderedDict()
    for repo in repos:
        groups.setdefault(repo["district"], []).append(repo)
    return groups


def layout_district(district_repos: list[sqlite3.Row]) -> tuple[list[dict], float, float]:
    """Arrange one district's repos in a grid. Returns (local placements, extent_x, extent_z).

    Spacing is fixed at (ASSUMED_MAX_FOOTPRINT + BUILDING_GAP), so every cell is
    far enough apart that even the largest building the frontend can randomly
    draw can't touch its neighbors, regardless of where it lands in the grid.
    """
    n = len(district_repos)
    cols = max(math.ceil(math.sqrt(n)), 1)
    rows = math.ceil(n / cols)

    spacing = ASSUMED_MAX_FOOTPRINT + BUILDING_GAP

    placements = []
    for i, repo in enumerate(district_repos):
        row = i // cols
        col = i % cols
        offset_x = (col - (cols - 1) / 2) * spacing
        offset_z = (row - (rows - 1) / 2) * spacing
        placements.append({"repo": repo, "offset_x": offset_x, "offset_z": offset_z})

    extent_x = cols * spacing
    extent_z = rows * spacing
    return placements, extent_x, extent_z


def build_entries(groups: "OrderedDict[str, list[sqlite3.Row]]") -> tuple[list[dict], list[dict]]:
    district_names = list(groups.keys())

    # Lay out each district's internal grid first, so we know how big every
    # district block is before deciding how far apart the blocks need to be.
    district_layouts = {}
    district_extents = {}
    for district, district_repos in groups.items():
        placements, extent_x, extent_z = layout_district(district_repos)
        district_layouts[district] = placements
        district_extents[district] = (extent_x, extent_z)

    # Districts used to range from a couple dozen repos to a few hundred --
    # close enough in size that balancing rows by total WIDTH alone (each
    # block going to whichever row is currently narrowest) looked fine.
    # With the crawl now spanning 30x more topics and no cap on how big a
    # popular one gets, that gap has blown open (machine-learning: 882
    # repos vs. terminal: 41, and growing) -- and width-only balancing
    # never looked at HEIGHT at all. A row's height is set by its tallest
    # member, but every block in that row gets centered on that row's
    # shared z regardless of its own height -- so a small block sharing a
    # row with a much taller one only fills a fraction of the row's band,
    # leaving huge empty margins above and below it. That's the "empty
    # blocks" complaint: small districts stranded in oversized rows sized
    # for an unrelated giant neighbor.
    #
    # Fix: Next-Fit Decreasing Height, a standard shelf bin-packing
    # heuristic. Process blocks tallest-first; keep appending to the
    # CURRENT row while it still has width for the next (necessarily
    # equal-or-shorter, since sorted) block, and start a new row only when
    # it doesn't fit. Because a row can only ever pick up blocks from
    # further down the same sorted-by-height sequence, its members are
    # always close in height to each other -- nothing is ever paired with
    # arbitrarily taller or shorter neighbors the way width-only balancing
    # allowed.
    #
    # Parks are packed separately, AFTER this -- see below.
    total_area = sum(w * h for w, h in district_extents.values())
    target_row_width = math.sqrt(total_area) if total_area > 0 else PARK_BLOCK_MIN_SIZE

    tallest_first = sorted(district_names, key=lambda d: district_extents[d][1], reverse=True)

    rows: list[list[str]] = []
    row_running_widths: list[float] = []
    for name in tallest_first:
        extent_x, _ = district_extents[name]
        if rows and row_running_widths[-1] + DISTRICT_GAP + extent_x <= target_row_width:
            rows[-1].append(name)
            row_running_widths[-1] += extent_x + DISTRICT_GAP
        else:
            rows.append([name])
            row_running_widths.append(extent_x)

    row_heights = [max((district_extents[d][1] for d in row), default=0.0) for row in rows]

    # Parks all being the exact same fixed size made NFDH -- correctly --
    # group them all into whichever one or two rows matched that height,
    # bunching every park along a single strip instead of scattering them
    # through the city like a real city's parks. Fix: place them into
    # DIFFERENT rows, spread evenly across the full height range (tallest
    # to shortest row) rather than letting height-sorting pick their row
    # for them, and size each one to fill the row it lands in (instead of
    # a fixed size) -- a park dropped into a short row becomes a small
    # pocket park, one dropped into the tallest row becomes a proper
    # Central-Park-sized block, and neither wastes the height-mismatch
    # space the original fixed-size version would have.
    park_block_count = max(round(len(district_names) * PARK_BLOCKS_PER_DISTRICT), MIN_PARK_BLOCKS)
    park_names = []
    if rows:
        park_row_indices = [
            round(i * (len(rows) - 1) / max(park_block_count - 1, 1)) for i in range(park_block_count)
        ]
        for i, row_index in enumerate(park_row_indices):
            name = f"__park_{i}__"
            park_names.append(name)
            # This is the park's reserved PACKING footprint, matching its
            # row's height (clamped) -- the edge-margin inset that leaves
            # room for a fence before the block's own boundary is applied
            # once, later, when the usable grass/lake size is computed for
            # export (search PARK_BLOCK_EDGE_MARGIN below). Subtracting it
            # here too would inset it twice.
            park_size = max(min(row_heights[row_index], PARK_BLOCK_MAX_SIZE), PARK_BLOCK_MIN_SIZE)
            district_layouts[name] = []
            district_extents[name] = (park_size, park_size)
            rows[row_index].append(name)

        # A park's clamped size can exceed its row's original height (e.g.
        # the MIN_SIZE floor, in a row of even smaller districts) -- widen
        # that row's recorded height to match, or the park would overflow
        # into the next row's space instead of just leaving it a bit of
        # its own breathing room.
        row_heights = [max(district_extents[d][1] for d in row) for row in rows]

    # Shuffling each row's internal order doesn't touch the height grouping
    # already locked in above, just where in the row each block's x
    # position falls (and where a newly-inserted park landed relative to
    # its row's districts) -- otherwise every row reads left-to-right in
    # strict height order, which looks as "arranged" as it is. A fixed
    # seed keeps the layout reproducible across export runs.
    row_shuffle = random.Random(42)
    for row in rows:
        row_shuffle.shuffle(row)

    row_widths = [
        sum(district_extents[d][0] for d in row) + DISTRICT_GAP * max(len(row) - 1, 0) for row in rows
    ]
    total_height = sum(row_heights) + DISTRICT_GAP * max(len(rows) - 1, 0)

    # The frontend used to re-derive avenue positions itself, by clustering
    # every district's building positions into a fixed 5x5 grid of column/
    # row bands (see clusterValues() in cityscape.js). That was only ever an
    # approximation, and it quietly broke once this packer stopped
    # producing a uniform grid: with ~7-8 irregular rows (each its own
    # column count and widths) squeezed into a fixed 5 clusters per axis,
    # the derived road positions didn't line up with the real block edges
    # -- roads cut through blocks in some places and left wide unpaved gaps
    # in others, which is exactly the "empty areas" and "roads not aligning"
    # the city showed. Fix: export the *exact* street geometry computed
    # here, so the frontend draws roads from ground truth instead of
    # guessing it back from scattered building coordinates.
    #
    # Horizontal avenues run the full width of the city, one between each
    # pair of adjacent rows. Vertical connector streets are local to a row
    # (rows have different column layouts, so there's no single vertical
    # position that's valid for every row) -- one at each block-to-block
    # boundary within that row, spanning just that row's own band.
    entries = []
    parks = []
    row_records = []
    z_cursor = -total_height / 2
    for row, row_height, row_width in zip(rows, row_heights, row_widths):
        row_center_z = z_cursor + row_height / 2
        row_top_z = z_cursor
        row_bottom_z = z_cursor + row_height
        x_cursor = -row_width / 2
        block_edges = []
        for name in row:
            extent_x, extent_z = district_extents[name]
            center_x = x_cursor + extent_x / 2
            center_z = row_center_z
            block_edges.append((x_cursor, x_cursor + extent_x))

            if name in park_names:
                # The frontend used to draw parks as a plain circle inset
                # from the block -- fine on its own, but left the block's
                # square corners as dead unused space around it. Exporting
                # the full usable square side (not just a circle's radius)
                # lets it lay out a fence, a lake, and trails that actually
                # fill the block instead of floating in the middle of it.
                size = min(extent_x, extent_z) - PARK_BLOCK_EDGE_MARGIN * 2
                kind = PARK_KINDS[len(parks) % len(PARK_KINDS)]
                parks.append(
                    {
                        "x": round(center_x, 3),
                        "z": round(center_z, 3),
                        "size": round(size, 3),
                        "kind": kind,
                    }
                )
            else:
                for placement in district_layouts[name]:
                    repo = placement["repo"]
                    entries.append(
                        {
                            "full_name": repo["full_name"],
                            "district": name,
                            "height": repo["height"],
                            "width": repo["width"],
                            "stars": repo["stars"],
                            "contributor_count": repo["contributor_count"],
                            "x": round(center_x + placement["offset_x"], 3),
                            "z": round(center_z + placement["offset_z"], 3),
                        }
                    )

            x_cursor += extent_x + DISTRICT_GAP

        local_street_xs = [
            round((block_edges[i][1] + block_edges[i + 1][0]) / 2, 3) for i in range(len(block_edges) - 1)
        ]
        row_records.append(
            {
                "z": round(row_center_z, 3),
                "topZ": round(row_top_z, 3),
                "bottomZ": round(row_bottom_z, 3),
                "minX": round(-row_width / 2, 3),
                "maxX": round(row_width / 2, 3),
                "localStreetXs": local_street_xs,
            }
        )
        z_cursor += row_height + DISTRICT_GAP

    avenue_zs = [
        round((row_records[i]["bottomZ"] + row_records[i + 1]["topZ"]) / 2, 3)
        for i in range(len(row_records) - 1)
    ]
    streets = {"avenueZs": avenue_zs, "rows": row_records}

    return entries, parks, streets


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    repos = fetch_repos(conn)
    conn.close()

    groups = group_by_district(repos)
    entries, parks, streets = build_entries(groups)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump({"repos": entries, "parks": parks, "streets": streets}, f, indent=2)

    print(
        f"Wrote {len(entries)} repos across {len(groups)} districts, {len(parks)} "
        f"dedicated park blocks, and {len(streets['rows'])} street rows to {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()
