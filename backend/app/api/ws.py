"""WebSocket /ws: a snapshot on connect, then every bus event as {type, payload}."""

from __future__ import annotations

import asyncio
import contextlib

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.sim.live import get_live

router = APIRouter()


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    live = get_live()
    live.fresh_session_reset()
    queue = live.subscribe()
    try:
        await ws.send_json({"type": "snapshot", "payload": live.snapshot()})
        receiver = asyncio.create_task(_drain_incoming(ws))
        while not receiver.done():
            getter = asyncio.create_task(queue.get())
            done, _ = await asyncio.wait({getter, receiver}, return_when=asyncio.FIRST_COMPLETED)
            if getter in done:
                await ws.send_json(getter.result())
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
