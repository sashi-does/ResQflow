"""NVIDIA API Catalog client (build.nvidia.com: OpenAI-compatible chat completions) for the read-only copilot.

Used only when COPILOT_PROVIDER=nvidia and NVIDIA_API_KEY is set; the planner, Field Intake and the report keep the
main LLM_PROVIDER. Same contract as the other clients: every failure raises LLMError, a rejected key disables it for
the session, and every exchange is recorded in the AI conversation journal.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

import httpx

from app.llm.client import LLMError, LLMResult, ToolRunResult, ToolSpec, extract_json
from app.llm.journal import JOURNAL

log = logging.getLogger(__name__)

_THINK = re.compile(r"<think>.*?</think>", re.S)  # reasoning models may inline their thoughts


class NvidiaClient:
    """Nemotron (and other catalog models) over https://integrate.api.nvidia.com/v1/chat/completions."""

    provider = "nvidia"

    def __init__(
        self, api_key: str, model: str, timeout_s: float, base_url: str, transport: httpx.BaseTransport | None = None
    ) -> None:
        self.model = model
        self.timeout_s = timeout_s
        self.disabled_reason: str | None = None
        self._http = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout_s,
            transport=transport,
        )

    @property
    def available(self) -> bool:
        return self.disabled_reason is None

    def _chat(self, body: dict[str, Any]) -> dict[str, Any]:
        try:
            r = self._http.post("/chat/completions", json={"model": self.model, **body})
        except httpx.TimeoutException as exc:
            raise LLMError(f"timed out after {self.timeout_s:.0f}s") from exc
        except httpx.HTTPError as exc:
            raise LLMError("could not reach the NVIDIA API") from exc
        if r.status_code in (401, 403):
            self.disabled_reason = "the NVIDIA API key was rejected"
            log.warning("NVIDIA copilot disabled for this session: %s", self.disabled_reason)
            raise LLMError(self.disabled_reason)
        if r.status_code == 429:
            raise LLMError("rate limited by the NVIDIA API")
        if r.status_code >= 400:
            raise LLMError(f"NVIDIA API error {r.status_code}")
        return r.json()

    @staticmethod
    def _text(msg: dict[str, Any]) -> str:
        return _THINK.sub("", msg.get("content") or "").strip()

    def complete_json(self, system: str, user: str, schema: dict[str, Any], *, max_tokens: int = 4000) -> LLMResult:
        rec = JOURNAL.new(self.model, self.provider, system, user)
        t0 = time.perf_counter()
        try:
            d = self._chat(
                {
                    "max_tokens": max_tokens,
                    "messages": [
                        {
                            "role": "system",
                            "content": f"{system}\n\nReply with one JSON object only, matching this JSON Schema:\n"
                            f"{json.dumps(schema)}",
                        },
                        {"role": "user", "content": user},
                    ],
                }
            )
            text = self._text(d["choices"][0]["message"])
            rec.response = text
            data = extract_json(text)
        except (LLMError, KeyError, IndexError) as exc:
            rec.ok, rec.error = False, str(exc)
            rec.latency_ms = int((time.perf_counter() - t0) * 1000)
            JOURNAL.add(rec)
            raise exc if isinstance(exc, LLMError) else LLMError("unexpected NVIDIA API response") from exc
        usage = d.get("usage") or {}
        out = LLMResult(
            data,
            self.model,
            int((time.perf_counter() - t0) * 1000),
            usage.get("prompt_tokens", 0),
            usage.get("completion_tokens", 0),
        )
        rec.latency_ms, rec.input_tokens, rec.output_tokens = out.latency_ms, out.input_tokens, out.output_tokens
        out.call_id = JOURNAL.add(rec)
        return out

    def run_tools(
        self, system: str, user: str, tools: list[ToolSpec], *, max_turns: int = 6, max_tokens: int = 4000
    ) -> ToolRunResult:
        rec = JOURNAL.new(self.model, self.provider, system, user)
        t0 = time.perf_counter()
        by_name = {t.name: t for t in tools}
        api_tools = [
            {
                "type": "function",
                "function": {"name": t.name, "description": t.description, "parameters": t.input_schema},
            }
            for t in tools
        ]
        messages: list[dict[str, Any]] = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        calls: list[dict[str, Any]] = []
        tokens_in = tokens_out = 0
        try:
            for _ in range(max_turns):
                # reasoning models think before answering: give the answer room after the thinking
                d = self._chat({"max_tokens": max(max_tokens, 8000), "messages": messages, "tools": api_tools})
                usage = d.get("usage") or {}
                tokens_in += usage.get("prompt_tokens", 0)
                tokens_out += usage.get("completion_tokens", 0)
                choice = d["choices"][0]
                msg = choice["message"]
                tool_calls = msg.get("tool_calls") or []
                if not tool_calls:
                    if choice.get("finish_reason") == "length":
                        raise LLMError("the answer was cut off (max_tokens)")
                    text = self._text(msg)
                    rec.response, rec.tool_calls = text, rec.tool_calls
                    rec.latency_ms = int((time.perf_counter() - t0) * 1000)
                    rec.input_tokens, rec.output_tokens = tokens_in, tokens_out
                    out = ToolRunResult(text, self.model, rec.latency_ms, calls)
                    out.call_id = JOURNAL.add(rec)
                    return out
                messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": tool_calls})
                for tc in tool_calls:
                    name = tc["function"]["name"]
                    try:
                        args = json.loads(tc["function"].get("arguments") or "{}")
                        spec = by_name.get(name)
                        if spec is None:
                            raise ValueError(f"unknown tool {name}")
                        content = json.dumps(spec.fn(args), default=str)
                    except Exception as exc:  # tool errors go back to the model, never crash the loop
                        args, content = {}, f"Error: {exc}"
                    calls.append({"name": name, "input": args})
                    rec.tool_calls.append({"name": name, "input": args, "result": content[:4000]})
                    messages.append({"role": "tool", "tool_call_id": tc.get("id", name), "content": content})
            raise LLMError("too many tool calls without an answer")
        except (LLMError, KeyError, IndexError) as exc:
            rec.ok, rec.error = False, str(exc)
            rec.latency_ms = int((time.perf_counter() - t0) * 1000)
            JOURNAL.add(rec)
            raise exc if isinstance(exc, LLMError) else LLMError("unexpected NVIDIA API response") from exc
