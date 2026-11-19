"""Field Intake agent: free-text camp reports (English or Assamese) -> validated, structured updates.

AI proposes, code and humans confirm:
* `parse()` is pure (safe to run off the event loop): the LLM, or, offline, a *recorded* AI response for the two
  scripted demo reports (labelled as such). Output is validated with Pydantic; anything else is "unparsed".
* `apply()` runs on the simulation thread with deterministic rules: big population changes (> 30%), low confidence,
  AI-flagged doubts, or shortages that contradict the records wait for Command to confirm. Notes about items the
  system doesn't stock (ORS, baby food) and health flags are attached immediately: they change no numbers.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from app.auth.context import who
from app.config import DATA_DIR
from app.llm.client import LLMClient, LLMError, display_name
from app.llm.prompts import FIELD_INTAKE_SCHEMA, FIELD_INTAKE_SYSTEM
from app.models import ITEMS, Camp, FieldReport, ParsedReport, Supplies
from app.sim.world import WorldState
from app.text import fmt_days

BIG_POP_CHANGE = 0.30
MIN_CONFIDENCE = 0.7
CONTRADICTION_DAYS = 0.25  # "water finished" but records show at least this much cover -> ask a human
ITEM_NAME = {"water_l": "drinking water", "food_rations": "food", "medical_kits": "medical kits"}


def load_demo_reports() -> list[dict[str, Any]]:
    return json.loads((DATA_DIR / "demo_reports.json").read_text())


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


@dataclass
class ParseOutcome:
    parsed: ParsedReport | None
    source: str  # llm | recorded | none
    model: str | None
    latency_ms: int | None
    error: str | None = None


class FieldIntakeAgent:
    """Reads what people on the ground write and proposes structured updates."""

    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm
        self._recorded = {_norm(r["text"]): r for r in load_demo_reports()}

    # ------------------------------------------------------------ parse (pure)
    def parse(self, camp_name: str, population: int, water_days: float, text: str) -> ParseOutcome:
        if self.llm.available:
            user = json.dumps(
                {
                    "camp": camp_name,
                    "current_population": population,
                    "water_days_on_record": round(water_days, 2),
                    "report": text,
                },
                ensure_ascii=False,
            )
            try:
                res = self.llm.complete_json(FIELD_INTAKE_SYSTEM, user, FIELD_INTAKE_SCHEMA, max_tokens=1500)
                return ParseOutcome(ParsedReport.model_validate(res.data), "llm", res.model, res.latency_ms)
            except (LLMError, ValidationError) as exc:
                return ParseOutcome(None, "none", self.llm.model, None, str(exc).splitlines()[0])
        rec = self._recorded.get(_norm(text))
        if rec:
            return ParseOutcome(ParsedReport.model_validate(rec["recorded"]), "recorded", None, 0)
        return ParseOutcome(None, "none", None, None, "no AI provider configured (mock mode)")

    # ------------------------------------------------------------ apply (simulation thread)
    def apply(self, world: WorldState, report: FieldReport, outcome: ParseOutcome) -> FieldReport:
        camp = world.camps[report.camp_id]
        report.parsed, report.source = outcome.parsed, outcome.source  # type: ignore[assignment]
        report.model, report.latency_ms = outcome.model, outcome.latency_ms
        who = self._who(outcome)
        if outcome.parsed is None:
            report.status = "unparsed"
            report.reasons = [f"Could not be read automatically ({outcome.error}). Flagged for human review."]
            world.bus.log(
                "field_intake",
                "field_report.unparsed",
                f"Field report from {camp.name} could not be parsed and is flagged for Command to read.",
                f'"{report.text}"\n{report.reasons[0]}',
                camp_ids=[camp.id],
            )
            return report
        p = outcome.parsed
        self._attach_notes(camp, p)
        reasons = self._reasons_to_confirm(world, camp, p)
        report.changes = self._describe_changes(world, camp, p)
        notes = self._notes_text(p)
        if reasons:
            report.status = "pending_confirmation"
            report.reasons = reasons
            world.bus.log(
                "field_intake",
                "field_report.pending",
                f"Field report from {camp.name} parsed{who}: needs Command confirmation ({'; '.join(reasons)}).",
                f'"{report.text}"\nProposed: {", ".join(report.changes) or "no number changes"}.{notes} '
                f"Confidence {p.confidence:.0%}.",
                camp_ids=[camp.id],
            )
        else:
            report.status = "applied"
            self._apply_numbers(world, camp, p)
            world.bus.log(
                "field_intake",
                "field_report.applied",
                f"Field report from {camp.name} applied{who}: "
                f"{', '.join(report.changes) or 'no number changes'}.{notes}",
                f'"{report.text}"\nConfidence {p.confidence:.0%}. Population changes up to {BIG_POP_CHANGE:.0%} and '
                "notes are applied automatically; bigger changes wait for Command.",
                camp_ids=[camp.id],
            )
        return report

    def confirm(self, world: WorldState, report: FieldReport) -> FieldReport:
        camp = world.camps[report.camp_id]
        if report.parsed is not None:
            self._apply_numbers(world, camp, report.parsed)
        report.status = "confirmed"
        world.bus.log(
            "human",
            "field_report.confirmed",
            f"{who('Command')} confirmed the field report from {camp.name}"
            + (f": {', '.join(report.changes)}." if report.changes else "."),
            "A human checked the AI's reading before the numbers changed.",
            camp_ids=[camp.id],
        )
        return report

    def reject(self, world: WorldState, report: FieldReport) -> FieldReport:
        camp = world.camps[report.camp_id]
        report.status = "rejected"
        world.bus.log(
            "human",
            "field_report.rejected",
            f"{who('Command')} rejected the field report from {camp.name}.",
            camp_ids=[camp.id],
        )
        return report

    # ------------------------------------------------------------ helpers
    def _who(self, o: ParseOutcome) -> str:
        if o.source == "llm":
            return f" by {display_name(o.model or '')}"
        if o.source == "recorded":
            return " (recorded AI response, offline demo)"
        return ""

    @staticmethod
    def target_population(camp: Camp, p: ParsedReport) -> int | None:
        if p.new_population is not None:
            return p.new_population
        if p.population_delta is not None:
            return max(0, camp.population + p.population_delta)
        return None

    def _reasons_to_confirm(self, world: WorldState, camp: Camp, p: ParsedReport) -> list[str]:
        reasons = []
        target = self.target_population(camp, p)
        change = abs(target - camp.population) / camp.population if target is not None and camp.population else 0.0
        if change > BIG_POP_CHANGE:
            reasons.append(f"population {camp.population:,} → {target:,} is a {change:.0%} change")
        if p.confidence < MIN_CONFIDENCE:
            reasons.append(f"AI confidence only {p.confidence:.0%}")
        if p.needs_human_check:
            reasons.append("the AI flagged it for a human check")
        burn = world.burn_per_day(camp)
        for item in p.shortages:
            days = camp.stock.get(item) / burn[item] if burn[item] else 0
            if days >= CONTRADICTION_DAYS:
                reasons.append(f"says {ITEM_NAME[item]} is finished, records show {fmt_days(days)}")
        return reasons

    def _describe_changes(self, world: WorldState, camp: Camp, p: ParsedReport) -> list[str]:
        out = []
        target = self.target_population(camp, p)
        if target is not None and target != camp.population:
            out.append(f"population {camp.population:,} → {target:,}")
        for item in p.shortages:
            out.append(f"{ITEM_NAME[item]} stock → 0")
        return out

    def _apply_numbers(self, world: WorldState, camp: Camp, p: ParsedReport) -> None:
        target = self.target_population(camp, p)
        if target is not None:
            camp.population = target
        if p.shortages:
            camp.stock = Supplies(**{i: 0 if i in p.shortages else camp.stock.get(i) for i in ITEMS})

    @staticmethod
    def _attach_notes(camp: Camp, p: ParsedReport) -> None:
        for n in p.urgent_needs:
            if n not in camp.urgent_needs:
                camp.urgent_needs.append(n)
        for n in p.health_flags:
            if n not in camp.health_flags:
                camp.health_flags.append(n)

    @staticmethod
    def _notes_text(p: ParsedReport) -> str:
        parts = []
        if p.urgent_needs:
            parts.append(f" Urgent (not stocked): {', '.join(p.urgent_needs)}.")
        if p.health_flags:
            parts.append(f" Health: {', '.join(p.health_flags)}.")
        return "".join(parts)
