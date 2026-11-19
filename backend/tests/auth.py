"""Test helpers: JWTs for any role/scope without going through bcrypt."""

from app.auth.security import issue_token
from app.auth.users import DEMO_USERS, User


def user(username: str = "officer") -> User:
    u = next(x for x in DEMO_USERS if x["username"] == username)
    return User(u["username"], u["name"], u["role"], u["scope_id"], u["title"])


def as_(role: str, scope: str, name: str = "Test User") -> dict[str, str]:
    """Headers for an arbitrary role + scope (e.g. a coordinator for camp C3, which has no demo account)."""
    return {"Authorization": f"Bearer {issue_token(User(f'{role}.{scope}', name, role, scope, f'{role} {scope}'))}"}


def H(username: str = "officer") -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_token(user(username))}"}


def ws_url(username: str = "officer") -> str:
    return f"/ws?token={issue_token(user(username))}"
