from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


def add_cors(app: FastAPI) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_methods=["*"],
        allow_headers=["*"],
    )