"""FastAPI entry point: API routes, and the built frontend served from `/`."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.routes import VERSION, router
from app.config import STATIC_DIR

app = FastAPI(title="RahatNet", version=VERSION)
app.include_router(router)

if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
