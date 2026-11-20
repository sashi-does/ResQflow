"""OpenRouter via its Anthropic-compatible Messages API, and the no-credits breaker (no network calls)."""

import anthropic
import httpx
import pytest

from app.agents.coordinator import CoordinatorAgent, _statuses
from app.config import Settings
from app.llm.client import AnthropicClient, LLMError, make_llm
from app.sim.scenario import load_scenario
from app.sim.world import WorldState


def test_openrouter_provider_uses_the_anthropic_sdk_with_openrouter_base_url():
    s = Settings(llm_provider="openrouter", openrouter_api_key="sk-or-test", llm_model="anthropic/claude-haiku-5.5")
    assert s.effective_llm_provider == "openrouter"
    llm = make_llm(s)
    assert isinstance(llm, AnthropicClient) and llm.provider == "openrouter" and llm.available
    assert str(llm._client.base_url).startswith("https://openrouter.ai/api")
    assert Settings(llm_provider="openrouter", openrouter_api_key="").effective_llm_provider == "mock"


def _payment_required(**_: object) -> None:
    req = httpx.Request("POST", "https://openrouter.ai/api/v1/messages")
    resp = httpx.Response(
        402, request=req, json={"error": {"type": "billing_error", "message": "Insufficient credits"}}
    )
    raise anthropic.APIStatusError("Insufficient credits", response=resp, body=None)


def test_no_credits_disables_the_llm_once_and_planning_falls_back(monkeypatch):
    llm = make_llm(
        Settings(llm_provider="openrouter", openrouter_api_key="sk-or-test", llm_model="anthropic/claude-haiku-5.5")
    )
    calls = []
    monkeypatch.setattr(llm._client.messages, "create", lambda **kw: calls.append(1) or _payment_required(**kw))
    with pytest.raises(LLMError, match="no credits"):
        llm.complete_json("s", "u", {"type": "object"})
    assert not llm.available and "credits" in (llm.disabled_reason or "")

    w = WorldState(load_scenario())
    coord = CoordinatorAgent(6000, llm=llm)
    r1 = coord.plan(w, _statuses(w), "t1")
    r2 = coord.plan(w, _statuses(w), "t2")
    assert r1.source == r2.source == "heuristic" and r1.validation.ok
    assert len(calls) == 1  # the breaker stops further calls; planning keeps working offline
