"""Runtime configuration loaded from environment variables (and an optional .env file)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
STATIC_DIR = Path(__file__).resolve().parent / "static"


class Settings(BaseSettings):
    """All tunables from `.env.example`."""

    model_config = SettingsConfigDict(env_file=(BACKEND_DIR.parent / ".env", BACKEND_DIR / ".env"), extra="ignore")

    llm_provider: Literal["mock", "anthropic", "openai", "gemini"] = "mock"
    llm_model: str = "claude-haiku-5-5"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    gemini_api_key: str = ""
    llm_timeout_s: float = 20.0
    llm_effort: Literal["low", "medium", "high"] = "low"  # low latency at high sim speed
    ors_api_key: str = ""
    weather_mode: Literal["live", "cache"] = "cache"
    sim_speed: int = 120
    approval_threshold_kg: int = 6000
    seed: int = 42
    demo_inject_fault: bool = False
    jwt_secret: str = ""

    @property
    def effective_llm_provider(self) -> str:
        """The provider actually used: falls back to mock when the chosen provider has no key."""
        keys = {
            "anthropic": self.anthropic_api_key,
            "openai": self.openai_api_key,
            "gemini": self.gemini_api_key,
        }
        # only anthropic is implemented; openai/gemini fall back to mock
        if self.llm_provider != "anthropic" or not keys.get(self.llm_provider):
            return "mock"
        return self.llm_provider


@lru_cache
def get_settings() -> Settings:
    return Settings()
