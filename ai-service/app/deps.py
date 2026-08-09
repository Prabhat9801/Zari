"""Shared FastAPI dependencies."""

from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, status

from app.config import get_settings


async def verify_service_token(x_service_token: str | None = Header(default=None)) -> None:
    """Only the Zari backend may call this service.

    There is no user-facing auth here on purpose: the AI service sits behind
    the API and is never exposed to browsers. Compared with compare_digest so a
    wrong token cannot be brute-forced by timing.
    """
    settings = get_settings()
    if not x_service_token or not hmac.compare_digest(x_service_token, settings.service_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": "Invalid service token."},
        )
