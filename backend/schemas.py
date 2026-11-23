"""Validated request and response shapes for the writing-coach API.

FastAPI uses these Pydantic models to parse incoming JSON, reject invalid
requests, and describe the JSON returned to the browser.
"""

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class WritingMode(StrEnum):
    """The exact writing-mode names shared by the browser and backend.

    Keeping the values in an enum prevents unknown mode names from reaching
    the prompt loader. These values must match the front-end mode keys and the
    keys used by the backend prompt-file mapping.
    """

    BLOG_POST = "blog_post"
    FACEBOOK = "facebook"
    INSTAGRAM = "instagram"
    LINKEDIN = "linkedin"


class ChatMessage(BaseModel):
    """One turn in the conversation history sent with a chat request."""

    # Reject misspelled or unexpected JSON fields instead of silently
    # accepting them. The system prompt is deliberately not a client message;
    # the backend loads and adds it itself.
    model_config = ConfigDict(extra="forbid")

    # Only ordinary conversation turns are accepted from the browser. Limiting
    # each message also prevents accidentally sending extremely large text.
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=12_000)


class ChatRequest(BaseModel):
    """The data the browser sends when the user submits a new chat turn."""

    # As with ChatMessage, reject fields outside this API contract.
    model_config = ConfigDict(extra="forbid")

    # The selected mode chooses which trusted prompt file the server loads.
    mode: WritingMode

    # The front end creates a stable ID for each chat. It is optional so
    # another client can omit it; main.py creates one for the response then.
    chat_id: str | None = Field(default=None, min_length=1, max_length=128)

    # The browser sends prior user/assistant turns so Ollama has context.
    # These bounds cap the number of turns and the request size per turn.
    messages: list[ChatMessage] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def latest_message_must_be_from_user(self) -> "ChatRequest":
        """Require a new user turn at the end of every submitted history."""

        # The endpoint is called only after the user sends something. This
        # check catches requests that contain history but no new user input.
        if self.messages[-1].role != "user":
            raise ValueError("The last message must be from the user.")
        return self


class ChatResponse(BaseModel):
    """The JSON contract for a successful reply sent back to the browser."""

    # Echo the conversation identity and writing mode alongside the answer so
    # the front end can associate the response with the right chat.
    chat_id: str | None
    mode: WritingMode
    reply: str
