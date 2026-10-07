"""Resolve open contracts. Usage: uv run python scripts/resolve_contracts.py [--dry-run]"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from features.db import get_db_conn
from features.settlement import run

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Resolve open contracts")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without writing")
    args = parser.parse_args()

    conn = get_db_conn()
    try:
        run(conn, dry_run=args.dry_run)
    finally:
        conn.close()
