import json
import os
from functools import lru_cache
from pathlib import Path

from exa_py import AsyncExa
from google import genai
from google.genai.types import HttpOptions
from google.oauth2 import service_account
from openai import AsyncOpenAI

MOTHERDUCK_ACCESS_TOKEN = os.getenv("MOTHERDUCK_ACCESS_TOKEN")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
EXA_API_KEY = os.getenv("EXA_API_KEY")

GCP_PROJECT_ID = "motion-off-the-ocean"
GCP_LOCATION = "us-central1"

# Local fallback for dev — in prod, GCP_SA_JSON env var holds the JSON string
# fetched from AWS Secrets Manager at deploy time.
_LOCAL_SA_PATH = Path(__file__).parent / "secrets" / "gcp-sa.json"


@lru_cache(maxsize=1)
def _gcp_credentials() -> service_account.Credentials:
    sa_json = os.getenv("GCP_SA_JSON")
    if sa_json:
        info = json.loads(sa_json)
        return service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
    if _LOCAL_SA_PATH.exists():
        return service_account.Credentials.from_service_account_file(
            str(_LOCAL_SA_PATH),
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
    raise RuntimeError("No GCP credentials: set GCP_SA_JSON env var or provide secrets/gcp-sa.json")


@lru_cache(maxsize=1)
def get_openai_client() -> AsyncOpenAI:
    return AsyncOpenAI(api_key=OPENAI_API_KEY)


@lru_cache(maxsize=1)
def get_exa_client() -> AsyncExa:
    return AsyncExa(api_key=EXA_API_KEY)


@lru_cache(maxsize=1)
def get_gemini_client() -> genai.Client:
    return genai.Client(
        vertexai=True,
        project=GCP_PROJECT_ID,
        location=GCP_LOCATION,
        credentials=_gcp_credentials(),
        http_options=HttpOptions(api_version="v1beta1"),
    )
