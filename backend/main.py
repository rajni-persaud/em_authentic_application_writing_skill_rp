"""FastAPI application for the voice-first writing coach.

This module connects the browser, the selected prompt file, and the local
Ollama server. It also serves the static HTML/CSS/JavaScript interface.
"""

import os
from pathlib import Path
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from backend.prompts import load_system_prompt
from backend.schemas import ChatRequest, ChatResponse


# Allow the Ollama address and model to be changed for another local setup
# without editing source code. The defaults match the current Windows setup.
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:4b")

# Resolve front-end files relative to this Python file, not the shell's
# current directory, so the app can serve them wherever it is launched from.
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "front-end"


app = FastAPI(
    title="Voice-first Writing Coach",
    description="Local API for blog post, Facebook, Instagram, and LinkedIn coaching.",
    version="0.1.0",
)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Report that FastAPI is running; this does not check Ollama itself."""

    return {"status": "ok"}


@app.post("/api/chat", response_model=ChatResponse)
async def create_chat_turn(request: ChatRequest) -> ChatResponse:
    """Start or continue a prompt-guided conversation and return Ollama's reply.

    FastAPI parses the JSON into ChatRequest before this function runs. The
    endpoint then loads the selected mode's prompt, prepends it to the
    conversation, and sends the combined messages to Ollama. If the browser
    submits an empty history, this is the opening call made right after the
    user chooses a writing mode; the prompt itself tells Ollama how to begin.
    """

    # Load the server-controlled instructions that correspond to the validated
    # mode. A missing or empty prompt is a server configuration problem.
    try:
        system_prompt = load_system_prompt(request.mode)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Ollama expects chat messages in order. Put the system instructions first,
    # then pass along the user/assistant history supplied by the browser. For
    # an opening call, this list contains only the system prompt, prompting
    # Ollama to produce the coach's first natural response without a canned
    # assistant greeting from the front end.
    ollama_messages = [
        {"role": "system", "content": system_prompt},
        *[message.model_dump() for message in request.messages],
    ]

    # Make a non-streaming request for the first version of the app. The
    # longer overall timeout allows a local model time to load and generate;
    # the shorter connect timeout catches a stopped Ollama service promptly.
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=5.0)) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": ollama_messages,
                    "stream": False,
                },
            )
            response.raise_for_status()
    except httpx.ConnectError as exc:
        # Ollama is a separate local process; this usually means its desktop
        # app/server is not running or is listening at another address.
        raise HTTPException(
            status_code=503,
            detail="Cannot connect to Ollama. Make sure the Ollama app is running.",
        ) from exc
    except httpx.TimeoutException as exc:
        # Translate the client timeout into an HTTP gateway timeout that the
        # browser can display as a useful message.
        raise HTTPException(
            status_code=504,
            detail="Ollama took too long to respond. Try again in a moment.",
        ) from exc
    except httpx.HTTPStatusError as exc:
        # Ollama responded, but rejected the request (often because the model
        # name is unavailable). Do not pass raw internal response details on.
        raise HTTPException(
            status_code=502,
            detail=(
                "Ollama could not process the request. Confirm the configured model "
                f"'{OLLAMA_MODEL}' is installed and available."
            ),
        ) from exc

    # Decode and validate Ollama's JSON before constructing our API response.
    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Ollama returned an invalid response.") from exc

    message = data.get("message") if isinstance(data, dict) else None
    reply = message.get("content") if isinstance(message, dict) else None
    if not isinstance(reply, str) or not reply.strip():
        raise HTTPException(status_code=502, detail="Ollama returned an empty reply.")

    # Reuse the browser's chat ID when present. Otherwise create one so the
    # response always has an identifier the front end can associate with it.
    return ChatResponse(
        chat_id=request.chat_id or str(uuid4()),
        mode=request.mode,
        reply=reply,
    )


# Mount static files after the API routes so paths like /api/chat and /health
# are handled by FastAPI first, while / serves front-end/index.html. Serving
# both on one origin lets the browser call /api/chat without CORS settings.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
