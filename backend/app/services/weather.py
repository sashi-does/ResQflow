"""Rainfall for district centroids: Open-Meteo (live) or the bundled cache (default, offline)."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.config import DATA_DIR

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
HEAVY_RAIN_MM_24H = 64.5  # IMD "heavy rain"
log = logging.getLogger(__name__)


def _cache() -> dict[str, Any]:
    return json.loads((DATA_DIR / "weather_cache.json").read_text())


def rain_24h(centroids: dict[str, list[float]], mode: str = "cache", timeout_s: float = 5.0) -> dict[str, float]:
    """Next-24h precipitation sum (mm) per district. Live mode falls back to the cache on any error."""
    cache = _cache()["districts"]
    out: dict[str, float] = {}
    for district, (lat, lon) in centroids.items():
        hourly: list[float] | None = None
        if mode == "live":
            try:
                r = httpx.get(
                    OPEN_METEO,
                    params={
                        "latitude": lat,
                        "longitude": lon,
                        "hourly": "precipitation",
                        "forecast_days": 2,
                        "timezone": "Asia/Kolkata",
                    },
                    timeout=timeout_s,
                )
                r.raise_for_status()
                hourly = r.json()["hourly"]["precipitation"]
            except Exception as exc:  # network down, rate limit, schema change
                log.warning("Open-Meteo failed for %s (%s); using cache", district, exc)
        if hourly is None and district in cache:
            hourly = cache[district]["hourly"]["precipitation"]
        if hourly is not None:
            out[district] = round(sum(v or 0.0 for v in hourly[:24]), 1)
    return out
