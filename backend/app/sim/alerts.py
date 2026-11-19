"""Camp alerts (doc 11 §3.2): dispatch / delay / arrival messages in English and Assamese.

Templated in code (numbers from the world, never from an LLM). The Assamese wording should be reviewed by a native
speaker before real use.
"""

from __future__ import annotations

from typing import Any

from app.models import Supplies


def _items_en(s: Supplies) -> str:
    parts = []
    if s.water_l:
        parts.append(f"{s.water_l:,} L water")
    if s.food_rations:
        parts.append(f"{s.food_rations:,} food rations")
    if s.medical_kits:
        parts.append(f"{s.medical_kits:,} medical kits")
    return ", ".join(parts) or "supplies"


def _items_as(s: Supplies) -> str:
    parts = []
    if s.water_l:
        parts.append(f"{s.water_l:,} লিটাৰ পানী")
    if s.food_rations:
        parts.append(f"{s.food_rations:,} ভাগ খাদ্য")
    if s.medical_kits:
        parts.append(f"{s.medical_kits:,} টা চিকিৎসা কিট")
    return ", ".join(parts) or "সাহায্য সামগ্ৰী"


def dispatch(truck: str, items: Supplies, eta: str | None) -> tuple[str, str]:
    en = f"Truck {truck} is on its way with {_items_en(items)}." + (f" Expected at {eta}." if eta else "")
    as_ = f"ট্ৰাক {truck} {_items_as(items)} লৈ আপোনাৰ শিবিৰলৈ আহি আছে।" + (f" আনুমানিক উপস্থিতি: {eta}।" if eta else "")
    return en, as_


def delay(truck: str, reason: str, eta: str | None) -> tuple[str, str]:
    en = f"Delayed: Truck {truck} was re-routed ({reason})." + (f" New ETA {eta}." if eta else "")
    as_ = f"পলম: ৰাস্তা বন্ধ হোৱাৰ বাবে ট্ৰাক {truck}ৰ পথ সলনি কৰা হৈছে।" + (f" নতুন আনুমানিক উপস্থিতি: {eta}।" if eta else "")
    return en, as_


def arrival(truck: str, items: Supplies) -> tuple[str, str]:
    en = f"Truck {truck} arrived with {_items_en(items)}. Please confirm what you received."
    as_ = f"ট্ৰাক {truck} {_items_as(items)} লৈ আহি পালে। অনুগ্ৰহ কৰি কিমান পালে নিশ্চিত কৰক।"
    return en, as_


def make(
    n: int, camp_id: str, sim_time: str, kind: str, order_id: str, truck_id: str, text: tuple[str, str]
) -> dict[str, Any]:
    return {
        "id": f"A-{n}",
        "camp_id": camp_id,
        "sim_time": sim_time,
        "kind": kind,
        "order_id": order_id,
        "truck_id": truck_id,
        "en": text[0],
        "as": text[1],
    }
