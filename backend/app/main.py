"""FastAPI entry point: API routes, and the built frontend served from `/`."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import STATIC_DIR, get_settings

VERSION = "0.1.0"

app = FastAPI(title="RahatNet", version=VERSION)


@app.get("/api/health")
def health() -> dict:
    s = get_settings()
    return {
        "ok": True,
        "llm_provider": s.effective_llm_provider,
        "llm_model": s.llm_model,
        "weather_mode": s.weather_mode,
        "demo_inject_fault": s.demo_inject_fault,
        "version": VERSION,
    }


if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
