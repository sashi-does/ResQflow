"""Formatting helpers for decision-log text (calm operations-officer style)."""

from __future__ import annotations

from app.models import Supplies


def fmt_duration(minutes: float) -> str:
    m = int(round(minutes))
    h, mm = divmod(m, 60)
    if h and mm:
        return f"{h}h{mm:02d}m"
    return f"{h}h" if h else f"{mm}m"


def fmt_kg(kg: float) -> str:
    return f"{kg / 1000:.1f} t" if kg >= 1000 else f"{kg:,.0f} kg"


def fmt_items(items: Supplies) -> str:
    parts = []
    if items.water_l:
        parts.append(f"{items.water_l:,} L water")
    if items.food_rations:
        parts.append(f"{items.food_rations:,} food rations")
    if items.medical_kits:
        parts.append(f"{items.medical_kits:,} medical kits")
    if not parts:
        return "nothing"
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]


def fmt_days(days: float) -> str:
    return f"{days:.1f} days" if days != 1 else "1 day"


def join_roads(roads: list[str], limit: int = 4) -> str:
    return " / ".join(roads[:limit]) + (" / …" if len(roads) > limit else "")


def road_tokens(roads: list[str]) -> list[str]:
    """['NH-27', 'NH-27 / NH-29', 'NH-129 (via Dimapur)'] -> ['NH-27', 'NH-29', 'NH-129']"""
    out: list[str] = []
    for r in roads:
        for part in r.split(" / "):
            name = part.split(" (")[0].strip()
            if name and name not in out:
                out.append(name)
    return out


def describe_route(town_names: list[str], roads: list[str]) -> str:
    """'Dabaka, Bokajan and Numaligarh (NH-27, NH-29, NH-129)'"""
    towns = [t.split(" (")[0] for t in town_names]
    if not towns:
        via = ""
    elif len(towns) == 1:
        via = towns[0]
    else:
        via = ", ".join(towns[:-1]) + " and " + towns[-1]
    toks = road_tokens(roads)
    return f"{via} ({', '.join(toks)})" if via else ", ".join(toks)


def fmt_signed(delta) -> str:  # noqa: ANN001 - Supplies
    names = {"water_l": "L water", "food_rations": "food rations", "medical_kits": "medical kits"}
    parts = [f"{v:+,} {names[k]}" for k, v in delta.as_dict().items() if v]
    return ", ".join(parts) or "no change"
