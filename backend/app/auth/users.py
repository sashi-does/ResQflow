"""SQLite `users` table with bcrypt hashes, seeded with the fictional demo accounts (docs/11 §1)."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import bcrypt

from app.config import BACKEND_DIR

DB_PATH = BACKEND_DIR / "resqflow.db"
DEMO_PASSWORD = "demo1234"

# Names are fictional (doc 11). `title` is how the person is attributed in the decision log.
DEMO_USERS: list[dict[str, str]] = [
    {
        "username": "officer",
        "name": "Ritu Baruah",
        "role": "officer",
        "scope_id": "all",
        "title": "District Officer, Nagaon",
        "scope_label": "All districts",
        "blurb": "Runs the district response: approves big orders, confirms reports, proves the plan works.",
    },
    {
        "username": "camp.morigaon",
        "name": "Anil Das",
        "role": "camp",
        "scope_id": "C2",
        "title": "Camp Coordinator, Morigaon",
        "scope_label": "Morigaon Relief Camp",
        "blurb": "Reports what the camp needs and confirms what arrives.",
    },
    {
        "username": "camp.majuli",
        "name": "Mousumi Gogoi",
        "role": "camp",
        "scope_id": "C7",
        "title": "Camp Coordinator, Majuli",
        "scope_label": "Majuli Relief Camp",
        "blurb": "Reports what the camp needs (in Assamese or English) and confirms what arrives.",
    },
    {
        "username": "driver.t3",
        "name": "Bikash Kalita",
        "role": "driver",
        "scope_id": "T3",
        "title": "Truck Driver, T3",
        "scope_label": "Truck T3",
        "blurb": "Drives relief trucks; gets route changes and reports road problems.",
    },
    {
        "username": "wh.nagaon",
        "name": "Pranjal Saikia",
        "role": "warehouse",
        "scope_id": "W2",
        "title": "Warehouse Manager, Nagaon",
        "scope_label": "Nagaon warehouse",
        "blurb": "Keeps stock above the safety reserve and gets trucks loaded fast.",
    },
]


@dataclass(frozen=True)
class User:
    username: str
    name: str
    role: str
    scope_id: str
    title: str

    def public(self) -> dict[str, str]:
        return {
            "username": self.username,
            "name": self.name,
            "role": self.role,
            "scope_id": self.scope_id,
            "title": self.title,
        }


def _connect(path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(path)
    con.execute(
        "CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, "
        "scope_id TEXT NOT NULL, title TEXT NOT NULL, password_hash BLOB NOT NULL)"
    )
    return con


def seed(path: Path = DB_PATH) -> None:
    """Insert any missing demo user (idempotent; existing hashes are kept so restarts are fast)."""
    with _connect(path) as con:
        have = {r[0] for r in con.execute("SELECT username FROM users")}
        for u in DEMO_USERS:
            if u["username"] in have:
                con.execute(
                    "UPDATE users SET name=?, role=?, scope_id=?, title=? WHERE username=?",
                    (u["name"], u["role"], u["scope_id"], u["title"], u["username"]),
                )
                continue
            pw = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt(rounds=10))
            con.execute(
                "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)",
                (u["username"], u["name"], u["role"], u["scope_id"], u["title"], pw),
            )


@lru_cache
def _seeded() -> bool:
    seed()
    return True


def authenticate(username: str, password: str) -> User | None:
    _seeded()
    with _connect(DB_PATH) as con:
        row = con.execute(
            "SELECT username, name, role, scope_id, title, password_hash FROM users WHERE username = ?",
            (username.strip().lower(),),
        ).fetchone()
    if row is None or not bcrypt.checkpw(password.encode(), bytes(row[5])):
        return None
    return User(*row[:5])


def demo_cards() -> list[dict[str, str]]:
    return [{k: u[k] for k in ("username", "name", "role", "title", "scope_label", "blurb")} for u in DEMO_USERS]
