"""Portfolio auto-tagging, QC similarity, and the designer copilot digest."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends

from app.deps import verify_service_token
from app.prompts import AUTOTAG_SYSTEM, COPILOT_SYSTEM, QC_SYSTEM
from app.schemas import (
    AUTOTAG_SCHEMA,
    AutoTagRequest,
    COPILOT_SCHEMA,
    CopilotRequest,
    QC_SCHEMA,
    QcSimilarityRequest,
)
from app.services.llm import image_block, structured_call, text_block

router = APIRouter(tags=["studio"], dependencies=[Depends(verify_service_token)])


def _image_blocks(urls: list[str], limit: int = 8) -> list[dict[str, Any]]:
    return [image_block(url) for url in urls[:limit]]


@router.post("/v1/portfolio/autotag")
async def autotag(payload: AutoTagRequest) -> dict[str, Any]:
    text = f"""Tag this portfolio piece for designer-to-design matching.
{f'The designer titled it: "{payload.title}"' if payload.title else "The designer gave no title."}

Describe only what is visible in the photographs."""

    result, usage = await structured_call(
        system=AUTOTAG_SYSTEM,
        user_content=[*_image_blocks(payload.imageUrls), text_block(text)],
        schema=AUTOTAG_SCHEMA,
        schema_name="portfolio_tags",
        effort="medium",
    )
    result["usage"] = usage.model_dump()
    return result


@router.post("/v1/qc/similarity")
async def qc_similarity(payload: QcSimilarityRequest) -> dict[str, Any]:
    text = f"""APPROVED DESIGN SPEC:
{json.dumps(payload.spec.model_dump(), indent=2)}

The attached photographs are of the finished garment. Compare them against the approved spec \
and report on each of the five quality criteria. Say explicitly when a criterion cannot be \
judged from a photograph."""

    result, usage = await structured_call(
        system=QC_SYSTEM,
        user_content=[*_image_blocks(payload.photoUrls), text_block(text)],
        schema=QC_SCHEMA,
        schema_name="qc_similarity",
    )
    result["usage"] = usage.model_dump()
    return result


@router.post("/v1/copilot/digest")
async def copilot_digest(payload: CopilotRequest) -> dict[str, Any]:
    orders = "\n".join(
        f"  - {o.code}: {o.status}"
        f"{f', due {o.promisedDate[:10]}' if o.promisedDate else ''}"
        f"{f', next step: {o.nextMilestone}' if o.nextMilestone else ''}"
        for o in payload.orders
    ) or "  (no active orders)"

    text = f"""STUDIO: {payload.designerName}
Capacity: {payload.capacityPercent}% full
Quotes awaiting a decision: {payload.openBids}
Unread customer messages: {payload.unreadMessages}

ACTIVE ORDERS:
{orders}

What should they do today?"""

    result, usage = await structured_call(
        system=COPILOT_SYSTEM,
        user_content=text,
        schema=COPILOT_SCHEMA,
        schema_name="copilot_digest",
        effort="low",
        max_tokens=2000,
    )
    result["usage"] = usage.model_dump()
    return result
