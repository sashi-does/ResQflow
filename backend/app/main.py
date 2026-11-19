"""FastAPI entry point: lifespan starts the simulation loop; API + WebSocket; built frontend served from `/`."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from app.api.routes import VERSION, router
from app.api.ws import router as ws_router
from app.auth.users import seed
from app.config import STATIC_DIR
from app.sim.live import get_live


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    seed()  # demo users (bcrypt hashes) into SQLite
    live = get_live()
    if os.environ.get("RAHATNET_NO_LOOP") != "1":
        live.start_background()
    yield
    await live.stop_background()


app = FastAPI(title="RahatNet", version=VERSION, lifespan=lifespan)
app.include_router(router)
app.include_router(ws_router)


@app.get("/{path:path}", include_in_schema=False)
async def spa(path: str) -> FileResponse:
    """Built frontend: real files as-is, every app route (/, /command, /camp/C7, …) gets index.html."""
    if path.startswith(("api/", "ws")):
        raise HTTPException(404)
    root = STATIC_DIR.resolve()
    target = (root / path).resolve()
    if path and target.is_file() and root in target.parents:
        return FileResponse(target)
    index = root / "index.html"
    if not index.exists():
        raise HTTPException(404, "frontend not built: run `make build`")
    return FileResponse(index)
