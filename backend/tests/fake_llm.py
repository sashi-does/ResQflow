"""A scripted stand-in for the LLM (no key, no network). Queued items are dicts (returned) or Exceptions (raised)."""

from __future__ import annotations

import json
from typing import Any

from app.llm.client import LLMResult, ToolRunResult, ToolSpec


class FakeLLM:
    provider = "fake"

    def __init__(self, responses: list[Any] | None = None, model: str = "claude-haiku-5-5") -> None:
        self.model = model
        self.responses = list(responses or [])
        self.calls: list[dict[str, Any]] = []

    @property
    def available(self) -> bool:
        return True

    def _next(self) -> Any:
        if not self.responses:
            raise AssertionError("FakeLLM ran out of scripted responses")
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r

    def complete_json(self, system: str, user: str, schema: dict[str, Any], *, max_tokens: int = 4000) -> LLMResult:
        self.calls.append({"system": system, "user": json.loads(user), "schema": schema})
        data = self._next()
        data = data(json.loads(user)) if callable(data) else data
        return LLMResult(data=data, model=self.model, latency_ms=1200)

    def run_tools(
        self, system: str, user: str, tools: list[ToolSpec], *, max_turns: int = 6, max_tokens: int = 4000
    ) -> ToolRunResult:
        script = self._next()  # {"tool_calls": [(name, input), ...], "answer": "..."}
        calls = []
        for name, args in script.get("tool_calls", []):
            spec = next(t for t in tools if t.name == name)
            out = spec.fn(args)
            calls.append({"name": name, "input": args, "output": out})
        self.calls.append({"system": system, "user": user, "tool_calls": calls})
        answer = script["answer"]
        answer = answer(calls) if callable(answer) else answer
        return ToolRunResult(answer, self.model, 900, [{"name": c["name"], "input": c["input"]} for c in calls])
