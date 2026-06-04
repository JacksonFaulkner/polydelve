#!/usr/bin/env python3
# Reads backend/.env and writes terraform/terraform.tfvars
import sys
from pathlib import Path

KEY_MAP = {
    "MOTHERDUCK_ACCESS_TOKEN": "motherduck_token",
    "OPENAI_API_KEY": "openai_api_key",
    "EXA_API_KEY": "exa_api_key",
    "GCP_SA_JSON": "gcp_sa_json",
    "AUTH0_DOMAIN": "auth0_domain",
    "AUTH0_AUDIENCE": "auth0_audience",
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

gcp_sa = Path("backend/secrets/gcp-sa.json")
if gcp_sa.exists():
    import json
    gcp_json = json.dumps(json.loads(gcp_sa.read_text()))
    escaped = gcp_json.replace('"', '\\"')
    lines.append(f'gcp_sa_json = "{escaped}"')
else:
    print("Warning: backend/secrets/gcp-sa.json not found — gcp_sa_json not set", file=sys.stderr)

tfvars.write_text("\n".join(lines) + "\n")
print(f"Written to {tfvars}")
print("  (ensure this file is in .gitignore)")
