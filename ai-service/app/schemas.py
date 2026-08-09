"""Request/response models and the JSON Schemas used for structured outputs.

The JSON Schemas below are hand-written rather than derived from the Pydantic
models because OpenAI Structured Outputs in strict mode supports a restricted
subset of JSON Schema: no numeric bounds (minimum/maximum), no string length
constraints, no recursion, every object must set additionalProperties:false,
and EVERY property must appear in `required` (optionality is expressed by
allowing null in the type). Generating these from Pydantic would emit keywords
the API rejects.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Component = Literal["FABRIC", "LINING", "EMBROIDERY", "STITCHING", "TRIMS", "FINISHING", "OTHER"]
Confidence = Literal["LOW", "MEDIUM", "HIGH"]


# ---------------------------------------------------------------------------
# Wire models (what the Node backend sends and receives)
# ---------------------------------------------------------------------------


class CostRule(BaseModel):
    component: Component
    key: str
    label: str
    minRate: int
    maxRate: int
    unit: str
    region: str | None = None
    multiplier: float = 1.0


class DesignSpec(BaseModel):
    category: str
    silhouette: str
    fabric: str
    lining: str | None = None
    neckline: str | None = None
    sleeves: str | None = None
    embroidery: str | None = None
    motifs: list[str] = Field(default_factory=list)
    motifDensity: str | None = None
    palette: list[str] = Field(default_factory=list)
    occasion: str | None = None
    closures: str | None = None
    hemline: str | None = None
    notes: str | None = None


class GenerateRequest(BaseModel):
    brief: str
    inspirationUrls: list[str] = Field(default_factory=list)
    targetBudget: int | None = None  # paise
    conceptCount: int = 4
    costRules: list[CostRule] = Field(default_factory=list)


class EditRequest(BaseModel):
    spec: DesignSpec
    instruction: str
    currentEstimate: dict[str, int] | None = None
    costRules: list[CostRule] = Field(default_factory=list)


class BudgetRequest(BaseModel):
    spec: DesignSpec
    currentEstimate: dict[str, int]
    targetAmount: int  # paise
    costRules: list[CostRule] = Field(default_factory=list)


class ManufacturabilityRequest(BaseModel):
    spec: DesignSpec


class AutoTagRequest(BaseModel):
    imageUrls: list[str]
    title: str | None = None


class QcSimilarityRequest(BaseModel):
    spec: DesignSpec
    photoUrls: list[str]


class CopilotOrder(BaseModel):
    code: str
    status: str
    promisedDate: str | None = None
    nextMilestone: str | None = None


class CopilotRequest(BaseModel):
    designerName: str
    capacityPercent: int
    openBids: int
    unreadMessages: int
    orders: list[CopilotOrder] = Field(default_factory=list)


class Usage(BaseModel):
    model: str | None = None
    inputTokens: int | None = None
    outputTokens: int | None = None
    costPaise: int | None = None
    latencyMs: int | None = None


# ---------------------------------------------------------------------------
# JSON Schemas for structured outputs
# ---------------------------------------------------------------------------


def _obj(properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }


_STR = {"type": "string"}
_INT = {"type": "integer"}
_STR_LIST = {"type": "array", "items": {"type": "string"}}
_NULLABLE_STR = {"type": ["string", "null"]}

SPEC_SCHEMA = _obj(
    {
        "category": _STR,
        "silhouette": _STR,
        "fabric": _STR,
        "lining": _NULLABLE_STR,
        "neckline": _NULLABLE_STR,
        "sleeves": _NULLABLE_STR,
        "embroidery": _NULLABLE_STR,
        "motifs": _STR_LIST,
        # Allowed values are stated in the prompt rather than as an enum: strict
        # mode rejects an enum list that has to carry null alongside strings.
        "motifDensity": _NULLABLE_STR,
        "palette": _STR_LIST,
        "occasion": _NULLABLE_STR,
        "closures": _NULLABLE_STR,
        "hemline": _NULLABLE_STR,
        "notes": _NULLABLE_STR,
    },
    [
        "category",
        "silhouette",
        "fabric",
        "lining",
        "neckline",
        "sleeves",
        "embroidery",
        "motifs",
        "motifDensity",
        "palette",
        "occasion",
        "closures",
        "hemline",
        "notes",
    ],
)

CONFIDENCE_SCHEMA = _obj(
    {
        key: {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH"]}
        for key in ["category", "silhouette", "fabric", "neckline", "sleeves", "embroidery", "palette", "occasion"]
    },
    ["category", "silhouette", "fabric", "neckline", "sleeves", "embroidery", "palette", "occasion"],
)

MANUFACTURABILITY_SCHEMA = _obj(
    {
        "score": _INT,
        "complexity": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH"]},
        "leadTimeDays": _INT,
        "isManufacturable": {"type": "boolean"},
        "blockers": _STR_LIST,
        "warnings": _STR_LIST,
        "alternatives": _STR_LIST,
    },
    ["score", "complexity", "leadTimeDays", "isManufacturable", "blockers", "warnings", "alternatives"],
)

LINE_ITEM_SCHEMA = _obj(
    {
        "component": {
            "type": "string",
            "enum": ["FABRIC", "LINING", "EMBROIDERY", "STITCHING", "TRIMS", "FINISHING", "OTHER"],
        },
        "label": _STR,
        "minAmount": _INT,
        "maxAmount": _INT,
        "quantity": {"type": ["number", "null"]},
        "unit": _NULLABLE_STR,
        "notes": _NULLABLE_STR,
    },
    ["component", "label", "minAmount", "maxAmount", "quantity", "unit", "notes"],
)

COST_SCHEMA = _obj(
    {
        "minTotal": _INT,
        "maxTotal": _INT,
        "confidence": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH"]},
        "lineItems": {"type": "array", "items": LINE_ITEM_SCHEMA},
    },
    ["minTotal", "maxTotal", "confidence", "lineItems"],
)

CONCEPT_SCHEMA = _obj(
    {
        "name": _STR,
        "spec": SPEC_SCHEMA,
        "attributeConfidence": CONFIDENCE_SCHEMA,
        "summary": _STR,
        "manufacturability": MANUFACTURABILITY_SCHEMA,
        "costEstimate": COST_SCHEMA,
        "imagePrompt": _STR,
    },
    ["name", "spec", "attributeConfidence", "summary", "manufacturability", "costEstimate", "imagePrompt"],
)

GENERATE_SCHEMA = _obj({"concepts": {"type": "array", "items": CONCEPT_SCHEMA}}, ["concepts"])

EDIT_SCHEMA = _obj(
    {
        "spec": SPEC_SCHEMA,
        "attributeConfidence": CONFIDENCE_SCHEMA,
        "summary": _STR,
        "manufacturability": MANUFACTURABILITY_SCHEMA,
        "costEstimate": COST_SCHEMA,
        "imagePrompt": _STR,
    },
    ["spec", "attributeConfidence", "summary", "manufacturability", "costEstimate", "imagePrompt"],
)

SUBSTITUTION_SCHEMA = _obj(
    {
        "component": {
            "type": "string",
            "enum": ["FABRIC", "LINING", "EMBROIDERY", "STITCHING", "TRIMS", "FINISHING", "OTHER"],
        },
        "fromValue": _STR,
        "toValue": _STR,
        "costDelta": _INT,
        "visualImpact": _STR,
        "similarityDelta": _INT,
        "isOptional": {"type": "boolean"},
    },
    ["component", "fromValue", "toValue", "costDelta", "visualImpact", "similarityDelta", "isOptional"],
)

PLAN_SCHEMA = _obj(
    {
        "label": _STR,
        "similarityPercent": _INT,
        "resultingMin": _INT,
        "resultingMax": _INT,
        "savings": _INT,
        "rationale": _STR,
        "substitutions": {"type": "array", "items": SUBSTITUTION_SCHEMA},
    },
    ["label", "similarityPercent", "resultingMin", "resultingMax", "savings", "rationale", "substitutions"],
)

BUDGET_SCHEMA = _obj(
    {
        "feasible": {"type": "boolean"},
        "infeasibleReason": _NULLABLE_STR,
        "alternatives": _STR_LIST,
        "plans": {"type": "array", "items": PLAN_SCHEMA},
    },
    ["feasible", "infeasibleReason", "alternatives", "plans"],
)

AUTOTAG_SCHEMA = _obj(
    {
        "category": _NULLABLE_STR,
        "occasion": _NULLABLE_STR,
        "fabric": _NULLABLE_STR,
        "embroidery": _NULLABLE_STR,
        "palette": _STR_LIST,
        "tags": _STR_LIST,
    },
    ["category", "occasion", "fabric", "embroidery", "palette", "tags"],
)

QC_FINDING_SCHEMA = _obj(
    {
        "criterion": {
            "type": "string",
            "enum": ["DESIGN_SIMILARITY", "STITCHING", "MEASUREMENTS", "EMBROIDERY", "FINISHING"],
        },
        "passed": {"type": "boolean"},
        "note": _STR,
    },
    ["criterion", "passed", "note"],
)

QC_SCHEMA = _obj(
    {"similarityScore": _INT, "findings": {"type": "array", "items": QC_FINDING_SCHEMA}},
    ["similarityScore", "findings"],
)

COPILOT_TASK_SCHEMA = _obj(
    {"title": _STR, "detail": _STR, "action": _STR, "entityId": _NULLABLE_STR},
    ["title", "detail", "action", "entityId"],
)

COPILOT_SCHEMA = _obj(
    {"headline": _STR, "tasks": {"type": "array", "items": COPILOT_TASK_SCHEMA}},
    ["headline", "tasks"],
)
