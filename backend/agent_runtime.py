"""Build and run the provider/model-configured writing coach agent."""

import asyncio

from backend.schemas import ChatMessage
from backend.settings_store import LocalSettings, get_openai_api_key


OPENING_USER_PROMPT = "Begin the conversation now. Follow your instructions and ask the next necessary question."


def _build_model(settings: LocalSettings):
    """Create the provider-specific Pydantic AI model from local settings."""

    if settings.provider == "ollama":
        from pydantic_ai.models.ollama import OllamaModel
        from pydantic_ai.providers.ollama import OllamaProvider

        return OllamaModel(
            settings.model,
            provider=OllamaProvider(base_url=settings.ollama_base_url),
        )

    api_key = get_openai_api_key()
    if not api_key:
        raise ValueError(
            "OpenAI is selected, but no API key is configured. Enter a key in Settings or set OPENAI_API_KEY."
        )
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    return OpenAIChatModel(
        settings.model,
        provider=OpenAIProvider(api_key=api_key),
    )


def _build_agent(settings: LocalSettings, system_prompt: str) -> "Agent":
    """Construct a plain Pydantic AI agent using only model and instructions."""

    from pydantic_ai import Agent

    return Agent(
        _build_model(settings),
        instructions=system_prompt,
    )


def _history_for_agent(messages: list[ChatMessage]):
    """Convert browser role/content history into Pydantic AI messages."""

    from pydantic_ai.messages import ModelRequest, ModelResponse, TextPart, UserPromptPart

    history: list[ModelRequest | ModelResponse] = []
    for message in messages:
        if message.role == "user":
            history.append(ModelRequest(parts=[UserPromptPart(content=message.content)]))
        else:
            history.append(ModelResponse(parts=[TextPart(content=message.content)]))
    return history


async def generate_reply(
    settings: LocalSettings,
    system_prompt: str,
    messages: list[ChatMessage],
) -> str:
    """Run one prompt-guided turn while preserving the existing chat contract."""

    from pydantic_ai.messages import ModelRequest, ModelResponse, TextPart, UserPromptPart

    agent = _build_agent(settings, system_prompt)
    if messages:
        previous_messages = messages[:-1]
        current_user_prompt = messages[-1].content
        if previous_messages and previous_messages[0].role == "assistant":
            history = [
                ModelRequest(parts=[UserPromptPart(content=OPENING_USER_PROMPT)]),
                ModelResponse(parts=[TextPart(content=previous_messages[0].content)]),
                *_history_for_agent(previous_messages[1:]),
            ]
        else:
            history = _history_for_agent(previous_messages)
    else:
        current_user_prompt = OPENING_USER_PROMPT
        history = []

    result = await asyncio.wait_for(
        agent.run(current_user_prompt, message_history=history),
        timeout=180,
    )
    return result.output
