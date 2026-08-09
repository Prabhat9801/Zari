"""Anthropic client wrapper.

One place that knows how to call Claude, force a JSON shape, handle refusals,
and report usage. Every router goes through `structured_call`.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import anthropic
from fastapi import HTTPException, status

from app.config import get_settings
from app.schemas import Usage

logger = logging.getLogger(__name__)

_client: anthropic.Anthropic | None = None


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        settings = get_settings()
        _client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            timeout=settings.request_timeout_seconds,
            max_retries=2,
        )
    return _client


# Claude Opus 5 list pricing, in paise per token, so cost can be recorded on the
# AiJob row alongside latency. $5 / $25 per million tokens at ~₹88/USD.
_INPUT_PAISE_PER_TOKEN = 5 * 88 * 100 / 1_000_000
_OUTPUT_PAISE_PER_TOKEN = 25 * 88 * 100 / 1_000_000


def _usage_from(response: Any, model: str, started: float) -> Usage:
    usage = getattr(response, "usage", None)
    input_tokens = getattr(usage, "input_tokens", None)
    output_tokens = getattr(usage, "output_tokens", None)

    cost = None
    if input_tokens is not None and output_tokens is not None:
        cost = round(input_tokens * _INPUT_PAISE_PER_TOKEN + output_tokens * _OUTPUT_PAISE_PER_TOKEN)

    return Usage(
        model=model,
        inputTokens=input_tokens,
        outputTokens=output_tokens,
        costPaise=cost,
        latencyMs=round((time.monotonic() - started) * 1000),
    )


def _extract_text(response: Any) -> str:
    parts = [block.text for block in response.content if getattr(block, "type", None) == "text"]
    return "".join(parts).strip()


def structured_call(
    *,
    system: str,
    user_content: Any,
    schema: dict[str, Any],
    schema_name: str,
    effort: str | None = None,
    max_tokens: int | None = None,
) -> tuple[dict[str, Any], Usage]:
    """Calls Claude and returns a dict guaranteed to match `schema`.

    Uses structured outputs (`output_config.format`) so the response is valid
    JSON of the right shape — no regex extraction, no retry-on-parse loop.
    Adaptive thinking is on: garment construction, costing, and substitution
    trade-offs all need real reasoning, and the model decides how much per call.
    """
    settings = get_settings()
    client = get_client()
    started = time.monotonic()

    messages = [
        {
            "role": "user",
            "content": user_content if isinstance(user_content, list) else [{"type": "text", "text": user_content}],
        }
    ]

    try:
        response = client.messages.create(
            model=settings.model_id,
            max_tokens=max_tokens or settings.max_tokens,
            system=system,
            messages=messages,  # type: ignore[arg-type]
            thinking={"type": "adaptive"},
            output_config={
                "effort": effort or settings.effort,
                "format": {
                    "type": "json_schema",
                    "name": schema_name,
                    "schema": schema,
                },
            },
        )
    except anthropic.RateLimitError as exc:
        logger.warning("Anthropic rate limit: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"message": "Zari is busy right now. Try again in a few seconds."},
        ) from exc
    except anthropic.APIConnectionError as exc:
        logger.error("Anthropic connection error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"message": "Zari couldn't reach its design engine. Nothing is lost — try again."},
        ) from exc
    except anthropic.APIStatusError as exc:
        logger.error("Anthropic API error %s: %s", exc.status_code, exc.message)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"message": "Zari couldn't finish that design. Nothing is lost — try again."},
        ) from exc

    # A safety classifier can decline the request; check before reading content.
    if response.stop_reason == "refusal":
        logger.warning("Model refused the request: %s", getattr(response, "stop_details", None))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "Zari can't work on that request.",
                "alternatives": ["Try describing the garment itself — fabric, occasion, and silhouette."],
            },
        )

    if response.stop_reason == "max_tokens":
        logger.warning("Response hit max_tokens; output may be truncated")

    text = _extract_text(response)
    if not text:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"message": "Zari couldn't finish that design. Nothing is lost — try again."},
        )

    try:
        parsed: dict[str, Any] = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.error("Structured output was not valid JSON: %s", text[:500])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"message": "Zari couldn't finish that design. Nothing is lost — try again."},
        ) from exc

    return parsed, _usage_from(response, settings.model_id, started)
