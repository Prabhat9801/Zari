"""OpenAI client wrapper.

One place that knows how to call the model, force a JSON shape, handle refusals,
and report usage. Every router goes through `structured_call`.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import openai
from fastapi import HTTPException, status

from app.config import get_settings
from app.schemas import Usage

logger = logging.getLogger(__name__)

_client: openai.OpenAI | None = None


def get_client() -> openai.OpenAI:
    global _client
    if _client is None:
        settings = get_settings()
        kwargs: dict[str, Any] = {
            "api_key": settings.openai_api_key,
            "timeout": settings.request_timeout_seconds,
            "max_retries": 2,
        }
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url
        _client = openai.OpenAI(**kwargs)
    return _client


def _usage_from(response: Any, model: str, started: float) -> Usage:
    settings = get_settings()
    usage = getattr(response, "usage", None)
    input_tokens = getattr(usage, "prompt_tokens", None)
    output_tokens = getattr(usage, "completion_tokens", None)

    cost = None
    if input_tokens is not None and output_tokens is not None:
        cost = round(
            input_tokens * settings.input_paise_per_mtok / 1_000_000
            + output_tokens * settings.output_paise_per_mtok / 1_000_000
        )

    return Usage(
        model=model,
        inputTokens=input_tokens,
        outputTokens=output_tokens,
        costPaise=cost,
        latencyMs=round((time.monotonic() - started) * 1000),
    )


def text_block(text: str) -> dict[str, Any]:
    return {"type": "text", "text": text}


def image_block(url: str) -> dict[str, Any]:
    """OpenAI chat vision input. Takes a public URL or a data: URI."""
    return {"type": "image_url", "image_url": {"url": url}}


def structured_call(
    *,
    system: str,
    user_content: Any,
    schema: dict[str, Any],
    schema_name: str,
    effort: str | None = None,
    max_tokens: int | None = None,
) -> tuple[dict[str, Any], Usage]:
    """Calls the model and returns a dict guaranteed to match `schema`.

    Uses OpenAI Structured Outputs (`response_format.json_schema` with
    `strict: true`), so the response is valid JSON of the right shape — no
    regex extraction, no retry-on-parse loop. The schemas in schemas.py are
    written to satisfy strict mode: every object sets additionalProperties
    false and lists every property in `required`.
    """
    settings = get_settings()
    client = get_client()
    started = time.monotonic()

    content = user_content if isinstance(user_content, list) else [text_block(user_content)]

    request: dict[str, Any] = {
        "model": settings.model_id,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": content},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": schema_name, "schema": schema, "strict": True},
        },
        "max_completion_tokens": max_tokens or settings.max_output_tokens,
        "reasoning_effort": effort or settings.reasoning_effort,
    }

    try:
        response = client.chat.completions.create(**request)
    except openai.RateLimitError as exc:
        logger.warning("OpenAI rate limit: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"message": "Zari is busy right now. Try again in a few seconds."},
        ) from exc
    except openai.APIConnectionError as exc:
        logger.error("OpenAI connection error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"message": "Zari couldn't reach its design engine. Nothing is lost — try again."},
        ) from exc
    except openai.APIStatusError as exc:
        logger.error("OpenAI API error %s: %s", exc.status_code, exc.message)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"message": "Zari couldn't finish that design. Nothing is lost — try again."},
        ) from exc

    choice = response.choices[0]
    message = choice.message

    # A safety refusal comes back on its own field, not as content.
    refusal = getattr(message, "refusal", None)
    if refusal:
        logger.warning("Model refused the request: %s", refusal)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "Zari can't work on that request.",
                "alternatives": [
                    "Try describing the garment itself — fabric, occasion, and silhouette."
                ],
            },
        )

    if choice.finish_reason == "length":
        logger.warning("Response hit the token ceiling; output may be truncated")

    text = (message.content or "").strip()
    if not text:
        logger.error("Model returned empty content (finish_reason=%s)", choice.finish_reason)
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
