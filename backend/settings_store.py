"""Read and write the single local installation's agent configuration.

Provider choices, prompt overrides, enabled tools, and enabled skills belong
to this machine, so they are stored in ``backend/local_data`` rather than in
browser storage or source-controlled files. API keys are deliberately kept in
process memory (or read from the environment) and are never written to disk.
"""

import json
import re
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.schemas import WritingMode


BACKEND_DIR = Path(__file__).resolve().parent
LOCAL_DATA_DIR = BACKEND_DIR / "local_data"
SETTINGS_FILE = LOCAL_DATA_DIR / "agent_settings.json"
SKILLS_DIR = LOCAL_DATA_DIR / "skills"
SKILLS_INDEX_FILE = LOCAL_DATA_DIR / "skills_index.json"

AVAILABLE_TOOLS = {
    "word_character_count": {
        "label": "Word and character counter",
        "description": "Calculate exact word and character totals for supplied text.",
    },
    "character_limit_check": {
        "label": "Character limit checker",
        "description": "Check supplied text against a character limit, including spaces.",
    },
}


class LocalSettings(BaseModel):
    """Validated settings persisted for this local app installation."""

    model_config = ConfigDict(extra="forbid")

    provider: str = "ollama"
    model: str = "gemma3:4b"
    ollama_base_url: str = "http://localhost:11434/v1"
    enabled_tools: list[str] = Field(
        default_factory=lambda: ["word_character_count", "character_limit_check"],
        max_length=20,
    )
    enabled_skills: list[str] = Field(default_factory=list, max_length=100)
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

    @field_validator("enabled_tools")
    @classmethod
    def known_tools_only(cls, values: list[str]) -> list[str]:
        unknown = set(values) - AVAILABLE_TOOLS.keys()
        if unknown:
            raise ValueError(f"Unknown tool selection: {', '.join(sorted(unknown))}")
        return list(dict.fromkeys(values))

    @field_validator("enabled_skills")
    @classmethod
    def safe_skill_names(cls, values: list[str]) -> list[str]:
        for value in values:
            if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,47}", value):
                raise ValueError("Skill names must be lowercase letters, numbers, or hyphens.")
        return list(dict.fromkeys(values))

    @field_validator("prompt_overrides")
    @classmethod
    def bounded_prompt_overrides(cls, values: dict[WritingMode, str]) -> dict[WritingMode, str]:
        for mode, prompt in values.items():
            if not prompt.strip():
                raise ValueError(f"The custom {mode.value} prompt cannot be blank.")
            if len(prompt) > 50_000:
                raise ValueError(f"The custom {mode.value} prompt is too long (50,000 characters maximum).")
        return {mode: prompt.strip() for mode, prompt in values.items()}


