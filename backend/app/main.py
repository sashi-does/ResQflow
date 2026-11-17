"""FastAPI entry point: lifespan starts the simulation loop; API + WebSocket; built frontend served from `/`."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.routes import VERSION, router
from app.api.ws import router as ws_router
from app.config import STATIC_DIR
from app.sim.live import get_live


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    live = get_live()
    if os.environ.get("RAHATNET_NO_LOOP") != "1":
        live.start_background()
    yield
    await live.stop_background()


app = FastAPI(title="RahatNet", version=VERSION, lifespan=lifespan)
app.include_router(router)
app.include_router(ws_router)

if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
