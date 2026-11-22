"""Rainfall for district centroids: Open-Meteo (live) or the bundled cache (default, offline)."""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.config import DATA_DIR

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
HEAVY_RAIN_MM_24H = 64.5  # IMD "heavy rain"
log = logging.getLogger(__name__)


def _cache() -> dict[str, Any]:
    return json.loads((DATA_DIR / "weather_cache.json").read_text())


def _fetch_live(centroids: dict[str, list[float]], timeout_s: float) -> dict[str, list[float]]:
    """One batched Open-Meteo request for every district (comma-separated coordinates)."""
    names = list(centroids)
    r = httpx.get(
        OPEN_METEO,
        params={
            "latitude": ",".join(str(centroids[n][0]) for n in names),
            "longitude": ",".join(str(centroids[n][1]) for n in names),
            "hourly": "precipitation",
            "forecast_days": 2,
            "timezone": "Asia/Kolkata",
        },
        timeout=timeout_s,
    )
    r.raise_for_status()
    body = r.json()
    rows = body if isinstance(body, list) else [body]
    return {n: row["hourly"]["precipitation"] for n, row in zip(names, rows, strict=True)}


_live_cache: tuple[float, dict[str, list[float]]] | None = None  # (fetched at, series): reused for 10 real minutes
LIVE_TTL_S = 600


def rain_24h(
    centroids: dict[str, list[float]], mode: str = "cache", timeout_s: float = 3.0, offset_h: float = 0.0
) -> dict[str, float]:
    """Precipitation (mm) per district over the 24 hours starting `offset_h` hours into the hourly forecast.

    Offline (cache) the forecast window moves with simulated time, so a check at 15:00 sees the outlook from 15:00.
    Live mode uses the current hour of today's Open-Meteo forecast and falls back to the cache on any error."""
    global _live_cache
    hourly: dict[str, list[float]] = {}
    if mode == "live":
        now = time.monotonic()
        if _live_cache and now - _live_cache[0] < LIVE_TTL_S:
            hourly = _live_cache[1]
        else:
            try:
                hourly = _fetch_live(centroids, timeout_s)
                _live_cache = (now, hourly)
            except Exception as exc:  # network down, rate limit, schema change
                log.warning("Open-Meteo failed (%s); using the cached forecast", exc)
        if hourly:
            offset_h = datetime.now(ZoneInfo("Asia/Kolkata")).hour
    cache = _cache()["districts"]
    out: dict[str, float] = {}
    for district in centroids:
        series = hourly.get(district) or (cache[district]["hourly"]["precipitation"] if district in cache else None)
        if series is not None:
            start = max(0, min(int(offset_h), len(series) - 24))
            out[district] = round(sum(v or 0.0 for v in series[start : start + 24]), 1)
    return out
