"""Load the trusted coaching prompt for a supported writing mode.

The browser sends a mode such as ``blog_post`` or ``linkedin``. This module
translates that validated mode into one of the prompt files stored in the
project. Keeping this mapping on the backend means callers cannot choose an
arbitrary file path to read.
"""

from pathlib import Path

from backend.schemas import WritingMode


# Find the repository root from this file's location rather than relying on
# the process's current working directory. ``prompts.py`` is in ``backend/``;
# its parent is the backend folder and the next parent is the project root.
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# This allowlist is the only connection between API modes and prompt files.
# The enum keys are validated by ChatRequest before this mapping is used.
# The values use paths relative to PROJECT_ROOT, so the app can be launched
# from the repository root or another working directory.
PROMPT_FILES: dict[WritingMode, Path] = {
    WritingMode.BLOG_POST: PROJECT_ROOT / "writing_prompts" / "blog_post" / "Blog_Post_Writing_Coach_Prompt.txt",
    WritingMode.FACEBOOK: PROJECT_ROOT / "writing_prompts" / "facebook" / "Facebook_Writing_Coach_Prompt.txt",
    WritingMode.INSTAGRAM: PROJECT_ROOT / "writing_prompts" / "instagram" / "Instagram_Writing_Coach_Prompt.txt",
    WritingMode.LINKEDIN: PROJECT_ROOT / "writing_prompts" / "linkedin" / "LinkedIn_Event_Reflection_Coach_Prompt.txt",
}


def load_system_prompt(mode: WritingMode) -> str:
    """Read and return the prompt assigned to a validated writing mode.

    Args:
        mode: One of the WritingMode values accepted by the chat API.

    Returns:
        The selected prompt's UTF-8 text, with surrounding whitespace removed.

    Raises:
        RuntimeError: If the mapped file cannot be read or contains no text.
    """

    # Use the fixed mapping above. Do not construct a filesystem path from
    # user-provided text; only a known WritingMode can select a prompt.
    prompt_path = PROMPT_FILES[mode]
    try:
        # Read at request time so prompt edits take effect without restarting
        # the backend. UTF-8 preserves punctuation and other non-ASCII text.
        prompt = prompt_path.read_text(encoding="utf-8").strip()
    except OSError as exc:
        # Convert lower-level file errors into one clear error for the API
        # handler, while retaining the original exception as diagnostic cause.
        raise RuntimeError(f"The prompt file for {mode.value} could not be read.") from exc

    if not prompt:
        # An empty system prompt would make the selected writing mode behave
        # as if no coaching instructions had been loaded, so fail explicitly.
        raise RuntimeError(f"The prompt file for {mode.value} is empty.")

    # The caller (main.py) will place this text in Ollama's system message.
    return prompt
