"""AI Resume Writer — FastAPI Backend."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import ingest, pipeline, profile, design


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="AI Resume Writer API", version="1.0.0", lifespan=lifespan)

# Allow localhost dev + any FRONTEND_URL set at deploy time
_origins = ["http://localhost:3000"]
if frontend_url := os.getenv("FRONTEND_URL"):
    _origins.append(frontend_url.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router,   prefix="/api/ingest",   tags=["ingest"])
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["pipeline"])
app.include_router(profile.router,  prefix="/api/profile",  tags=["profile"])
app.include_router(design.router,   prefix="/api/design",   tags=["design"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
