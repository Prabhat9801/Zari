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

    result, usage = structured_call(
        system=GENERATE_SYSTEM,
        user_content=content,
        schema=GENERATE_SCHEMA,
        schema_name="design_concepts",
    )

    concepts = result.get("concepts", [])[:count]

    # Imagery is generated in parallel and is best-effort — a failure here must
    # not cost the customer their concepts. Base64 goes to the backend, which
    # uploads it to storage and keeps the URL.
    image_sets = await asyncio.gather(
        *(generate_views(c.get("imagePrompt", ""), ("FRONT",)) for c in concepts)
    )
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

    result, usage = structured_call(
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

    result["images"] = await generate_views(result.get("imagePrompt", ""), ("FRONT",))
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

    result, usage = structured_call(
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

    result, usage = structured_call(
        system=MANUFACTURABILITY_SYSTEM,
        user_content=instruction,
        schema=MANUFACTURABILITY_SCHEMA,
        schema_name="manufacturability",
        effort="medium",
    )
    return {"manufacturability": result, "usage": usage.model_dump()}
