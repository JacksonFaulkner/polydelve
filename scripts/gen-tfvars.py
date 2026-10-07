#!/usr/bin/env python3
# Reads backend/.env and writes terraform/terraform.tfvars
import json
import sys
from pathlib import Path

KEY_MAP = {
    "OPENAI_API_KEY": "openai_api_key",
    "EXA_API_KEY": "exa_api_key",
    "GCP_SA_JSON": "gcp_sa_json",
    "AUTH0_DOMAIN": "auth0_domain",
    "AUTH0_AUDIENCE": "auth0_audience",
    "DB_PASSWORD": "db_password",
    "GUEST_JWT_SECRET": "guest_jwt_secret",
}

env_file = Path("backend/.env")
tfvars = Path("terraform/terraform.tfvars")

if not env_file.exists():
    print(f"Error: {env_file} not found", file=sys.stderr)
    sys.exit(1)

lines = []
for line in env_file.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, _, value = line.partition("=")
    tf_key = KEY_MAP.get(key.strip())
    if tf_key:
        lines.append(f'{tf_key} = "{value.strip()}"')

for tf_key, sa_path in [
    ("gcp_sa_json", Path("backend/secrets/gcp-sa.json")),
    ("bq_sa_json", Path("backend/secrets/polydelve-bq-sa.json")),
]:
    if sa_path.exists():
        escaped = json.dumps(json.loads(sa_path.read_text())).replace('"', '\\"')
        lines.append(f'{tf_key} = "{escaped}"')
    else:
        print(f"Warning: {sa_path} not found — {tf_key} not set", file=sys.stderr)

tfvars.write_text("\n".join(lines) + "\n")
print(f"Written to {tfvars}")
print("  (ensure this file is in .gitignore)")
