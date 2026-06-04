"""
Push a local DuckDB file to MotherDuck.

Usage: uv run python scripts/push_to_motherduck.py [db_file] [md_db_name]
Defaults: polydelve.prod.duckdb → md:polydelve

Requires MOTHERDUCK_ACCESS_TOKEN in env (or .env file).
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from main import _load_env  # noqa: E402

import duckdb  # noqa: E402

_load_env()

token = os.environ.get("MOTHERDUCK_ACCESS_TOKEN")
if not token:
    print("Error: MOTHERDUCK_ACCESS_TOKEN not set", file=sys.stderr)
    sys.exit(1)

db_file = sys.argv[1] if len(sys.argv) > 1 else "polydelve.prod.duckdb"
md_db = sys.argv[2] if len(sys.argv) > 2 else "polydelve"

if not Path(db_file).exists():
    print(f"Error: {db_file} not found", file=sys.stderr)
    sys.exit(1)

print(f"Pushing {db_file} → md:{md_db} ...")

os.environ["motherduck_token"] = token

# Connect directly to MotherDuck DB, attach local file as read-only source
con = duckdb.connect(f"md:{md_db}")
con.execute(f"ATTACH '{db_file}' AS src (READ_ONLY)")

tables = [r[0] for r in con.execute("SHOW TABLES FROM src.main").fetchall()]
print(f"  Tables: {tables}")

for table in tables:
    print(f"  Copying {table} ...")
    con.execute(f"CREATE OR REPLACE TABLE {table} AS SELECT * FROM src.main.{table}")

con.close()
print(f"Done. {len(tables)} tables pushed.")
