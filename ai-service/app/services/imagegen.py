"""Garment visualisation.

Pluggable image generation. With IMAGE_PROVIDER=none the service returns specs
and prices only — the product still works end to end and the studio canvas falls
back to its illustrated placeholder, so imagery is an upgrade, never a hard
dependency.
"""

from __future__ import annotations

import asyncio
import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

VIEWS = ("FRONT", "BACK", "DETAIL")

_VIEW_SUFFIX = {
    "FRONT": "Full front view, garment centred, plain warm-neutral studio backdrop.",
    "BACK": "Full back view showing the closure and back construction, same backdrop.",
    "DETAIL": "Close detail of the embroidery and neckline finish, same backdrop.",
}


def _full_prompt(base: str, view: str) -> str:
    return (
        f"{base} {_VIEW_SUFFIX[view]} Editorial fashion photography, natural diffused light, "
        "true-to-life fabric texture, no text, no watermark, no visible face."
    )


async def _replicate(prompt: str) -> str | None:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=settings.image_timeout_seconds) as client:
        response = await client.post(
            f"https://api.replicate.com/v1/models/{settings.replicate_model}/predictions",
            headers={
                "Authorization": f"Bearer {settings.replicate_api_token}",
                "Content-Type": "application/json",
                # Blocks until the prediction finishes instead of returning a
                # polling URL — simpler, and our request budget allows it.
                "Prefer": "wait",
            },
            json={"input": {"prompt": prompt, "aspect_ratio": "3:4", "output_format": "webp"}},
        )
        response.raise_for_status()
        data = response.json()
        output = data.get("output")
        if isinstance(output, list):
            return output[0] if output else None
        return output if isinstance(output, str) else None


async def _fal(prompt: str) -> str | None:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=settings.image_timeout_seconds) as client:
        response = await client.post(
            f"https://fal.run/{settings.fal_model}",
            headers={
                "Authorization": f"Key {settings.fal_api_key}",
                "Content-Type": "application/json",
            },
            json={"prompt": prompt, "image_size": "portrait_4_3", "num_images": 1},
        )
        response.raise_for_status()
        images = response.json().get("images") or []
        return images[0].get("url") if images else None


async def generate_views(base_prompt: str, views: tuple[str, ...] = ("FRONT",)) -> list[dict[str, str]]:
    """Generates one image per view. Failures degrade to no imagery, never an error."""
    settings = get_settings()
    if settings.image_provider == "none":
        return []

    generator = _replicate if settings.image_provider == "replicate" else _fal

    async def one(view: str) -> dict[str, str] | None:
        try:
            url = await generator(_full_prompt(base_prompt, view))
            return {"view": view, "url": url} if url else None
        except Exception as exc:  # noqa: BLE001 — imagery is best-effort
            logger.warning("Image generation failed for %s: %s", view, exc)
            return None

    results = await asyncio.gather(*(one(v) for v in views))
    return [r for r in results if r]
