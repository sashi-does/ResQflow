"""NVIDIA API Catalog client for the copilot (OpenAI-style chat completions), tested with a fake transport."""

import json

import httpx

from app.agents.copilot import ask, freeze
from app.config import Settings
from app.llm.client import MockClient, make_copilot_llm
from app.llm.nvidia import NvidiaClient
from app.sim.comparison import build_comparison
from app.sim.scenario import load_scenario


def _frozen():
    cmp_ = build_comparison(scenario=load_scenario(case="highway"), headless=True)
    cmp_.run_until(2 * 3600)
    return freeze(cmp_.agentic.world, cmp_.kpis())


def test_copilot_answers_through_nvidia_with_a_tool_lookup():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        seen.append(body)
        assert request.headers["authorization"] == "Bearer nvapi-test"
        if len(seen) == 1:  # first turn: the model asks for a camp
            call = {"id": "c1", "type": "function", "function": {"name": "get_camp", "arguments": '{"camp_id": "C5"}'}}
            msg = {"role": "assistant", "content": None, "tool_calls": [call]}
            return httpx.Response(200, json={"choices": [{"message": msg, "finish_reason": "tool_calls"}]})
        tool_msg = next(m for m in body["messages"] if m["role"] == "tool")
        assert "Dhemaji" in tool_msg["content"]  # the real read-only tool ran on the frozen world
        msg = {"role": "assistant", "content": "<think>check C5</think>Dhemaji is most at risk."}
        usage = {"prompt_tokens": 900, "completion_tokens": 40}
        return httpx.Response(200, json={"choices": [{"message": msg, "finish_reason": "stop"}], "usage": usage})

    llm = NvidiaClient(
        "nvapi-test", "nvidia/nemotron-3.5-lightning-30b-a3b", 20, "https://x/v1", httpx.MockTransport(handler)
    )
    out = ask(llm, _frozen(), "Which camp is most at risk?")
    assert out["answer"] == "Dhemaji is most at risk."  # reasoning stripped
    assert out["tools_used"] == [{"name": "get_camp", "input": {"camp_id": "C5"}}]
    assert out["model"] == "Nemotron 3.5 Lightning (NVIDIA)" and out["call_id"]
    assert seen[0]["tools"][0]["type"] == "function"


def test_rejected_nvidia_key_disables_the_copilot_cleanly():
    llm = NvidiaClient("bad", "m", 20, "https://x/v1", httpx.MockTransport(lambda r: httpx.Response(401, json={})))
    out = ask(llm, _frozen(), "hi")
    assert out.get("error") and "rejected" in out["answer"]
    assert not llm.available
    assert ask(llm, _frozen(), "again")["needs_key"] is True


def test_copilot_uses_nvidia_only_when_configured():
    main = MockClient()
    assert make_copilot_llm(Settings(copilot_provider="", nvidia_api_key="k"), main) is main
    assert make_copilot_llm(Settings(copilot_provider="nvidia", nvidia_api_key=""), main) is main
    assert isinstance(make_copilot_llm(Settings(copilot_provider="nvidia", nvidia_api_key="k"), main), NvidiaClient)
