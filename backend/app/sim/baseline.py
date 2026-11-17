"""Counterfactual "static plan" baseline (docs/02_ARCHITECTURE.md).

Same scenario, same floods, same trucks, same heuristic for sizing, same approval gate (auto-approved after
20 sim-min). The differences are exactly what a static plan lacks:
  * the allocation is decided once at 06:00 and each truck keeps its original target camp;
  * it is hazard-unaware: routes ignore floods, so trucks drive up to a flooded road and wait there until it
    reopens; nothing is ever re-routed;
  * idle trucks are periodically (hourly) re-sent to their original target, nothing else.
"""

from __future__ import annotations

from app.agents.dispatcher import DispatcherAgent
from app.agents.heuristic_planner import MIN_LOAD_CRITICAL_KG, MIN_LOAD_KG, _load, heuristic_plan, top_up_want
from app.agents.inventory import InventoryAgent
from app.agents.types import PlanResult
from app.agents.validator import validate
from app.geo.hazards import hazard_from_preset
from app.sim.runner import TimelineEvent
from app.sim.world import WorldState


class StaticPolicy:
    """Plan once at t=0, never re-route, re-send idle trucks to their original camps every hour."""

    def __init__(
        self, *, approval_threshold_kg: float = 6000, auto_approve_after_s: int = 1200, replan_every_min: int = 60
    ) -> None:
        self.threshold = approval_threshold_kg
        self.dispatcher = DispatcherAgent(approval_threshold_kg, auto_approve_after_s)
        self.inventory = InventoryAgent()
        self.replan_every_s = replan_every_min * 60
        self.targets: dict[str, str] = {}  # truck_id -> camp_id (fixed at t=0)
        self.last_redispatch: int | None = None

    def on_step(self, world: WorldState, events: list[TimelineEvent]) -> None:
        for ev in events:  # floods physically happen, but the plan never learns about them
            if ev.action == "hazard_add" and ev.preset_id:
                preset = world.scenario.presets[ev.preset_id]
                world.add_hazard(hazard_from_preset(preset, world.graph, world.new_hazard_id(), world.sim_seconds))
            elif ev.action == "hazard_remove" and ev.preset_id:
                for hid, h in list(world.hazards.items()):
                    if h.preset_id == ev.preset_id:
                        world.remove_hazard(hid)
        self.dispatcher.auto_approve(world)
        if self.last_redispatch is None:
            self._initial_plan(world)
            self.last_redispatch = world.sim_seconds
        elif world.sim_seconds - self.last_redispatch >= self.replan_every_s:
            self._redispatch(world)
            self.last_redispatch = world.sim_seconds

    def _initial_plan(self, world: WorldState) -> None:
        statuses = {c.id: self.inventory.camp_status(world, c, reachable=True) for c in world.camps.values()}
        plan = heuristic_plan(world, statuses, approval_threshold_kg=self.threshold)
        res = validate(world, plan)
        self.targets = {o.truck_id: o.camp_id for o in res.orders}
        self.dispatcher.execute(world, PlanResult(plan, res, "heuristic", 1, 0, "static plan"))

    def _redispatch(self, world: WorldState) -> None:
        orders = []
        for truck_id, camp_id in sorted(self.targets.items()):
            if not world.truck_is_free(truck_id):
                continue
            t = world.trucks[truck_id]
            w = world.warehouses[t.at_warehouse or ""]
            st = self.inventory.camp_status(world, world.camps[camp_id], reachable=True)
            if st.deficit_24h.is_empty():
                continue
            want = top_up_want(world, st)
            critical = st.status == "critical"
            cap = t.capacity_kg if critical else min(t.capacity_kg, self.threshold)
            items, _ = _load(world, want, world.available(w), world.reserve_held(w) if critical else None, cap)
            if world.weight(items) < (MIN_LOAD_CRITICAL_KG if critical else MIN_LOAD_KG):
                continue
            orders.append(
                {
                    "warehouse_id": w.id,
                    "camp_id": camp_id,
                    "truck_id": truck_id,
                    "items": items.as_dict(),
                    "reason": "Static plan: original target.",
                }
            )
        if not orders:
            return
        res = validate(world, {"orders": orders})
        if not res.ok:  # e.g. two trucks drawing on the same warehouse: fall back to one-by-one
            for o in orders:
                single = validate(world, {"orders": [o]})
                if single.ok:
                    self.dispatcher.execute(world, PlanResult({"orders": [o]}, single, "heuristic", 1, 0, "static"))
            return
        self.dispatcher.execute(world, PlanResult({"orders": orders}, res, "heuristic", 1, 0, "static re-dispatch"))
