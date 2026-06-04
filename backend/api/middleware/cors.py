from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


def add_cors(app: FastAPI) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://localhost:5173",
            "https://polydelve.com",
            "https://www.polydelve.com",
            "https://dx4jqtbvzvu8w.cloudfront.net",
        ],
        allow_methods=["*"],
        allow_headers=["*"],
    )

