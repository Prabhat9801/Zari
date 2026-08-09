"""Configuration for the Zari AI service.

Every value comes from the environment. The service refuses to start without
the required ones rather than failing on the first request.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Service -----------------------------------------------------------
    environment: Literal["development", "production"] = "development"
    port: int = 9000
    log_level: str = "INFO"

    # Shared secret with the Node backend. Must match AI_SERVICE_TOKEN there.
    service_token: str = Field(min_length=16)

    # --- Anthropic ---------------------------------------------------------
    anthropic_api_key: str = Field(min_length=10)

    # Claude Opus 5 is the default: it handles the multi-constraint reasoning
    # a manufacturable garment spec needs (construction logic + costing +
    # substitution trade-offs) in a single structured pass.
    model_id: str = "claude-opus-5"
    # Effort tunes depth vs. cost. "high" is the sweet spot for design work;
    # drop to "medium" if latency matters more than nuance.
    effort: Literal["low", "medium", "high", "xhigh", "max"] = "high"
    max_tokens: int = 16000

    # --- Image generation --------------------------------------------------
    # "none" disables imagery entirely and the service returns specs only —
    # the product still works, the canvas just falls back to illustration.
    image_provider: Literal["none", "replicate", "fal"] = "none"
    replicate_api_token: str = ""
    replicate_model: str = "black-forest-labs/flux-1.1-pro"
    fal_api_key: str = ""
    fal_model: str = "fal-ai/flux/dev"
    image_timeout_seconds: int = 90

    # --- Behaviour ---------------------------------------------------------
    request_timeout_seconds: int = 180
    max_concepts: int = 4


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
