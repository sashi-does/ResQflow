"""WebSocket /ws?token=<JWT>: a role-filtered snapshot on connect, then every bus event the role may see."""

from __future__ import annotations

import asyncio
import contextlib

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.auth.security import decode_token
from app.auth.users import User
from app.auth.visibility import Visibility
from app.sim.live import LiveSim, get_live

router = APIRouter()


def visibility(live: LiveSim, user: User) -> Visibility:
    """Rebuilt per message: a reset swaps the world (and its orders) underneath us."""
    wh = live.world.warehouses.get(user.scope_id)
    return Visibility(user, live.world.orders, wh.name if wh else "")


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str = "", resume: str = "") -> None:
    try:
        user = decode_token(token)
    except HTTPException:
        await ws.close(code=4401)
        return
    await ws.accept()
    live = get_live()
    live.ensure_background()  # serverless hosts may skip the startup hook: the clock starts with the first viewer
    if not resume:  # a reconnect (e.g. a host closing long-lived sockets) continues the same run
        live.fresh_session_reset()
    queue = live.subscribe()
    try:
        await ws.send_json({"type": "snapshot", "payload": visibility(live, user).snapshot(live.snapshot())})
        receiver = asyncio.create_task(_drain_incoming(ws))
        while not receiver.done():
            getter = asyncio.create_task(queue.get())
            done, _ = await asyncio.wait({getter, receiver}, return_when=asyncio.FIRST_COMPLETED)
            if getter in done:
                msg = visibility(live, user).message(getter.result())
                if msg is not None:
                    await ws.send_json(msg)
            else:
                getter.cancel()
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        live.unsubscribe(queue)
        with contextlib.suppress(Exception):
            await ws.close()


async def _drain_incoming(ws: WebSocket) -> None:
    """The client doesn't send anything meaningful; this just notices disconnects."""
    with contextlib.suppress(WebSocketDisconnect, RuntimeError):
        while True:
            await ws.receive_text()
