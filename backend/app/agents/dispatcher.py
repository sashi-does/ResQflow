"""Dispatcher + approval gate: re-validates each order against the current world, then dispatches or asks a human."""

from __future__ import annotations

from app.agents.types import CheckedOrder, PlanResult
from app.agents.validator import validate
from app.auth.context import who
from app.models import ApprovalPolicy, Order
from app.sim import engine
from app.sim.world import WorldState
from app.text import fmt_duration, fmt_items, fmt_kg


class DispatcherAgent:
    """Turns validated plan orders into real dispatches.

    Orders above `approval_threshold_kg`, or that draw on a warehouse's safety reserve, wait for a human.
    `auto_approve_after_s` is set only for headless and baseline runs (never in the live UI).
    """

    def __init__(
        self,
        approval_threshold_kg: float,
        auto_approve_after_s: int | None = None,
        policy: ApprovalPolicy | None = None,
    ) -> None:
        self.threshold = approval_threshold_kg
        self.auto_approve_after_s = auto_approve_after_s
        self.policy = policy  # live mode only: Command's approval policy

    def policy_eligible(self, order: Order) -> bool:
        p = self.policy
        return bool(
            p
            and p.auto_approve_critical
            and order.priority == "critical"
            and not order.uses_reserve
            and order.weight_kg <= p.max_tonnes * 1000 + 1e-6
        )

    def _auto_time(self, order: Order) -> int | None:
        if order.approval_requested_at_sim is None:
            return None
        if self.auto_approve_after_s is not None:  # headless / baseline stand-in for the officer
            return order.approval_requested_at_sim + self.auto_approve_after_s
        if self.policy_eligible(order):
            return order.approval_requested_at_sim + (self.policy.delay_min if self.policy else 0) * 60
        return None

    def set_policy(self, world: WorldState, policy: ApprovalPolicy) -> None:
        """Change the policy and re-time every waiting order."""
        self.policy = policy
        for o in world.orders.values():
            if o.status == "awaiting_approval":
                o.auto_approve_at_sim = self._auto_time(o)
                world.bus.publish("order.updated", o.model_dump())
        state = "on" if policy.auto_approve_critical else "off"
        world.bus.log(
            "human",
            "policy.updated",
            f"Approval policy updated: auto-approve critical orders up to {policy.max_tonnes:g} t after "
            f"{policy.delay_min} min is {state}.",
            "Orders that draw on a warehouse's safety reserve always need a human decision.",
        )

    def execute(self, world: WorldState, result: PlanResult) -> list[Order]:
        if not result.validation.ok:
            return []
        out = []
        for co in result.validation.orders:
            order = self._make_order(world, co, result.source)
            world.orders[order.id] = order
            check = validate(world, {"orders": [self._as_plan_order(order)]})
            if not check.ok:
                order.status = "failed"
                world.bus.log(
                    "dispatcher",
                    "order.dropped",
                    f"Dropped order {order.id} ({world.camps[order.camp_id].name}): {check.hard[0].message}",
                    "The world changed while the plan was being made, so the order was checked again just before "
                    "dispatch and no longer passes.",
                    order_ids=[order.id],
                    truck_ids=[order.truck_id],
                )
                world.bus.publish("order.updated", order.model_dump())
                continue
            order.uses_reserve = check.orders[0].uses_reserve
            self._gate_or_dispatch(world, order)
            out.append(order)
        return out

    # ------------------------------------------------------------ human decisions
    def approve(self, world: WorldState, order_id: str, note: str | None = None, *, auto: bool = False) -> Order:
        order = world.orders[order_id]
        if order.status != "awaiting_approval":
            return order
        check = validate(world, {"orders": [self._as_plan_order(order)]}, exclude_order_ids=[order.id])
        if not check.ok:
            order.status = "failed"
            world.trucks[order.truck_id].order_id = None
            world.bus.log(
                "dispatcher",
                "order.failed",
                f"Order {order.id} could not go after approval: {check.hard[0].message}",
                "Re-checked against the current situation at approval time.",
                order_ids=[order.id],
                truck_ids=[order.truck_id],
            )
            world.bus.publish("order.updated", order.model_dump())
            return order
        if auto and self.auto_approve_after_s is not None:
            world.bus.log(
                "dispatcher",
                "order.approved",
                f"Auto-approved order {order.id} (headless run) after {fmt_duration(self.auto_approve_after_s / 60)}.",
                "Headless and baseline runs stand in for the district officer. "
                "In the live dashboard the Command approval policy or a human decides.",
                order_ids=[order.id],
            )
        elif auto:
            p = self.policy or ApprovalPolicy()
            world.bus.log(
                "dispatcher",
                "order.approved",
                f"Auto-approved order {order.id} under the Command policy (critical, up to {p.max_tonnes:g} t): "
                f"nobody objected within {p.delay_min} min.",
                "The camp is critical, so waiting longer would cost water. Command can change this policy at any time.",
                order_ids=[order.id],
                truck_ids=[order.truck_id],
            )
        else:
            world.bus.log(
                "human",
                "order.approved",
                f"Approved by {who('the District Officer')}. Order {order.id} released."
                + (f' Note: "{note}"' if note else ""),
                order_ids=[order.id],
                truck_ids=[order.truck_id],
            )
        self._dispatch(world, order)
        return order

    def reject(self, world: WorldState, order_id: str, note: str | None = None) -> Order:
        order = world.orders[order_id]
        if order.status != "awaiting_approval":
            return order
        order.status = "rejected"
        world.trucks[order.truck_id].order_id = None
        world.bus.log(
            "human",
            "order.rejected",
            f"Rejected by {who('the District Officer')}: order {order.id} to {world.camps[order.camp_id].name}. "
            f"Truck {order.truck_id} released." + (f' Note: "{note}"' if note else ""),
            "The next planning cycle will re-plan without this order.",
            order_ids=[order.id],
            truck_ids=[order.truck_id],
        )
        world.bus.publish("order.updated", order.model_dump())
        return order

    def auto_approve(self, world: WorldState) -> None:
        for order in sorted(world.orders.values(), key=lambda o: o.id):
            if (
                order.status == "awaiting_approval"
                and order.auto_approve_at_sim is not None
                and world.sim_seconds >= order.auto_approve_at_sim
            ):
                self.approve(world, order.id, auto=True)

    def recall_cut_off(self, world: WorldState) -> None:
        """Cancel orders to camps that just became unreachable, if their truck is stuck or not yet on the road."""
        for order in sorted(world.orders.values(), key=lambda o: o.id):
            if order.status != "dispatched" or not world.camps[order.camp_id].cut_off:
                continue
            t = world.trucks[order.truck_id]
            if not (t.status in ("holding", "loading") or t.leg in ("hold", "reposition")):
                continue
            camp = world.camps[order.camp_id]
            order.status = "failed"
            t.order_id = None
            if t.cargo.is_empty():  # not loaded yet: the stock never left the warehouse
                w = world.warehouses[order.warehouse_id]
                w.stock = w.stock + order.items
                what = f"The {fmt_kg(order.weight_kg)} set aside at {w.name} is released"
            else:
                what = f"Truck {t.id} brings its {fmt_kg(order.weight_kg)} load back to the nearest warehouse"
            world.bus.log(
                "dispatcher",
                "order.recalled",
                f"Recalled order {order.id}: {camp.name} is cut off. {what} for another camp.",
                "No truck can reach the camp by road, so holding a load for it only wastes a truck. The camp is "
                "flagged for a boat or air drop instead.",
                order_ids=[order.id],
                truck_ids=[t.id],
                camp_ids=[camp.id],
            )
            world.bus.publish("order.updated", order.model_dump())
            if t.status == "loading":
                t.timer_s = 0
                engine._become_idle(world, t, t.at_warehouse or order.warehouse_id)
            elif t.status == "holding" or t.leg == "hold" or t.leg == "reposition":
                engine.send_to_nearest_warehouse(world, t)
            engine.emit_truck(world, t)

    # ------------------------------------------------------------ internals
    def _gate_or_dispatch(self, world: WorldState, order: Order) -> None:
        w = world.warehouses[order.warehouse_id]
        reasons = []
        if order.weight_kg > self.threshold:
            reasons.append(f"above the {fmt_kg(self.threshold)} limit")
        if order.uses_reserve:
            reasons.append(f"draws on {w.name}'s safety reserve")
        if reasons:
            order.status = "awaiting_approval"
            order.approval_reasons = reasons
            order.approval_requested_at_sim = world.sim_seconds
            order.auto_approve_at_sim = self._auto_time(order)
            world.trucks[order.truck_id].order_id = order.id  # reserve the truck
            world.bus.log(
                "dispatcher",
                "approval.requested",
                f"Order {order.id} ({fmt_kg(order.weight_kg)}, {w.name} → "
                f"{world.camps[order.camp_id].name.replace(' Relief Camp', '')}) needs approval: "
                f"{' and '.join(reasons)}.",
                f"Truck {order.truck_id} is reserved meanwhile. Load: {fmt_items(order.items)}. {order.reason}",
                order_ids=[order.id],
                truck_ids=[order.truck_id],
                camp_ids=[order.camp_id],
            )
            world.bus.publish("approval.requested", order.model_dump())
            world.bus.publish("order.updated", order.model_dump())
            return
        self._dispatch(world, order)

    def _dispatch(self, world: WorldState, order: Order) -> None:
        t = world.trucks[order.truck_id]
        origin = world.warehouses[t.at_warehouse or order.warehouse_id]
        engine.dispatch(world, order)
        w = world.warehouses[order.warehouse_id]
        camp = world.camps[order.camp_id]
        empty_leg = engine.remaining_minutes(world, t) if t.status != "loading" else 0.0
        total = empty_leg + world.c["load_min"] + (order.eta_min or 0)
        reposition = "" if t.status == "loading" else f", after driving empty from {origin.name} to load"
        world.bus.log(
            "dispatcher",
            "order.dispatched",
            f"Dispatched Truck {t.id} from {w.name} to {camp.name} with {fmt_items(order.items)} "
            f"({fmt_kg(order.weight_kg)}). Arrives in about {fmt_duration(total)}{reposition}.",
            order.reason,
            order_ids=[order.id],
            truck_ids=[t.id],
            camp_ids=[camp.id],
        )
        world.bus.publish("order.updated", order.model_dump())

    @staticmethod
    def _make_order(world: WorldState, co: CheckedOrder, source: str) -> Order:
        prio = co.priority if co.priority in ("critical", "high", "normal") else "normal"
        return Order(
            id=world.new_order_id(),
            warehouse_id=co.warehouse_id,
            camp_id=co.camp_id,
            truck_id=co.truck_id,
            items=co.items,
            weight_kg=co.weight_kg,
            priority=prio,  # type: ignore[arg-type]
            reason=co.reason,
            source=source,  # type: ignore[arg-type]
            created_at_sim=world.sim_seconds,
            eta_min=co.eta_min,
        )

    @staticmethod
    def _as_plan_order(order: Order) -> dict:
        return {
            "warehouse_id": order.warehouse_id,
            "camp_id": order.camp_id,
            "truck_id": order.truck_id,
            "items": order.items.as_dict(),
        }
