"""Configuration for the Zari AI service.

Every value comes from the environment. The service refuses to start without
the required ones rather than failing on the first request.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("*", mode="before")
    @classmethod
    def _strip_quotes(cls, value: Any) -> Any:
        """Strip surrounding quotes and whitespace from every string setting.

        A .env file carries quotes and dotenv removes them, so people copy the
        quoted form straight into a dashboard env var — where it stays literal.
        `OPENAI_BASE_URL=""` then arrives as two quote characters, which is
        truthy, and every API call dies with an opaque "Connection error"
        pointing at nothing. Normalising here kills that whole class of bug.
        """
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {'"', "'"}:
            cleaned = cleaned[1:-1].strip()
        return cleaned

    # --- Service -----------------------------------------------------------
    environment: Literal["development", "production"] = "development"
    port: int = 9000
    log_level: str = "INFO"

    # Shared secret with the Node backend. Must match AI_SERVICE_TOKEN there.
    service_token: str = Field(min_length=16)

    # --- OpenAI ------------------------------------------------------------
    openai_api_key: str = Field(min_length=10)
    # Optional: set when routing through Azure OpenAI or a proxy/gateway.
    openai_base_url: str = ""

    # The reasoning model that produces design specs, costing, and budget plans.
    # Verify the exact id against platform.openai.com/docs/models before deploying.
    model_id: str = "gpt-5"

    # GPT-5 reasoning depth: minimal | low | medium | high.
    # "high" suits multi-constraint design work; "medium" cuts cost and latency.
    reasoning_effort: Literal["minimal", "low", "medium", "high"] = "high"
    max_output_tokens: int = 16000

    # --- Image generation --------------------------------------------------
    # "none" disables imagery entirely and the service returns specs only —
    # the product still works, the canvas just falls back to illustration.
    image_provider: Literal["none", "openai"] = "none"
    image_model: str = "gpt-image-2"
    image_size: str = "1024x1536"  # portrait, close to the 3:4 the studio expects
    image_quality: Literal["low", "medium", "high", "auto"] = "medium"
    image_timeout_seconds: int = 120

    # --- Cost tracking -----------------------------------------------------
    # Paise per 1M tokens, used only to record spend on the AiJob row.
    # Update these when pricing changes; they do not affect behaviour.
    input_paise_per_mtok: int = Field(default=110_000)
    output_paise_per_mtok: int = Field(default=880_000)

    # --- Behaviour ---------------------------------------------------------
    request_timeout_seconds: int = 180
    max_concepts: int = 4


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
