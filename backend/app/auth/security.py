"""JWT (HS256, 12 h) issue/verify and the FastAPI dependencies `current_user`, `require_role`, `check_scope`."""

from __future__ import annotations

import secrets
import time
from collections.abc import Awaitable, Callable
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.context import current_actor
from app.auth.users import User
from app.config import get_settings

TOKEN_TTL_S = 12 * 3600
_bearer = HTTPBearer(auto_error=False)
_BEARER = Depends(_bearer)


@lru_cache
def _secret() -> str:
    # No JWT_SECRET set: a random per-process secret (tokens stop working on restart; fine for the demo).
    return get_settings().jwt_secret or secrets.token_hex(32)


def issue_token(user: User) -> str:
    now = int(time.time())
    claims = {**user.public(), "sub": user.username, "iat": now, "exp": now + TOKEN_TTL_S}
    claims.pop("username")
    return jwt.encode(claims, _secret(), algorithm="HS256")


def decode_token(token: str) -> User:
    try:
        c = jwt.decode(token, _secret(), algorithms=["HS256"])
        return User(c["sub"], c["name"], c["role"], c["scope_id"], c["title"])
    except (jwt.PyJWTError, KeyError) as exc:
        raise HTTPException(401, "invalid or expired token") from exc


async def current_user(creds: HTTPAuthorizationCredentials | None = _BEARER) -> User:
    """Async on purpose: the actor context var must be set in the request's own context."""
    if creds is None:
        raise HTTPException(401, "not logged in")
    user = decode_token(creds.credentials)
    current_actor.set(f"{user.name} ({user.title})")
    return user


def require_role(*roles: str) -> Callable[..., Awaitable[User]]:
    async def dep(user: User = _CURRENT) -> User:
        if user.role not in roles:
            raise HTTPException(403, f"this needs the {' or '.join(roles)} role")
        return user

    return dep


_CURRENT = Depends(current_user)


def check_scope(user: User, role: str, scope_id: str) -> None:
    """Officers act on everything; everyone else only on their own camp / truck / warehouse."""
    if user.role == "officer":
        return
    if user.role != role or user.scope_id != scope_id:
        raise HTTPException(403, f"{user.name} can't act on {scope_id}")
