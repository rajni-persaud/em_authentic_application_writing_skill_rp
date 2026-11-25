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
    """The data the browser sends to start or continue a conversation.

    An empty ``messages`` list means the user has just chosen a writing mode
    and the backend should ask the configured agent for its prompt-guided opening.
    A non-empty list means the user has sent a turn and the full conversation
    history is included for context.
    """

    # As with ChatMessage, reject fields outside this API contract.
    model_config = ConfigDict(extra="forbid")

    # The selected mode chooses which trusted prompt file the server loads.
    mode: WritingMode

    # The front end creates a stable ID for each chat. It is optional so
    # another client can omit it; main.py creates one for the response then.
    chat_id: str | None = Field(default=None, min_length=1, max_length=128)

    # The browser sends prior user/assistant turns so the agent has context. An
    # empty list is allowed for the initial prompt-only opening call. These
    # bounds cap the history length and each message's size.
    messages: list[ChatMessage] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def latest_message_must_be_from_user(self) -> "ChatRequest":
        """When continuing a chat, require the newest turn to come from the user."""

        # Empty history is the intentional startup request sent immediately
        # after mode selection. Otherwise, the endpoint should have been
        # called in response to a fresh user message.
        if self.messages and self.messages[-1].role != "user":
            raise ValueError("The last message must be from the user.")
        return self


class ChatResponse(BaseModel):
    """The JSON contract for a successful reply sent back to the browser."""

    # Echo the conversation identity and writing mode alongside the answer so
    # the front end can associate the response with the right chat.
    chat_id: str | None
    mode: WritingMode
    reply: str
