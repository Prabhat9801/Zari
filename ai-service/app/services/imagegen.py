"""Garment visualisation with GPT Image.

Images come back as base64 from the OpenAI Images API — there is no hosted URL.
This service is stateless and holds no storage credentials, so it returns the
base64 payload and the BACKEND uploads it to Supabase Storage and keeps the
public URL. Storage ownership stays in one place.

With IMAGE_PROVIDER=none the service returns specs and prices only. The whole
product works without imagery; the studio canvas falls back to its illustrated
placeholder, so this is an upgrade, never a hard dependency.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import openai

from app.config import get_settings

logger = logging.getLogger(__name__)

VIEWS = ("FRONT", "BACK", "DETAIL")

_VIEW_SUFFIX = {
    "FRONT": "Full front view, garment centred, plain warm-neutral studio backdrop.",
    "BACK": "Full back view showing the closure and back construction, same backdrop.",
    "DETAIL": "Close detail of the embroidery and neckline finish, same backdrop.",
}

_client: openai.AsyncOpenAI | None = None


def _get_client() -> openai.AsyncOpenAI:
    global _client
    if _client is None:
        settings = get_settings()
        kwargs: dict[str, Any] = {
            "api_key": settings.openai_api_key,
            "timeout": settings.image_timeout_seconds,
            "max_retries": 1,
        }
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url
        _client = openai.AsyncOpenAI(**kwargs)
    return _client


def _full_prompt(base: str, view: str) -> str:
    return (
        f"{base} {_VIEW_SUFFIX[view]} Editorial fashion photography, natural diffused light, "
        "true-to-life fabric texture, no text, no watermark, no visible face."
    )


async def generate_views(
    base_prompt: str,
    views: tuple[str, ...] = ("FRONT",),
) -> list[dict[str, str]]:
    """Generates one image per view.

    Returns [{ "view": "FRONT", "b64": "...", "contentType": "image/png" }].
    Failures degrade to no imagery rather than failing the whole generation.
    """
    settings = get_settings()
    if settings.image_provider == "none" or not base_prompt:
        return []

    client = _get_client()

    async def one(view: str) -> dict[str, str] | None:
        try:
            result = await client.images.generate(
                model=settings.image_model,
                prompt=_full_prompt(base_prompt, view),
                size=settings.image_size,
                quality=settings.image_quality,
                n=1,
            )
            data = result.data or []
            if not data:
                return None
            b64 = getattr(data[0], "b64_json", None)
            if not b64:
                return None
            return {"view": view, "b64": b64, "contentType": "image/png"}
        except Exception as exc:  # noqa: BLE001 — imagery is best-effort
            logger.warning("Image generation failed for %s: %s", view, exc)
            return None

    results = await asyncio.gather(*(one(v) for v in views))
    return [r for r in results if r]
