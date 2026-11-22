"""Postgres history: every run, decision-log entry, coordination cycle, AI conversation, field report and KPI snapshot.

Optional (`DATABASE_URL`). Writes go through a queue to one background thread, so the simulation never waits on the
network; if the database is unreachable the app keeps running and says so once (`status`). No ORM, no migrations:
tables are created with `CREATE TABLE IF NOT EXISTS` on start.
"""

from __future__ import annotations

import contextlib
import json
import logging
import queue
import threading
import uuid
from datetime import UTC, datetime
from typing import Any

log = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
  id text PRIMARY KEY,
  case_id text NOT NULL,
  case_title text NOT NULL,
  mode text NOT NULL,
  seed int,
  llm_provider text,
  llm_model text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  last_sim_time text,
  agentic_kpis jsonb,
  baseline_kpis jsonb,
  report jsonb
);
CREATE TABLE IF NOT EXISTS decision_log (
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  entry_id int NOT NULL,
  cycle int,
  sim_seconds int NOT NULL,
  sim_time text NOT NULL,
  agent text NOT NULL,
  kind text NOT NULL,
  summary text NOT NULL,
  reasoning text NOT NULL DEFAULT '',
  refs jsonb,
  actor text,
  llm_call text,
  real_time timestamptz,
  PRIMARY KEY (run_id, entry_id)
);
CREATE INDEX IF NOT EXISTS decision_log_cycle ON decision_log (run_id, cycle);
CREATE TABLE IF NOT EXISTS llm_calls (
  id text PRIMARY KEY,
  run_id text REFERENCES runs(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  model text,
  provider text,
  system_prompt text,
  user_prompt text,
  response text,
  tool_calls jsonb,
  latency_ms int,
  input_tokens int,
  output_tokens int,
  ok boolean,
  error text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS field_reports (
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  report_id text NOT NULL,
  camp_id text NOT NULL,
  sim_time text,
  text text NOT NULL,
  status text,
  source text,
  parsed jsonb,
  changes jsonb,
  llm_call text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, report_id)
);
CREATE TABLE IF NOT EXISTS kpi_snapshots (
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  sim_seconds int NOT NULL,
  sim_time text NOT NULL,
  agentic jsonb NOT NULL,
  baseline jsonb NOT NULL,
  PRIMARY KEY (run_id, sim_seconds)
);
CREATE TABLE IF NOT EXISTS copilot_messages (
  id text PRIMARY KEY,
  username text NOT NULL,
  asked_by text,
  question text NOT NULL,
  status text NOT NULL,
  answer text,
  model text,
  provider text,
  tools_used jsonb,
  latency_ms int,
  call_id text,
  sim_time text,
  case_id text,
  run_id text,
  asked_at timestamptz NOT NULL,
  answered_at timestamptz
);
CREATE INDEX IF NOT EXISTS copilot_messages_user ON copilot_messages (username, asked_at);
CREATE OR REPLACE VIEW coordination_cycles AS
  SELECT run_id, cycle, min(sim_time) AS started, max(sim_time) AS finished, count(*) AS steps,
         array_agg(DISTINCT agent) AS agents,
         (array_agg(summary ORDER BY entry_id) FILTER (WHERE kind = 'cycle.started'))[1] AS trigger
  FROM decision_log WHERE cycle IS NOT NULL GROUP BY run_id, cycle;
"""

_STOP = object()


def _j(v: Any) -> str | None:
    return None if v is None else json.dumps(v, default=str, ensure_ascii=False)


class Store:
    """Fire-and-forget writer plus a few read queries for the history pages."""

    def __init__(self, url: str | None) -> None:
        self.url = (url or "").strip()
        self.enabled = bool(self.url)
        self.status = "off" if not self.enabled else "connecting"
        self._q: queue.Queue = queue.Queue(maxsize=50_000)
        self._thread: threading.Thread | None = None
        self._runs: dict[str, dict[str, Any]] = {}  # run id -> row, inserted lazily on its first write
        self._inserted: set[str] = set()
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ lifecycle
    def start(self) -> None:
        if not self.enabled or self._thread is not None:
            return
        self._thread = threading.Thread(target=self._worker, name="persist", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._thread is not None:
            self._q.put(_STOP)
            self._thread.join(timeout=5)
            self._thread = None

    def flush(self, timeout: float = 30) -> None:
        """Block until queued writes are done (headless saves, tests)."""
        if self._thread is None:
            return
        done = threading.Event()
        self._q.put(done)
        done.wait(timeout)

    def _connect(self) -> Any:
        import psycopg

        # prepare_threshold=None: works through connection poolers (Prisma Postgres, PgBouncer)
        return psycopg.connect(self.url, connect_timeout=15, prepare_threshold=None, autocommit=True)

    def _worker(self) -> None:
        """Drain the queue in batches; each batch is pipelined (one network round trip for hundreds of rows)."""
        conn = None
        stop = False
        while not stop:
            batch: list[tuple[str, tuple]] = []
            events: list[threading.Event] = []
            item = self._q.get()
            while True:
                if item is _STOP:
                    stop = True
                elif isinstance(item, threading.Event):
                    events.append(item)
                else:
                    batch.append(item)
                if len(batch) >= 500:
                    break
                try:
                    item = self._q.get_nowait()
                except queue.Empty:
                    break
            if batch:
                conn = self._write(conn, batch)
            for ev in events:
                ev.set()
        if conn is not None:
            conn.close()

    def _write(self, conn: Any, batch: list[tuple[str, tuple]]) -> Any:
        for attempt in (1, 2):
            try:
                if conn is None or conn.closed:
                    conn = self._connect()
                    conn.execute(SCHEMA)
                    self.status = "connected"
                try:
                    with conn.pipeline():
                        for sql, params in batch:
                            conn.execute(sql, params)
                except Exception:
                    if conn.closed:
                        raise
                    for sql, params in batch:  # one bad row must not lose the batch: retry one by one
                        with contextlib.suppress(Exception):
                            conn.execute(sql, params)
                return conn
            except Exception as exc:
                if conn is not None:
                    with contextlib.suppress(Exception):
                        conn.close()
                conn = None
                if attempt == 2:
                    if self.status != "error":
                        log.warning("History database unavailable: %s", str(exc).splitlines()[0])
                    self.status = "error"
        return conn

    def _put(self, sql: str, params: tuple) -> None:
        if not self.enabled:
            return
        with contextlib.suppress(queue.Full):  # never block the simulation
            self._q.put_nowait((sql, params))

    # ------------------------------------------------------------------ writes
    def new_run(self, *, case_id: str, case_title: str, mode: str, seed: int, provider: str, model: str) -> str:
        run_id = f"{datetime.now(UTC):%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6]}"
        with self._lock:
            self._runs[run_id] = {
                "case_id": case_id,
                "case_title": case_title,
                "mode": mode,
                "seed": seed,
                "provider": provider,
                "model": model,
            }
        return run_id

    def _ensure_run(self, run_id: str) -> None:
        """Runs that never start (a reset with no step) leave no row."""
        with self._lock:
            if run_id in self._inserted or run_id not in self._runs:
                return
            self._inserted.add(run_id)
            r = self._runs[run_id]
        self._put(
            "INSERT INTO runs (id, case_id, case_title, mode, seed, llm_provider, llm_model) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING",
            (run_id, r["case_id"], r["case_title"], r["mode"], r["seed"], r["provider"], r["model"]),
        )

    def log_entry(self, run_id: str, e: dict[str, Any]) -> None:
        if not self.enabled:
            return
        self._ensure_run(run_id)
        self._put(
            "INSERT INTO decision_log (run_id, entry_id, cycle, sim_seconds, sim_time, agent, kind, summary, reasoning,"
            " refs, actor, llm_call, real_time) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"
            " ON CONFLICT (run_id, entry_id) DO NOTHING",
            (
                run_id,
                e["id"],
                e.get("cycle"),
                e["sim_seconds"],
                e["sim_time"],
                e["agent"],
                e["kind"],
                e["summary"],
                e.get("reasoning", ""),
                _j(e.get("refs")),
                e.get("actor"),
                e.get("llm_call"),
                e.get("real_time"),
            ),
        )

    def llm_call(self, run_id: str | None, c: dict[str, Any]) -> None:
        if not self.enabled:
            return
        if run_id:
            self._ensure_run(run_id)
        self._put(
            "INSERT INTO llm_calls (id, run_id, purpose, model, provider, system_prompt, user_prompt, response,"
            " tool_calls, latency_ms, input_tokens, output_tokens, ok, error, meta, created_at)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING",
            (
                c["id"],
                run_id if run_id in self._inserted else None,
                c["purpose"],
                c["model"],
                c["provider"],
                c["system"],
                c["user"],
                c["response"],
                _j(c["tool_calls"]),
                c["latency_ms"],
                c["input_tokens"],
                c["output_tokens"],
                c["ok"],
                c["error"],
                _j(c["meta"]),
                c["created_at"],
            ),
        )

    def field_report(self, run_id: str, r: dict[str, Any]) -> None:
        if not self.enabled:
            return
        self._ensure_run(run_id)
        self._put(
            "INSERT INTO field_reports (run_id, report_id, camp_id, sim_time, text, status, source, parsed, changes,"
            " llm_call) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (run_id, report_id) DO UPDATE SET"
            " status = EXCLUDED.status, parsed = EXCLUDED.parsed, changes = EXCLUDED.changes, updated_at = now()",
            (
                run_id,
                r["id"],
                r["camp_id"],
                r.get("sim_time"),
                r["text"],
                r.get("status"),
                r.get("source"),
                _j(r.get("parsed")),
                _j(r.get("changes")),
                r.get("llm_call"),
            ),
        )

    def kpis(self, run_id: str, sim_seconds: int, sim_time: str, agentic: dict, baseline: dict) -> None:
        if not self.enabled:
            return
        self._ensure_run(run_id)
        self._put(
            "INSERT INTO kpi_snapshots (run_id, sim_seconds, sim_time, agentic, baseline) VALUES (%s,%s,%s,%s,%s)"
            " ON CONFLICT (run_id, sim_seconds) DO NOTHING",
            (run_id, sim_seconds, sim_time, _j(agentic), _j(baseline)),
        )
        self._put(
            "UPDATE runs SET last_sim_time = %s, agentic_kpis = %s, baseline_kpis = %s WHERE id = %s",
            (sim_time, _j(agentic), _j(baseline), run_id),
        )

    def end_run(self, run_id: str, sim_time: str, agentic: dict, baseline: dict, report: dict | None) -> None:
        if not self.enabled:
            return
        self._ensure_run(run_id)
        self._put(
            "UPDATE runs SET ended_at = now(), last_sim_time = %s, agentic_kpis = %s, baseline_kpis = %s,"
            " report = coalesce(%s::jsonb, report) WHERE id = %s",
            (sim_time, _j(agentic), _j(baseline), _j(report), run_id),
        )

    def copilot_message(self, m: dict[str, Any]) -> None:
        """Ask ResQflow: one question and (once it exists) its answer; upserted as it goes pending → answered."""
        if not self.enabled:
            return
        self._put(
            "INSERT INTO copilot_messages (id, username, asked_by, question, status, answer, model, provider,"
            " tools_used, latency_ms, call_id, sim_time, case_id, run_id, asked_at, answered_at)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO UPDATE SET"
            " status = EXCLUDED.status, answer = EXCLUDED.answer, model = EXCLUDED.model, provider = EXCLUDED.provider,"
            " tools_used = EXCLUDED.tools_used, latency_ms = EXCLUDED.latency_ms, call_id = EXCLUDED.call_id,"
            " answered_at = EXCLUDED.answered_at",
            (
                m["id"],
                m["username"],
                m.get("asked_by"),
                m["question"],
                m["status"],
                m.get("answer"),
                m.get("model"),
                m.get("provider"),
                _j(m.get("tools_used")),
                m.get("latency_ms"),
                m.get("call_id"),
                m.get("sim_time"),
                m.get("case_id"),
                m.get("run_id"),
                m["asked_at"],
                m.get("answered_at"),
            ),
        )

    # ------------------------------------------------------------------ reads (called off the event loop)
    def _rows(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        from psycopg.rows import dict_row

        with self._connect() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]

    def copilot_history(self, username: str, limit: int = 50) -> list[dict[str, Any]]:
        rows = self._rows(
            "SELECT id, username, asked_by, question, status, answer, model, provider, tools_used, latency_ms, call_id,"
            " sim_time, case_id, run_id, asked_at, answered_at FROM copilot_messages WHERE username = %s"
            " ORDER BY asked_at DESC LIMIT %s",
            (username, limit),
        )
        for r in rows:  # same shape as the in-memory records
            for k in ("asked_at", "answered_at"):
                if r[k] is not None:
                    r[k] = r[k].isoformat(timespec="milliseconds")
            r["tools_used"] = r["tools_used"] or []
        return rows

    def runs(self, limit: int = 30) -> list[dict[str, Any]]:
        return self._rows(
            "SELECT r.id, r.case_id, r.case_title, r.mode, r.llm_provider, r.llm_model, r.started_at, r.ended_at,"
            " r.last_sim_time, r.agentic_kpis, r.baseline_kpis, r.report IS NOT NULL AS has_report,"
            " (SELECT count(*) FROM decision_log d WHERE d.run_id = r.id) AS entries,"
            " (SELECT count(*) FROM llm_calls c WHERE c.run_id = r.id) AS ai_calls,"
            " (SELECT count(*) FROM coordination_cycles k WHERE k.run_id = r.id AND k.steps > 1) AS cycles"
            " FROM runs r ORDER BY r.started_at DESC LIMIT %s",
            (limit,),
        )

    def run_log(self, run_id: str, limit: int = 2000) -> list[dict[str, Any]]:
        return self._rows(
            "SELECT entry_id AS id, cycle, sim_seconds, sim_time, agent, kind, summary, reasoning, refs, actor,"
            " llm_call, real_time FROM decision_log WHERE run_id = %s ORDER BY entry_id DESC LIMIT %s",
            (run_id, limit),
        )

    def get_llm_call(self, call_id: str) -> dict[str, Any] | None:
        rows = self._rows(
            "SELECT id, purpose, model, provider, system_prompt AS system, user_prompt AS user, response, tool_calls,"
            " latency_ms, input_tokens, output_tokens, ok, error, meta, created_at FROM llm_calls WHERE id = %s",
            (call_id,),
        )
        return rows[0] if rows else None