class SkillDefinition(BaseModel):
    """A user-authored Harness skill containing instructions, never code."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=5, max_length=240)
    instructions: str = Field(min_length=1, max_length=20_000)


class SettingsUpdate(LocalSettings):
    """Settings submitted by the local UI, with an optional session-only key."""

    openai_api_key: str | None = Field(default=None, max_length=500)
    forget_openai_api_key: bool = False


# A key entered in the local UI lives only for this backend process. The
# environment variable remains the preferred option for a persistent secret.
_session_openai_api_key: str | None = None


def _ensure_local_directories() -> None:
    LOCAL_DATA_DIR.mkdir(parents=True, exist_ok=True)
    SKILLS_DIR.mkdir(parents=True, exist_ok=True)


def load_settings() -> LocalSettings:
    """Load validated settings, creating the default local configuration."""

    _ensure_local_directories()
    if not SETTINGS_FILE.exists():
        return LocalSettings()
    try:
        return LocalSettings.model_validate_json(SETTINGS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        # Keep startup recoverable if a user hand-edits malformed JSON. The
        # next explicit save will replace it with validated configuration.
        return LocalSettings()


def save_settings(settings: LocalSettings) -> None:
    """Persist validated configuration using an atomic replace."""

    _ensure_local_directories()
    temporary_file = SETTINGS_FILE.with_suffix(".tmp")
    temporary_file.write_text(settings.model_dump_json(indent=2), encoding="utf-8")
    temporary_file.replace(SETTINGS_FILE)


def update_session_key(key: str | None, forget: bool = False) -> None:
    """Update the process-only API key without putting it in the settings file."""

    global _session_openai_api_key
    if forget:
        _session_openai_api_key = None
    elif key:
        _session_openai_api_key = key.strip()


def get_openai_api_key() -> str | None:
    """Return the session key first, then the optional environment key."""

    import os

    return _session_openai_api_key or os.getenv("OPENAI_API_KEY")


def list_skills() -> list[dict[str, str]]:
    """Return skill descriptions saved by this local app."""

    _ensure_local_directories()
    try:
        data = json.loads(SKILLS_INDEX_FILE.read_text(encoding="utf-8"))
        return [item for item in data if isinstance(item, dict) and (SKILLS_DIR / item.get("id", "") / "SKILL.md").is_file()]
    except (OSError, ValueError, TypeError):
        return []


def create_skill(definition: SkillDefinition) -> dict[str, str]:
    """Create a SKILL.md package for the Pydantic AI Harness Skills capability."""

    _ensure_local_directories()
    slug = re.sub(r"[^a-z0-9]+", "-", definition.name.lower()).strip("-")[:48].strip("-")
    if len(slug) < 2:
        raise ValueError("Give the skill a name that contains at least two letters or numbers.")
    if any(skill["id"] == slug for skill in list_skills()):
        raise FileExistsError("A skill with that name already exists.")

    skill_directory = (SKILLS_DIR / slug).resolve()
    if skill_directory.parent != SKILLS_DIR.resolve():
        raise ValueError("Invalid skill name.")
    skill_directory.mkdir(parents=True, exist_ok=False)

    # JSON string quoting is also valid YAML quoting for this simple scalar.
    import json as _json

    markdown = (
        "---\n"
        f"name: {slug}\n"
        f"description: {_json.dumps(definition.description.strip(), ensure_ascii=False)}\n"
        "---\n\n"
        f"{definition.instructions.strip()}\n"
    )
    (skill_directory / "SKILL.md").write_text(markdown, encoding="utf-8")

    skill = {
        "id": slug,
        "name": definition.name.strip(),
        "description": definition.description.strip(),
        "instructions": definition.instructions.strip(),
    }
    skills = list_skills()
    skills.append(skill)
    SKILLS_INDEX_FILE.write_text(json.dumps(skills, ensure_ascii=False, indent=2), encoding="utf-8")
    return skill


def update_skill(skill_id: str, definition: SkillDefinition) -> dict[str, str]:
    """Replace the instructions and display metadata for an existing skill."""

    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,47}", skill_id):
        raise ValueError("Invalid skill name.")
    skill_directory = (SKILLS_DIR / skill_id).resolve()
    if skill_directory.parent != SKILLS_DIR.resolve():
        raise ValueError("Invalid skill path.")
    skill_file = skill_directory / "SKILL.md"
    if not skill_file.is_file():
        raise FileNotFoundError("That skill does not exist.")

    import json as _json

    markdown = (
        "---\n"
        f"name: {skill_id}\n"
        f"description: {_json.dumps(definition.description.strip(), ensure_ascii=False)}\n"
        "---\n\n"
        f"{definition.instructions.strip()}\n"
    )
    skill_file.write_text(markdown, encoding="utf-8")
    updated_skill = {
        "id": skill_id,
        "name": definition.name.strip(),
        "description": definition.description.strip(),
        "instructions": definition.instructions.strip(),
    }
    skills = [skill for skill in list_skills() if skill["id"] != skill_id]
    skills.append(updated_skill)
    SKILLS_INDEX_FILE.write_text(json.dumps(skills, ensure_ascii=False, indent=2), encoding="utf-8")
    return updated_skill


def delete_skill(skill_id: str) -> None:
    """Delete one validated skill directory and remove it from the local index."""

    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,47}", skill_id):
        raise ValueError("Invalid skill name.")
    skill_directory = (SKILLS_DIR / skill_id).resolve()
    if skill_directory.parent != SKILLS_DIR.resolve():
        raise ValueError("Invalid skill path.")
    if not (skill_directory / "SKILL.md").is_file():
        raise FileNotFoundError("That skill does not exist.")
    (skill_directory / "SKILL.md").unlink()
    skill_directory.rmdir()
    remaining = [skill for skill in list_skills() if skill["id"] != skill_id]
    SKILLS_INDEX_FILE.write_text(json.dumps(remaining, ensure_ascii=False, indent=2), encoding="utf-8")
    current = load_settings()
    current.enabled_skills = [name for name in current.enabled_skills if name != skill_id]
    save_settings(current)
