"""What each role may see: filters for REST lists, the snapshot, and every WebSocket message (docs/11 §1).

officer   -> everything
camp      -> its own camp's reports/orders/log, trucks heading to it; hazards, camps, warehouses for map context
driver    -> its own truck, its orders, log entries about it; hazards, camps, warehouses for map context
warehouse -> its own stock, all trucks (it loads them), its orders, log entries about its orders or naming it
"""

from __future__ import annotations

from typing import Any

from app.auth.users import User

OFFICER_ONLY = {"kpis", "plan.started", "plan.completed", "approval.requested", "policy.updated", "report.ready"}
EVERYONE = {"hazard.added", "hazard.removed", "hazard.updated"}


class Visibility:
    """Bound to one user + a way to look up order owners (orders can leave the active list)."""

    def __init__(self, user: User, order_lookup: dict[str, Any] | None = None, warehouse_name: str = "") -> None:
        self.user = user
        self.role = user.role
        self.scope = user.scope_id
        self.orders = order_lookup or {}
        self.wh_name = warehouse_name

    # ------------------------------------------------------------ items
    def order(self, o: dict[str, Any]) -> bool:
        return {
            "officer": True,
            "camp": o.get("camp_id") == self.scope,
            "driver": o.get("truck_id") == self.scope,
            "warehouse": o.get("warehouse_id") == self.scope,
        }.get(self.role, False)

    def report(self, r: dict[str, Any]) -> bool:
        return self.role == "officer" or (self.role == "camp" and r.get("camp_id") == self.scope)

    def truck(self, t: dict[str, Any]) -> bool:
        if self.role in ("officer", "warehouse"):
            return True
        if self.role == "driver":
            return t.get("id") == self.scope
        if self.role == "camp":
            return (t.get("job") or {}).get("camp_id") == self.scope
        return False

    def log(self, e: dict[str, Any]) -> bool:
        if self.role == "officer":
            return True
        refs = e.get("refs") or {}
        if self.role == "camp":
            return self.scope in refs.get("camp_ids", [])
        if self.role == "driver":
            return self.scope in refs.get("truck_ids", [])
        if self.role == "warehouse":
            for oid in refs.get("order_ids", []):
                o = self.orders.get(oid)
                if o is not None and getattr(o, "warehouse_id", None) == self.scope:
                    return True
            return bool(self.wh_name) and self.wh_name in e.get("summary", "")
        return False

    # ------------------------------------------------------------ composite payloads
    def _state_parts(self, p: dict[str, Any]) -> dict[str, Any]:
        out = dict(p)
        if "trucks" in out:
            out["trucks"] = [t for t in out["trucks"] if self.truck(t)]
        if self.role == "warehouse" and "warehouses" in out:
            out["warehouses"] = [w for w in out["warehouses"] if w.get("id") == self.scope]
        if self.role != "officer":
            out.pop("agents", None)
        return out

    def snapshot(self, snap: dict[str, Any]) -> dict[str, Any]:
        if self.role == "officer":
            return snap
        out = self._state_parts(snap)
        out["orders"] = [o for o in snap.get("orders", []) if self.order(o)]
        out["field_reports"] = [r for r in snap.get("field_reports", []) if self.report(r)]
        out["log"] = [e for e in snap.get("log", []) if self.log(e)]
        out["alerts"] = [a for a in snap.get("alerts", []) if self.role == "camp" and a.get("camp_id") == self.scope]
        out["receipts"] = {k: v for k, v in snap.get("receipts", {}).items() if self.order(self._order_dict(k))}
        for k in ("kpis", "coordinator", "policy"):
            out.pop(k, None)
        return out

    def _order_dict(self, oid: str) -> dict[str, Any]:
        o = self.orders.get(oid)
        return o.model_dump() if o is not None else {}

    def message(self, msg: dict[str, Any]) -> dict[str, Any] | None:
        """The message as this user may see it, or None to drop it."""
        if self.role == "officer":
            return msg
        t, p = msg["type"], msg["payload"]
        if t in EVERYONE:
            return msg
        if t in OFFICER_ONLY:
            return None
        if t == "snapshot":
            return {"type": t, "payload": self.snapshot(p)}
        if t == "tick":
            return {"type": t, "payload": self._state_parts(p)}
        if t == "camp.alert":
            return msg if self.role == "camp" and p.get("camp_id") == self.scope else None
        if t == "log":
            return msg if self.log(p) else None
        if t == "order.updated":
            return msg if self.order(p) else None
        if t.startswith("field_report."):
            return msg if self.report(p) else None
        if t.startswith("truck."):
            tid = p.get("truck_id")
            if self.role == "driver":
                return msg if tid == self.scope else None
            if self.role == "warehouse":
                return msg
            if self.role == "camp":  # trucks currently delivering to this camp
                o = self.orders.get(p.get("order_id") or "")
                if o is not None and o.camp_id == self.scope:
                    return msg
                return (
                    msg
                    if any(
                        o.truck_id == tid and o.camp_id == self.scope and o.status == "dispatched"
                        for o in self.orders.values()
                    )
                    else None
                )
        return None
