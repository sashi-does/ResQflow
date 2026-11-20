"""AI conversation journal: every LLM exchange (prompt, answer, tool calls, timing), kept in memory and persisted.

Callers label what a call is for with `purpose("coordinator", cycle=3, sim_time="D1 06:00")`; the client records the
exchange under that label and returns its id, which the decision-log entry then points to (`LogEntry.llm_call`).
"""

from __future__ import annotations

import contextlib
import threading
import uuid
from collections import deque
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

MAX_TEXT = 60_000  # characters kept per prompt/answer (a coordinator context is ~10k)


@dataclass
class LLMCall:
    id: str
    purpose: str
    model: str
    provider: str
    system: str
    user: str
    response: str = ""
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    latency_ms: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    ok: bool = True
    error: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)  # cycle, attempt, sim_time, camp_id …
    created_at: str = ""

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


_purpose: ContextVar[tuple[str, dict[str, Any]] | None] = ContextVar("llm_purpose", default=None)


@contextmanager
def purpose(name: str, **meta: Any) -> Iterator[None]:
    token = _purpose.set((name, meta))
    try:
        yield
    finally:
        _purpose.reset(token)


def current_purpose() -> tuple[str, dict[str, Any]]:
    return _purpose.get() or ("other", {})


Sink = Callable[[LLMCall], None]


class Journal:
    """Thread-safe ring of recent calls; an optional sink (the Postgres store) receives each one."""

    def __init__(self, maxlen: int = 300) -> None:
        self._calls: deque[LLMCall] = deque(maxlen=maxlen)
        self._lock = threading.Lock()
        self.sink: Sink | None = None

    def new(self, model: str, provider: str, system: str, user: str) -> LLMCall:
        name, meta = current_purpose()
        return LLMCall(
            id=uuid.uuid4().hex[:12],
            purpose=name,
            model=model,
            provider=provider,
            system=system[:MAX_TEXT],
            user=user[:MAX_TEXT],
            meta=dict(meta),
            created_at=datetime.now(UTC).isoformat(timespec="milliseconds"),
        )

    def add(self, call: LLMCall) -> str:
        call.response = call.response[:MAX_TEXT]
        with self._lock:
            self._calls.append(call)
        if self.sink is not None:
            with contextlib.suppress(Exception):  # persistence must never break planning
                self.sink(call)
        return call.id

    def get(self, call_id: str) -> LLMCall | None:
        with self._lock:
            return next((c for c in self._calls if c.id == call_id), None)

    def recent(self, limit: int = 50) -> list[LLMCall]:
        with self._lock:
            return list(self._calls)[-limit:][::-1]

    def clear(self) -> None:
        with self._lock:
            self._calls.clear()


JOURNAL = Journal()
