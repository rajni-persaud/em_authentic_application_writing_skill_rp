"""FastAPI application for the locally configurable writing coach.

The API validates browser requests, loads the selected writing prompt and
single-machine configuration, then delegates generation to a Pydantic AI
agent. FastAPI also serves the HTML/CSS/JavaScript app from the same origin.
"""

import logging
from pathlib import Path
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.agent_runtime import generate_reply
from backend.prompts import load_system_prompt
from backend.schemas import ChatRequest, ChatResponse, WritingMode
from backend.settings_store import (
    AVAILABLE_TOOLS,
    LocalSettings,
    SettingsUpdate,
    SkillDefinition,
    create_skill,
    delete_skill,
    get_openai_api_key,
    list_skills,
    load_settings,
    model_supports_agent_tools,
    save_settings,
    update_skill,
    update_session_key,
)


logger = logging.getLogger(__name__)
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "front-end"

app = FastAPI(
    title="Local Writing Coach",
    description="A configurable local writing coach using Pydantic AI and Ollama or OpenAI.",
    version="0.2.0",
)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Report that FastAPI is running; provider availability is checked on use."""

    return {"status": "ok"}


@app.get("/agent_settings", include_in_schema=False)
async def agent_settings_page() -> FileResponse:
    """Serve the dedicated settings page from the front-end directory."""

    return FileResponse(FRONTEND_DIR / "agent_settings.html")


@app.get("/api/settings")
async def get_settings() -> dict[str, object]:
    """Return the local configuration, built-in prompts, tools, and skills.

    The API key is never returned. The browser receives only whether a key is
    available, so an entered key cannot be read back from the settings screen.
    """

    settings = load_settings()
    defaults = {
        mode.value: load_system_prompt(mode)
        for mode in WritingMode
    }
    return {
        "settings": settings.model_dump(mode="json"),
        "default_prompts": defaults,
        "available_tools": [
            {"id": tool_id, **details, "enabled": tool_id in settings.enabled_tools}
            for tool_id, details in AVAILABLE_TOOLS.items()
        ],
        "tool_support": {
            "supported": model_supports_agent_tools(settings.provider, settings.model),
            "notice": (
                "Ollama's Gemma 3 models reject tool calls. Counting tools and Harness skills are paused "
                "for this model; switch to a tool-capable model to use them. Your selections are kept."
                if not model_supports_agent_tools(settings.provider, settings.model)
                else "The selected provider/model is configured to receive enabled tools and skills."
            ),
        },
        "skills": list_skills(),
        "openai_api_key_configured": bool(get_openai_api_key()),
    }


@app.put("/api/settings")
async def update_settings(request: SettingsUpdate) -> dict[str, object]:
    """Validate and save provider, model, prompt, tool, and skill selections."""

    available_skill_ids = {skill["id"] for skill in list_skills()}
    missing_skills = set(request.enabled_skills) - available_skill_ids
    if missing_skills:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown skill selection: {', '.join(sorted(missing_skills))}",
        )

    # Strip transient credentials from the persisted model. API keys remain in
    # process memory only; an environment variable can also supply the key.
    persistent_data = request.model_dump(
        exclude={"openai_api_key", "forget_openai_api_key"},
    )
    settings = LocalSettings.model_validate(persistent_data)
    save_settings(settings)
    update_session_key(request.openai_api_key, forget=request.forget_openai_api_key)
    return {
        "settings": settings.model_dump(mode="json"),
        "openai_api_key_configured": bool(get_openai_api_key()),
        "tool_support": {
            "supported": model_supports_agent_tools(settings.provider, settings.model),
            "notice": (
                "Ollama's Gemma 3 models reject tool calls. Counting tools and Harness skills are paused "
                "for this model; switch to a tool-capable model to use them. Your selections are kept."
                if not model_supports_agent_tools(settings.provider, settings.model)
                else "The selected provider/model is configured to receive enabled tools and skills."
            ),
        },
        "message": "Settings saved on this computer.",
    }


@app.post("/api/skills", status_code=201)
async def add_skill(request: SkillDefinition) -> dict[str, str]:
    """Save a local SKILL.md instruction package for the Harness Skills API."""

    try:
        return create_skill(request)
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.put("/api/skills/{skill_id}")
async def edit_skill(skill_id: str, request: SkillDefinition) -> dict[str, str]:
    """Update instructions for a selected local Harness skill."""

    try:
        return update_skill(skill_id, request)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.delete("/api/skills/{skill_id}")
async def remove_skill(skill_id: str) -> dict[str, str]:
    """Delete a locally authored skill and remove it from enabled settings."""

    try:
        delete_skill(skill_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"message": "Skill deleted."}


@app.post("/api/chat", response_model=ChatResponse)
async def create_chat_turn(request: ChatRequest) -> ChatResponse:
    """Run a prompt-guided turn using this installation's selected agent setup."""

    settings = load_settings()
    system_prompt = settings.prompt_overrides.get(request.mode)
    if system_prompt is None:
        try:
            system_prompt = load_system_prompt(request.mode)
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    try:
        reply = await generate_reply(settings, system_prompt, request.messages)
    except ValueError as exc:
        # Missing provider credentials and invalid local model configuration
        # are actionable setup problems and can be shown directly to the user.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="Pydantic AI dependencies are missing. Install backend requirements and restart the server.",
        ) from exc
    except (TimeoutError, httpx.TimeoutException) as exc:
        raise HTTPException(
            status_code=504,
            detail="The selected model took too long to respond. Check it is running and try again.",
        ) from exc
    except httpx.ConnectError as exc:
        provider_hint = "Ollama" if settings.provider == "ollama" else "OpenAI"
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to {provider_hint}. Check the provider settings and try again.",
        ) from exc
    except Exception as exc:
        if "does not support tools" in str(exc).casefold():
            raise HTTPException(
                status_code=422,
                detail=(
                    "The selected model rejected tool calls. Disable its tools and Harness skills, "
                    "or choose a model that supports tool use."
                ),
            ) from exc
        # Avoid returning provider internals (which can include request data or
        # credential details) to the browser. Keep diagnostics in the local log.
        logger.exception("Pydantic AI request failed for provider %s", settings.provider)
        raise HTTPException(
            status_code=502,
            detail="The agent could not complete this request. Check the backend terminal for details.",
        ) from exc

    if not reply.strip():
        raise HTTPException(status_code=502, detail="The selected model returned an empty reply.")

    return ChatResponse(
        chat_id=request.chat_id or str(uuid4()),
        mode=request.mode,
        reply=reply,
    )


# Register static hosting after API routes so requests for API paths are
# resolved first, and the chat UI and API stay on one local origin.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
