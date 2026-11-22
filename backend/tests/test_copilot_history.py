"""Ask ResQflow history: every question is kept (memory + database) with its answer, model and lookups."""

import os

import pytest

os.environ["RESQFLOW_NO_LOOP"] = "1"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.sim.live import get_live  # noqa: E402
from tests.auth import H  # noqa: E402
from tests.fake_llm import FakeLLM  # noqa: E402


@pytest.fixture
def client():
    with TestClient(app) as c:
        c.headers.update(H())
        live = get_live()
        saved, live.copilot_messages = live.copilot_messages, {}
        yield c
        live.copilot_messages = saved
        live.copilot_llm = live.llm


def test_questions_and_answers_are_kept_with_the_model_and_lookups(client):
    live = get_live()
    live.copilot_llm = FakeLLM(
        [
            {"tool_calls": [("get_camp", {"camp_id": "C5"})], "answer": "Dhemaji is most at risk."},
            {"answer": "Nothing is on its way yet."},
        ],
        model="nvidia/nemotron-3.5-lightning-30b-a3b",
    )
    pushed = []
    q = live.subscribe()
    first = client.post("/api/copilot", json={"question": "Which camp is most at risk?", "id": "q-0001aa"}).json()
    assert first["id"] == "q-0001aa" and first["status"] == "answered"
    assert first["answer"] == "Dhemaji is most at risk."
    assert first["model"] == "Nemotron 3.5 Lightning (NVIDIA)"
    assert first["tools_used"] == [{"name": "get_camp", "input": {"camp_id": "C5"}}]
    assert first["asked_by"].startswith("Ritu Baruah") and first["sim_time"] and first["answered_at"]
    while not q.empty():
        m = q.get_nowait()
        if m["type"] == "copilot.updated":
            pushed.append(m["payload"]["status"])
    live.unsubscribe(q)
    assert pushed == ["pending", "answered"]  # the page sees "thinking…" first, then the answer
    client.post("/api/copilot", json={"question": "What is on its way?", "id": "q-0002bb"})
    # a retried request with the same id is answered once, not asked again
    again = client.post("/api/copilot", json={"question": "Which camp is most at risk?", "id": "q-0001aa"}).json()
    assert again["answer"] == "Dhemaji is most at risk." and len(live.copilot_llm.calls) == 2
    history = client.get("/api/copilot/history").json()
    assert [m["id"] for m in history] == ["q-0001aa", "q-0002bb"]  # oldest first
    assert history[1]["answer"] == "Nothing is on its way yet."


def test_without_a_model_the_question_is_still_kept_with_a_clear_status(client):
    out = client.post("/api/copilot", json={"question": "Hello?"}).json()
    assert out["status"] == "needs_key" and out["needs_key"] is True and "API key" in out["answer"]
    assert client.get("/api/copilot/history").json()[-1]["question"] == "Hello?"


def test_only_officers_can_ask_or_read_the_history(client):
    assert client.get("/api/copilot/history", headers=H("driver.t3")).status_code == 403
    assert client.post("/api/copilot", json={"question": "x"}, headers=H("camp.majuli")).status_code == 403
    assert client.post("/api/copilot", json={"question": "x", "id": "bad id!"}).status_code == 422
