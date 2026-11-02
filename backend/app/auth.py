"""Authentication & session management for Public Read-Only / Admin Edit mode."""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel

from .config import APP_ACCESS_TOKEN

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Secret used to sign session cookies
COOKIE_SECRET = os.getenv("COOKIE_SECRET", APP_ACCESS_TOKEN or "atelier-default-secret-key")
COOKIE_NAME = "atelier_admin_session"


def create_session_token() -> str:
    """Generate a tamper-proof timestamped session token."""
    ts = str(int(time.time()))
    sig = hmac.new(COOKIE_SECRET.encode(), ts.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{ts}.{sig}"


def verify_session_token(token: str | None, max_age_days: int = 30) -> bool:
    """Verify that a session token was signed with our secret and is not expired."""
    if not token or "." not in token:
        return False
    parts = token.split(".", 1)
    if len(parts) != 2:
        return False
    ts_str, sig = parts
    try:
        ts = int(ts_str)
    except ValueError:
        return False

    # Check expiration (default 30 days)
    if time.time() - ts > max_age_days * 86400:
        return False

    expected_sig = hmac.new(COOKIE_SECRET.encode(), ts_str.encode(), hashlib.sha256).hexdigest()[:32]
    return hmac.compare_digest(sig, expected_sig)


def is_authenticated_admin(request: Request) -> bool:
    """Check if the current request has valid admin credentials."""
    # If no passcode is set in configuration, default to full admin access (local unconfigured mode)
    if not APP_ACCESS_TOKEN:
        return True

    # 1. Check Cookie
    cookie_token = request.cookies.get(COOKIE_NAME)
    if verify_session_token(cookie_token):
        return True

    # 2. Check Authorization Header (Bearer or Basic)
    auth_header = request.headers.get("Authorization")
    if auth_header:
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            if token == APP_ACCESS_TOKEN or verify_session_token(token):
                return True
        elif auth_header.startswith("Basic "):
            import base64
            try:
                decoded = base64.b64decode(auth_header[6:].strip()).decode("utf-8")
                parts = decoded.split(":", 1)
                token = parts[1] if len(parts) > 1 and parts[1] else parts[0]
                if token == APP_ACCESS_TOKEN:
                    return True
            except Exception:
                pass

    # 3. Check X-Admin-Token or X-App-Token header
    token = request.headers.get("X-Admin-Token") or request.headers.get("X-App-Token")
    if token and (token == APP_ACCESS_TOKEN or verify_session_token(token)):
        return True

    # 4. Check query parameter (?token=...)
    param_token = request.query_params.get("token")
    if param_token and (param_token == APP_ACCESS_TOKEN or verify_session_token(param_token)):
        return True

    return False


def require_admin(request: Request) -> None:
    """FastAPI dependency to protect mutation endpoints (POST/PUT/PATCH/DELETE)."""
    if not is_authenticated_admin(request):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin passcode required for editing or mutating data.",
        )


class LoginRequest(BaseModel):
    passcode: str


class AuthStatusResponse(BaseModel):
    is_admin: bool
    auth_enabled: bool


@router.get("/status", response_model=AuthStatusResponse)
def get_auth_status(request: Request) -> AuthStatusResponse:
    """Return whether the current viewer has admin privileges and if auth is configured."""
    auth_enabled = bool(APP_ACCESS_TOKEN)
    is_admin = is_authenticated_admin(request)
    return AuthStatusResponse(is_admin=is_admin, auth_enabled=auth_enabled)


@router.post("/login", response_model=AuthStatusResponse)
def login(payload: LoginRequest, response: Response) -> AuthStatusResponse:
    """Validate admin passcode and set secure session cookie."""
    if not APP_ACCESS_TOKEN:
        # Auth not enabled, always admin
        return AuthStatusResponse(is_admin=True, auth_enabled=False)

    if payload.passcode.strip() != APP_ACCESS_TOKEN:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin passcode.")

    token = create_session_token()
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,  # 30 days
        secure=False,  # works over both http localhost and https onrender
    )
    return AuthStatusResponse(is_admin=True, auth_enabled=True)


@router.post("/logout", response_model=AuthStatusResponse)
def logout(response: Response) -> AuthStatusResponse:
    """Clear admin session cookie."""
    response.delete_cookie(key=COOKIE_NAME)
    auth_enabled = bool(APP_ACCESS_TOKEN)
    return AuthStatusResponse(is_admin=not auth_enabled, auth_enabled=auth_enabled)
