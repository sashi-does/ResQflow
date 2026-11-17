"""Sim clock: fixed 30 sim-second steps; the speed multiplier only changes how many steps run per tick."""

from __future__ import annotations

from dataclasses import dataclass

STEP_S = 30
TICK_REAL_S = 0.25
ALLOWED_SPEEDS = (30, 120, 600)


@dataclass
class SimClock:
    speed: int = 120
    running: bool = False
    _acc: float = 0.0

    def steps_for_tick(self, real_dt: float = TICK_REAL_S) -> int:
        """How many fixed steps to run for one real tick. Fractional remainders carry over."""
        if not self.running:
            return 0
        self._acc += self.speed * real_dt
        n = int(self._acc // STEP_S)
        self._acc -= n * STEP_S
        return n

    def reset(self) -> None:
        self._acc = 0.0
