"""Tiny sanity-check script for city.db."""

import sqlite3

from db import DB_PATH


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    total_repos = conn.execute("SELECT COUNT(*) FROM repos").fetchone()[0]
    print(f"Total repos: {total_repos}")

    print("\nTop 5 repos by height:")
    for row in conn.execute(
        "SELECT full_name, height FROM repos ORDER BY height DESC LIMIT 5"
    ):
        print(f"  {row['full_name']}: {row['height']:.3f}")

    print("\nTop 5 repos by width:")
    for row in conn.execute(
        "SELECT full_name, width FROM repos ORDER BY width DESC LIMIT 5"
    ):
        print(f"  {row['full_name']}: {row['width']:.3f}")

    total_contributors = conn.execute(
        "SELECT COUNT(*) FROM contributors"
    ).fetchone()[0]
    print(f"\nTotal contributors: {total_contributors}")

    conn.close()


if __name__ == "__main__":
    main()
