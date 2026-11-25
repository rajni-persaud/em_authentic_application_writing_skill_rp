"""Build and run a configured Pydantic AI writing coach agent.

This is the model-provider boundary for the app. A request selects validated
local settings; this module turns those settings into a Pydantic AI model,
adds only the enabled built-in tools and Harness skills, and runs one turn.
"""

import asyncio
import re

from backend.schemas import ChatMessage
from backend.settings_store import (
    LOCAL_DATA_DIR,
    LocalSettings,
    get_openai_api_key,
)


OPENING_USER_PROMPT = "Begin the conversation now. Follow your instructions and ask the next necessary question."


def _build_model(settings: LocalSettings):
    """Create the provider-specific Pydantic AI model from local settings."""

    if settings.provider == "ollama":
        # Pydantic AI talks to Ollama's OpenAI-compatible local endpoint.
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
    """Compose the agent from its current prompt, capabilities, and tools."""

    from pydantic_ai import Agent
    from pydantic_ai.workspaces import LocalWorkspaceBackend
    from pydantic_ai_harness import Skills

    capabilities = []
    if settings.enabled_skills:
        capabilities.append(
            Skills(
                "skills",
                include=settings.enabled_skills,
                workspace=LocalWorkspaceBackend(LOCAL_DATA_DIR),
            )
        )

    tool_guidance = []
    if "word_character_count" in settings.enabled_tools:
        tool_guidance.append(
            "When the user asks for an exact word or character count of supplied text, "
            "use the word_character_count tool instead of estimating. Explain that "
            "characters include spaces and line breaks unless the user asks otherwise."
        )
    if "character_limit_check" in settings.enabled_tools:
        tool_guidance.append(
            "When the user asks whether text fits a character limit, use the "
            "character_limit_check tool. If no limit is supplied, ask for it; do not "
            "guess or invent a platform limit."
        )
    agent_instructions = system_prompt
    if tool_guidance:
        agent_instructions += "\n\nEnabled tool guidance:\n- " + "\n- ".join(tool_guidance)

    agent = Agent(
        _build_model(settings),
        instructions=agent_instructions,
        capabilities=capabilities,
    )

    # These functions are deliberately deterministic and side-effect free.
    # Users can enable them in Settings; the model can call them when a writing
    # task needs exact counts instead of estimating from prose.
    if "word_character_count" in settings.enabled_tools:

        @agent.tool_plain
        def word_character_count(text: str) -> str:
            """Count words and characters in supplied draft text.

            Character totals use Python Unicode code points. The total that
            includes whitespace counts spaces and line breaks as characters.
            """

            words = len(text.split())
            characters_with_spaces = len(text)
            characters_without_whitespace = len(re.sub(r"\s", "", text))
            return (
                f"Words: {words}; characters including spaces and line breaks: "
                f"{characters_with_spaces}; characters excluding whitespace: "
                f"{characters_without_whitespace}."
            )

    if "character_limit_check" in settings.enabled_tools:

        @agent.tool_plain
        def character_limit_check(text: str, limit: int) -> str:
            """Check whether text is within a supplied character limit.

            Counts Unicode code points including spaces and line breaks. The
            model must use a limit supplied by the user or verified for the
            specific platform; this tool does not guess platform limits.
            """

            if limit < 1 or limit > 100_000:
                return "The limit must be between 1 and 100,000 characters."
            count = len(text)
            difference = limit - count
            if difference >= 0:
                return f"Text has {count} characters and is {difference} under the {limit}-character limit."
            return f"Text has {count} characters and is {abs(difference)} over the {limit}-character limit."

    return agent


def _history_for_agent(messages: list[ChatMessage]):
    """Convert the browser's role/content history into Pydantic AI messages."""

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
    """Run a configured agent turn while keeping the existing chat contract."""

    from pydantic_ai.messages import ModelRequest, ModelResponse, TextPart, UserPromptPart

    agent = _build_agent(settings, system_prompt)
    if messages:
        # The API schema guarantees that the newest message is a user turn.
        previous_messages = messages[:-1]
        current_user_prompt = messages[-1].content
        # The front end stores visible chat turns only, so its transcript starts
        # with the model's opening response. Recreate the invisible startup
        # instruction that produced that response to keep Pydantic AI's history
        # in request/response order and preserve the opening context.
        if previous_messages and previous_messages[0].role == "assistant":
            history = [
                ModelRequest(parts=[UserPromptPart(content=OPENING_USER_PROMPT)]),
                ModelResponse(parts=[TextPart(content=previous_messages[0].content)]),
                *_history_for_agent(previous_messages[1:]),
            ]
        else:
            history = _history_for_agent(previous_messages)
    else:
        # Agent loops require a user turn. This neutral instruction lets the
        # selected coaching prompt decide how the conversation should begin.
        current_user_prompt = OPENING_USER_PROMPT
        history = []

    result = await asyncio.wait_for(
        agent.run(current_user_prompt, message_history=history),
        timeout=180,
    )
    return result.output
