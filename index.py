"""Vercel entry point when deploying from the repo root (GitHub integration).

The app lives in backend/ and imports itself as the `app` package, so put backend/ on the path first.
Local development still runs from backend/ (`make dev`).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))

from app.main import app  # noqa: E402

__all__ = ["app"]
