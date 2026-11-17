"""In-process event bus and decision log.

Every agent action goes through `log()`, which records a plain-English `LogEntry` and publishes it.
Subscribers (the WebSocket broadcaster, tests) receive `(type, payload)` synchronously.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from app.models import AgentName, LogEntry, LogRefs

Subscriber = Callable[[str, dict[str, Any]], None]


class EventBus:
    """Fan-out of simulation/agent events plus the decision log."""

    def __init__(self, time_fn: Callable[[], tuple[int, str]], enabled: bool = True) -> None:
        self._time_fn = time_fn  # -> (sim_seconds, "D1 08:30")
        self.enabled = enabled
        self.subscribers: list[Subscriber] = []
        self.entries: list[LogEntry] = []
        self._next_id = 1

    def subscribe(self, fn: Subscriber) -> None:
        self.subscribers.append(fn)

    def publish(self, type_: str, payload: dict[str, Any]) -> None:
        if not self.enabled:
            return
        for fn in list(self.subscribers):
            fn(type_, payload)

    def log(
        self,
        agent: AgentName,
        kind: str,
        summary: str,
        reasoning: str = "",
        **refs: list[str],
    ) -> LogEntry | None:
        if not self.enabled:
            return None
        sim_seconds, sim_time = self._time_fn()
        entry = LogEntry(
            id=self._next_id,
            sim_time=sim_time,
            sim_seconds=sim_seconds,
            real_time=datetime.now(UTC).isoformat(timespec="milliseconds"),
            agent=agent,
            kind=kind,
            summary=summary,
            reasoning=reasoning,
            refs=LogRefs(**refs),
        )
        self._next_id += 1
        self.entries.append(entry)
        self.publish("log", entry.model_dump())
        return entry
