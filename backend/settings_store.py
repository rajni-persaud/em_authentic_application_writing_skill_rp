"""Read and write the local provider, model, and prompt configuration."""

import os
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.schemas import WritingMode


BACKEND_DIR = Path(__file__).resolve().parent
LOCAL_DATA_DIR = BACKEND_DIR / "local_data"
SETTINGS_FILE = LOCAL_DATA_DIR / "agent_settings.json"


class LocalSettings(BaseModel):
    """Validated settings for this local writing-coach installation."""

    model_config = ConfigDict(extra="ignore")

    provider: str = "ollama"
    model: str = "gemma3:4b"
    ollama_base_url: str = "http://localhost:11434/v1"
    prompt_overrides: dict[WritingMode, str] = Field(default_factory=dict)

    @field_validator("provider")
    @classmethod
    def supported_provider(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in {"ollama", "openai"}:
            raise ValueError("Provider must be 'ollama' or 'openai'.")
        return value

    @field_validator("model")
    @classmethod
    def valid_model_name(cls, value: str) -> str:
        value = value.strip()
        if not value or len(value) > 160:
            raise ValueError("Enter a model name of 1 to 160 characters.")
        return value

    @field_validator("ollama_base_url")
    @classmethod
    def valid_ollama_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if not value.startswith(("http://", "https://")):
            raise ValueError("Ollama URL must start with http:// or https://.")
        return value

    @field_validator("prompt_overrides")
    @classmethod
    def bounded_prompt_overrides(cls, values: dict[WritingMode, str]) -> dict[WritingMode, str]:
        for mode, prompt in values.items():
            if not prompt.strip():
                raise ValueError(f"The custom {mode.value} prompt cannot be blank.")
            if len(prompt) > 50_000:
                raise ValueError(f"The custom {mode.value} prompt is too long (50,000 characters maximum).")
        return {mode: prompt.strip() for mode, prompt in values.items()}


class SettingsUpdate(LocalSettings):
    """Settings submitted by the UI, with an optional session-only API key."""

    openai_api_key: str | None = Field(default=None, max_length=500)
    forget_openai_api_key: bool = False


_session_openai_api_key: str | None = None


def load_settings() -> LocalSettings:
    """Load settings and transparently ignore legacy tool/skill fields."""

    LOCAL_DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not SETTINGS_FILE.exists():
        return LocalSettings()
    try:
        raw = SETTINGS_FILE.read_text(encoding="utf-8")
        # Older versions stored enabled_tools and enabled_skills. The model
        # intentionally ignores those obsolete fields during migration.
        return LocalSettings.model_validate_json(raw)
    except (OSError, ValueError):
        return LocalSettings()


def save_settings(settings: LocalSettings) -> None:
    """Persist only provider, model, URL, and prompt overrides."""

    LOCAL_DATA_DIR.mkdir(parents=True, exist_ok=True)
    temporary_file = SETTINGS_FILE.with_suffix(".tmp")
    temporary_file.write_text(settings.model_dump_json(indent=2), encoding="utf-8")
    temporary_file.replace(SETTINGS_FILE)


def update_session_key(key: str | None, forget: bool = False) -> None:
    """Keep an entered OpenAI key in memory only."""

    global _session_openai_api_key
    if forget:
        _session_openai_api_key = None
    elif key:
        _session_openai_api_key = key.strip()


def get_openai_api_key() -> str | None:
    """Return the session key or an environment-provided key."""

    return _session_openai_api_key or os.getenv("OPENAI_API_KEY")
