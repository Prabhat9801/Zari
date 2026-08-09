"""Design generation, editing, budget optimisation, manufacturability."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import get_settings
from app.deps import verify_service_token
from app.prompts import (
    BUDGET_SYSTEM,
    EDIT_SYSTEM,
    GENERATE_SYSTEM,
    MANUFACTURABILITY_SYSTEM,
    cost_rules_block,
)
from app.schemas import (
    BUDGET_SCHEMA,
    BudgetRequest,
    EDIT_SCHEMA,
    EditRequest,
    GENERATE_SCHEMA,
    GenerateRequest,
    MANUFACTURABILITY_SCHEMA,
    ManufacturabilityRequest,
)
from app.services.imagegen import generate_views
from app.services.llm import image_block, structured_call, text_block

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/design", tags=["design"], dependencies=[Depends(verify_service_token)])


def _rupees(paise: int | None) -> str:
    if paise is None:
        return "no stated budget"
    return f"₹{paise // 100:,}"


def _image_blocks(urls: list[str], limit: int = 6) -> list[dict[str, Any]]:
    """Inspiration images ride along so the model can read silhouette and fabric."""
    return [image_block(url) for url in urls[:limit]]


async def _render_within_budget(prompts: list[str]) -> list[list[dict[str, str]]]:
    """Render one image per prompt, but never let imagery run the clock out.

    The specs and prices are the thing the customer came for. Renders make them
    nicer, so they get a fixed budget: whatever is not finished when it expires
    is dropped, and the concepts go back regardless. Without this, four slow
    images push the whole generation past the backend's patience and the
    customer loses work the model had already finished.
    """
    settings = get_settings()
    if settings.image_provider == "none" or not prompts:
        return [[] for _ in prompts]

    try:
        return await asyncio.wait_for(
            asyncio.gather(*(generate_views(p, ("FRONT",)) for p in prompts)),
            timeout=settings.image_budget_seconds,
        )
    except TimeoutError:
        logger.warning(
            "Image budget of %ss expired; returning concepts without renders",
            settings.image_budget_seconds,
        )
        return [[] for _ in prompts]


@router.post("/generate")
async def generate(payload: GenerateRequest) -> dict[str, Any]:
    settings = get_settings()
    count = min(payload.conceptCount, settings.max_concepts)

    instruction = f"""CUSTOMER BRIEF:
{payload.brief}

TARGET BUDGET: {_rupees(payload.targetBudget)}
{"An inspiration image is attached — read silhouette, fabric behaviour, and surface work from it, and treat the brief as the final word where they disagree." if payload.inspirationUrls else "No inspiration image was provided."}

{cost_rules_block(payload.costRules)}

Produce exactly {count} distinct concepts."""

    content: list[dict[str, Any]] = [*_image_blocks(payload.inspirationUrls), text_block(instruction)]

    result, usage = await structured_call(
        system=GENERATE_SYSTEM,
        user_content=content,
        schema=GENERATE_SCHEMA,
        schema_name="design_concepts",
    )

    concepts = result.get("concepts", [])[:count]

    # Base64 goes to the backend, which uploads it to storage and keeps the URL.
    image_sets = await _render_within_budget([c.get("imagePrompt", "") for c in concepts])
    for concept, images in zip(concepts, image_sets, strict=False):
        concept["images"] = images

    return {"concepts": concepts, "usage": usage.model_dump()}


@router.post("/edit")
async def edit(payload: EditRequest) -> dict[str, Any]:
    current = payload.currentEstimate or {}
    instruction = f"""CURRENT DESIGN SPEC:
{json.dumps(payload.spec.model_dump(), indent=2)}

CURRENT ESTIMATE: {_rupees(current.get("minTotal"))} to {_rupees(current.get("maxTotal"))}

{cost_rules_block(payload.costRules)}

THE CUSTOMER ASKED FOR:
{payload.instruction}

Apply exactly this change and nothing else."""

    result, usage = await structured_call(
        system=EDIT_SYSTEM,
        user_content=instruction,
        schema=EDIT_SCHEMA,
        schema_name="design_edit",
    )

    manufacturability = result.get("manufacturability", {})

    # 422 is the agreed contract for "this cannot be stitched" — the backend
    # turns it into an UNMANUFACTURABLE error with the alternatives attached.
    if not manufacturability.get("isManufacturable", True):
        blockers = manufacturability.get("blockers") or []
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": blockers[0]
                if blockers
                else "That combination can't be reliably stitched by our current designer network.",
                "alternatives": manufacturability.get("alternatives", []),
            },
        )

    result["images"] = (await _render_within_budget([result.get("imagePrompt", "")]))[0]
    result["usage"] = usage.model_dump()
    return result


@router.post("/budget-optimize")
async def budget_optimize(payload: BudgetRequest) -> dict[str, Any]:
    instruction = f"""CURRENT DESIGN SPEC:
{json.dumps(payload.spec.model_dump(), indent=2)}

CURRENT ESTIMATE: {_rupees(payload.currentEstimate.get("minTotal"))} to \
{_rupees(payload.currentEstimate.get("maxTotal"))}
CUSTOMER'S TARGET: {_rupees(payload.targetAmount)}

{cost_rules_block(payload.costRules)}

Find the ways to reach that target. If it cannot be reached, say exactly which component makes \
it impossible and what the realistic floor is."""

    result, usage = await structured_call(
        system=BUDGET_SYSTEM,
        user_content=instruction,
        schema=BUDGET_SCHEMA,
        schema_name="budget_plans",
    )
    result["usage"] = usage.model_dump()
    return result


@router.post("/manufacturability")
async def manufacturability(payload: ManufacturabilityRequest) -> dict[str, Any]:
    instruction = f"""GARMENT SPEC:
{json.dumps(payload.spec.model_dump(), indent=2)}

Assess whether an independent Indian atelier can reliably make this."""

    result, usage = await structured_call(
        system=MANUFACTURABILITY_SYSTEM,
        user_content=instruction,
        schema=MANUFACTURABILITY_SCHEMA,
        schema_name="manufacturability",
        effort="medium",
    )
    return {"manufacturability": result, "usage": usage.model_dump()}
