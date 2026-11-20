"""In-process event bus and decision log.

Every agent action goes through `log()`, which records a plain-English `LogEntry` and publishes it.
Subscribers (the WebSocket broadcaster, tests) receive `(type, payload)` synchronously.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

from app.auth.context import current_actor
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
        self.stats: dict[str, dict[str, Any]] = {}  # per agent: count, last_summary, last_at, timing
        # Coordination cycles: everything that happens is logged into the *open* cycle (what changed since the last
        # plan). When the Coordinator starts planning, that cycle is handed over (trigger + planning + checks +
        # dispatch all share its id) and a new open cycle starts collecting the next changes.
        self.open_cycle = 1
        self._forced: int | None = None

    def begin_cycle(self) -> int:
        cid = self.open_cycle
        self.open_cycle += 1
        return cid

    @property
    def forced_cycle(self) -> int | None:
        """The planning cycle being worked on right now (None outside planning)."""
        return self._forced

    @contextmanager
    def in_cycle(self, cycle: int | None) -> Iterator[None]:
        prev, self._forced = self._forced, cycle
        try:
            yield
        finally:
            self._forced = prev

    def _stat(self, agent: str) -> dict[str, Any]:
        return self.stats.setdefault(
            agent, {"count": 0, "last_summary": None, "last_at": None, "total_ms": 0.0, "timed": 0}
        )

    def record_ms(self, agent: str, ms: float) -> None:
        """Time spent by an agent on one piece of work (for the Agents view)."""
        s = self._stat(agent)
        s["total_ms"] += ms
        s["timed"] += 1

    def agent_stats(self) -> dict[str, dict[str, Any]]:
        return {
            a: {
                "count": s["count"],
                "last_summary": s["last_summary"],
                "last_at": s["last_at"],
                "avg_latency_ms": round(s["total_ms"] / s["timed"], 1) if s["timed"] else None,
            }
            for a, s in self.stats.items()
        }

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
        *,
        cycle: int | None = None,
        llm_call: str | None = None,
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
            actor=current_actor.get() if agent == "human" else None,
            cycle=cycle or self._forced or self.open_cycle,
            llm_call=llm_call,
        )
        self._next_id += 1
        self.entries.append(entry)
        st = self._stat(agent)
        st["count"] += 1
        st["last_summary"], st["last_at"] = summary, sim_time
        self.publish("log", entry.model_dump())
        return entry
