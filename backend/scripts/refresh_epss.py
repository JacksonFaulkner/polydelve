"""
Refresh EPSS scores for all tracked packages.

Strategy:
  1. For each package, collect its CVE IDs from cve_history.
  2. Query FIRST EPSS API in batches of 100 CVEs.
  3. For each package, take the MAX EPSS across its CVEs (most dangerous signal wins).
  4. Write snapshot to epss_history, update packages.epss_score.

Run daily via cron or: uv run python scripts/refresh_epss.py
"""
import sys
import time
from datetime import date
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))
from features.db import get_db_conn  # noqa: E402

EPSS_API = "https://api.first.org/data/1.0/epss"
BATCH = 100
SLEEP_BETWEEN_BATCHES = 0.5  # seconds — be polite to FIRST API


def fetch_epss_batch(cve_ids: list[str]) -> dict[str, float]:
    """Query FIRST API for a batch of CVE IDs. Returns {cve_id: epss_score}."""
    try:
        resp = httpx.get(
            EPSS_API,
            params={"cve": ",".join(cve_ids)},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        return {row["cve"]: float(row["epss"]) for row in data}
    except Exception as e:
        print(f"  WARN: batch fetch failed ({e}), skipping")
        return {}


def main() -> None:
    conn = get_db_conn()
    today = date.today()

    # Collect CVE IDs per package
    rows = conn.execute(
        """
        SELECT ch.name, ch.ecosystem, LIST(ch.cve_id) AS cve_ids
        FROM cve_history ch
        WHERE ch.cve_id IS NOT NULL AND ch.cve_id != ''
        GROUP BY ch.name, ch.ecosystem
        """
    ).fetchall()

    if not rows:
        print("No CVE data found — nothing to refresh.")
        return

    print(f"Refreshing EPSS for {len(rows)} packages ({today})…")

    # Collect all unique CVE IDs across all packages
    all_cves: set[str] = set()
    pkg_cves: dict[tuple[str, str], list[str]] = {}
    for name, eco, cve_list in rows:
        valid = [c for c in (cve_list or []) if c and c.startswith("CVE-")]
        if valid:
            pkg_cves[(name, eco)] = valid
            all_cves.update(valid)

    all_cves_list = sorted(all_cves)
    print(f"  {len(all_cves_list)} unique CVEs across all packages")

    # Fetch from FIRST in batches
    epss_map: dict[str, float] = {}
    for i in range(0, len(all_cves_list), BATCH):
        batch = all_cves_list[i : i + BATCH]
        result = fetch_epss_batch(batch)
        epss_map.update(result)
        print(f"  batch {i//BATCH + 1}: fetched {len(result)}/{len(batch)} scores")
        if i + BATCH < len(all_cves_list):
            time.sleep(SLEEP_BETWEEN_BATCHES)

    print(f"  total EPSS scores fetched: {len(epss_map)}")

    # Compute max EPSS per package and write
    updated = 0
    snapshotted = 0
    for (name, eco), cves in pkg_cves.items():
        scores = [epss_map[c] for c in cves if c in epss_map]
        if not scores:
            continue
        max_epss = max(scores)

        conn.execute(
            "UPDATE packages SET epss_score = ? WHERE name = ? AND ecosystem = ?",
            [max_epss, name, eco],
        )
        updated += 1

        # Only write history if value changed OR 10+ days since last record
        last = conn.execute(
            """
            SELECT epss_score, recorded_at FROM epss_history
            WHERE name = ? AND ecosystem = ?
            ORDER BY recorded_at DESC LIMIT 1
            """,
            [name, eco],
        ).fetchone()

        value_changed = last is None or round(last[0], 6) != round(max_epss, 6)
        days_since = (today - last[1]).days if last else 999

        if value_changed or days_since >= 10:
            try:
                conn.execute(
                    """
                    INSERT INTO epss_history (name, ecosystem, epss_score, recorded_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    [name, eco, max_epss, today],
                )
                snapshotted += 1
            except Exception:
                pass  # already have today's record

    print(f"  packages updated: {updated}")
    print(f"  history rows added: {snapshotted}")
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
