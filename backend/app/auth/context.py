"""Who is acting right now (set per request by the auth dependency); used to attribute human log entries."""

from __future__ import annotations

from contextvars import ContextVar

current_actor: ContextVar[str | None] = ContextVar("current_actor", default=None)


def who(default: str) -> str:
    """'Ritu Baruah (District Officer, Nagaon)' inside an authenticated request, else `default`."""
    return current_actor.get() or default
