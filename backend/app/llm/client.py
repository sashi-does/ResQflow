"""Provider-agnostic LLM client: JSON outputs (schema-constrained) and a read-only tool loop.

Only `anthropic` and `mock` are implemented; `openai`/`gemini` behave like `mock` (no key, no crash).
Everything here is called off the simulation hot path, with a timeout, and every failure raises `LLMError`
so callers can fall back deterministically.
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.config import Settings

log = logging.getLogger(__name__)

# Models with server-side refusal fallbacks available (see the Claude API docs); Haiku has none.
_FALLBACK_MODELS = ("claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-2", "claude-fable-5-1")
_FALLBACK_BETA = "server-side-fallback-2026-07-01"

DISPLAY = {
    "claude-haiku-5-5": "Claude Haiku 5.5",
    "claude-sonnet-5-5": "Claude Sonnet 5.5",
    "claude-opus-5-5": "Claude Opus 5.5",
}


class LLMError(Exception):
    """Any LLM failure (unavailable, timeout, refusal, unparseable). Callers fall back."""


class LLMUnavailable(LLMError):
    """No provider configured (mock mode / missing key)."""


@dataclass
class LLMResult:
    data: Any
    model: str
    latency_ms: int
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class ToolSpec:
    """A read-only tool the model may call. `fn` receives the parsed input dict and returns JSON-able data."""

    name: str
    description: str
    input_schema: dict[str, Any]
    fn: Callable[[dict[str, Any]], Any]


@dataclass
class ToolRunResult:
    text: str
    model: str
    latency_ms: int
    tool_calls: list[dict[str, Any]] = field(default_factory=list)


class LLMClient(Protocol):
    provider: str
    model: str

    @property
    def available(self) -> bool: ...

    def complete_json(self, system: str, user: str, schema: dict[str, Any], *, max_tokens: int = 4000) -> LLMResult: ...

    def run_tools(
        self, system: str, user: str, tools: list[ToolSpec], *, max_turns: int = 6, max_tokens: int = 4000
    ) -> ToolRunResult: ...


def display_name(model: str) -> str:
    return DISPLAY.get(model, model)


def extract_json(text: str) -> Any:
    """Parse JSON; repair pass strips code fences / surrounding prose and takes the first {...} block."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise LLMError("the model did not return JSON")
    try:
        return json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as exc:
        raise LLMError(f"the model returned invalid JSON ({exc.msg})") from exc


class MockClient:
    """No LLM: every call raises LLMUnavailable so callers use their deterministic path."""

    provider = "mock"

    def __init__(self, model: str = "") -> None:
        self.model = model

    @property
    def available(self) -> bool:
        return False

    def complete_json(self, system: str, user: str, schema: dict[str, Any], *, max_tokens: int = 4000) -> LLMResult:
        raise LLMUnavailable("no LLM provider configured (mock mode)")

    def run_tools(
        self, system: str, user: str, tools: list[ToolSpec], *, max_turns: int = 6, max_tokens: int = 4000
    ) -> ToolRunResult:
        raise LLMUnavailable("no LLM provider configured (mock mode)")


class AnthropicClient:
    """Claude via the official `anthropic` SDK."""

    provider = "anthropic"

    def __init__(self, api_key: str, model: str, timeout_s: float, effort: str = "low") -> None:
        import anthropic

        self._anthropic = anthropic
        self.model = model
        self.effort = effort
        self.timeout_s = timeout_s
        self._client = anthropic.Anthropic(api_key=api_key, timeout=timeout_s, max_retries=1)

    @property
    def available(self) -> bool:
        return True

    # ---------------------------------------------------------------- low level
    def _create(self, **kwargs: Any) -> Any:
        a = self._anthropic
        try:
            if self.model.startswith(_FALLBACK_MODELS):
                return self._client.beta.messages.create(
                    model=self.model, betas=[_FALLBACK_BETA], fallbacks="default", **kwargs
                )
            return self._client.messages.create(model=self.model, **kwargs)
        except a.APITimeoutError as exc:
            raise LLMError(f"timed out after {self.timeout_s:.0f}s") from exc
        except a.AuthenticationError as exc:
            raise LLMError("the API key was rejected") from exc
        except a.RateLimitError as exc:
            raise LLMError("rate limited by the API") from exc
        except a.BadRequestError as exc:
            raise LLMError(f"bad request: {exc.message}") from exc
        except a.APIStatusError as exc:
            raise LLMError(f"API error {exc.status_code}") from exc
        except a.APIConnectionError as exc:
            raise LLMError("could not reach the API") from exc

    @staticmethod
    def _check_stop(resp: Any) -> None:
        if resp.stop_reason == "refusal":
            raise LLMError("the model declined this request")
        if resp.stop_reason == "max_tokens":
            raise LLMError("the answer was cut off (max_tokens)")

    # ---------------------------------------------------------------- JSON
    def complete_json(self, system: str, user: str, schema: dict[str, Any], *, max_tokens: int = 4000) -> LLMResult:
        t0 = time.perf_counter()
        resp = self._create(
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config={"effort": self.effort, "format": {"type": "json_schema", "schema": schema}},
        )
        self._check_stop(resp)
        text = next((b.text for b in resp.content if b.type == "text"), "")
        return LLMResult(
            data=extract_json(text),
            model=self.model,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            input_tokens=getattr(resp.usage, "input_tokens", 0),
            output_tokens=getattr(resp.usage, "output_tokens", 0),
        )

    # ---------------------------------------------------------------- read-only tool loop
    def run_tools(
        self, system: str, user: str, tools: list[ToolSpec], *, max_turns: int = 6, max_tokens: int = 4000
    ) -> ToolRunResult:
        t0 = time.perf_counter()
        by_name = {t.name: t for t in tools}
        api_tools = [
            {"name": t.name, "description": t.description, "input_schema": t.input_schema, "strict": True}
            for t in tools
        ]
        messages: list[dict[str, Any]] = [{"role": "user", "content": user}]
        calls: list[dict[str, Any]] = []
        for _ in range(max_turns):
            resp = self._create(
                max_tokens=max_tokens,
                system=system,
                tools=api_tools,
                messages=messages,
                output_config={"effort": self.effort},
            )
            if resp.stop_reason == "pause_turn":
                messages.append({"role": "assistant", "content": resp.content})
                continue
            if resp.stop_reason != "tool_use":
                self._check_stop(resp)
                text = "\n".join(b.text for b in resp.content if b.type == "text").strip()
                return ToolRunResult(text, self.model, int((time.perf_counter() - t0) * 1000), calls)
            messages.append({"role": "assistant", "content": resp.content})
            results = []
            for block in resp.content:
                if block.type != "tool_use":
                    continue
                spec = by_name.get(block.name)
                try:
                    if spec is None:
                        raise ValueError(f"unknown tool {block.name}")
                    out = spec.fn(dict(block.input))
                    results.append(
                        {"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(out, default=str)}
                    )
                except Exception as exc:  # tool errors go back to the model, never crash the loop
                    results.append(
                        {"type": "tool_result", "tool_use_id": block.id, "content": f"Error: {exc}", "is_error": True}
                    )
                calls.append({"name": block.name, "input": dict(block.input)})
            messages.append({"role": "user", "content": results})
        raise LLMError("too many tool calls without an answer")


def make_llm(settings: Settings) -> LLMClient:
    """The configured client; any provider without a key (or not implemented) behaves like mock."""
    if settings.effective_llm_provider == "anthropic":
        return AnthropicClient(
            settings.anthropic_api_key, settings.llm_model, settings.llm_timeout_s, settings.llm_effort
        )
    return MockClient(settings.llm_model)
