"""Zari AI service.

A small, stateless FastAPI app that turns customer briefs into manufacturable
garment specs, prices them against ops-managed cost rules, and finds ways to fit
a budget. It holds no database and no user data — the Node backend owns all
persistence and is the only caller.

Deployed separately (Render) so the model workload can scale, fail, and be
rolled back independently of the API.
"""

from __future__ import annotations

import logging
import sys

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pythonjsonlogger import json as jsonlogger

from app.config import get_settings
from app.routers import design, studio

settings = get_settings()

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(jsonlogger.JsonFormatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
logging.basicConfig(level=settings.log_level, handlers=[handler], force=True)

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Zari AI Service",
    description="Design generation, costing, and budget optimisation for Zari.",
    version="1.0.0",
    docs_url="/docs" if settings.environment == "development" else None,
    redoc_url=None,
)

app.include_router(design.router)
app.include_router(studio.router)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Liveness. Deliberately does not call Anthropic — a provider blip must not
    make Render think the container is dead and restart it."""
    return {"status": "ok", "service": "zari-ai", "model": settings.model_id}


@app.get("/health/ready", tags=["health"])
async def ready() -> dict[str, object]:
    return {
        "status": "ok",
        "model": settings.model_id,
        "effort": settings.effort,
        "imageProvider": settings.image_provider,
    }


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Errors reaching a customer must be human-readable, never a stack trace."""
    logger.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "detail": {
                "message": "Zari couldn't finish that. Nothing is lost — please try again.",
            }
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=settings.environment == "development")
