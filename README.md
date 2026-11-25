# Local Writing Coach

A local chat app for coaching blog posts, Facebook posts, Instagram posts, and LinkedIn posts. The front end is plain HTML, CSS, and JavaScript. The Python backend uses FastAPI and Pydantic AI, and can send requests to Ollama on this computer or to OpenAI. Pydantic AI Harness Skills provide optional, user-authored instruction packages.

This guide covers cloning the repository and setting it up on Windows, macOS, or Linux. The app is designed for one local installation; it does not have user accounts.

## Requirements

- Git.
- Python 3.11 or newer.
- Ollama for local model use, or an OpenAI API key for OpenAI model use.
- Internet access to install Python packages, download Ollama/models, and contact OpenAI when using its provider.

Install [Git](https://git-scm.com/downloads), [Python](https://www.python.org/downloads/), and [Ollama](https://ollama.com/download) from their official sites. Python 3.11+ is required because the backend uses `StrEnum`.

## 1. Clone the repository

On the Git hosting page for this repository, choose **Code** and copy the HTTPS clone URL. In PowerShell, Terminal, or another shell, replace the placeholders with that URL and the folder it creates:

```text
git clone <repository-url>
cd <repository-folder>
```

Run the commands below from the repository root, the folder containing `README.md`, `backend/`, `front-end/`, and `writing_prompts/`.

## 2. Set up a model provider

### Option A: Ollama (local, default)

Install Ollama from its [official download page](https://ollama.com/download), launch it, and leave it running while you use the app.

On Windows, open a new PowerShell window after installation. On macOS and Linux, use Terminal. Check the command:

```text
ollama --version
```

Download the default model and confirm it responds:

```text
ollama run gemma3:4b
```

At the model prompt, enter a question. Type `/bye` to exit, then verify the model is installed:

```text
ollama list
```

The app's initial provider is Ollama and its initial model is `gemma3:4b`. You can change both later from **Agent settings**. If you select a different Ollama model, download it first with `ollama pull <model-name>` and enter its exact name in settings. Ollama's [Gemma 3 library page](https://ollama.com/library/gemma3) lists the available model variants.

Windows installer and command troubleshooting are covered on the [Ollama Windows page](https://ollama.com/download/windows). For macOS or Linux installation details, use the corresponding instructions on [ollama.com/download](https://ollama.com/download).

### Option B: OpenAI (cloud)

OpenAI model requests require an API key and may incur API charges. Create a key through your OpenAI account and keep it private.

There are two ways to provide the key:

1. In the app's **Agent settings**, select **OpenAI**, enter a model name and paste the key. The key is sent to the local backend and held in backend memory until the backend stops. It is not saved in the browser's local storage or the local settings file. Enter it again after restarting the backend.
2. Set the `OPENAI_API_KEY` environment variable in the terminal before starting the backend. This lets the backend read the key after a restart, without putting it in the app's settings file.

PowerShell:

```powershell
$env:OPENAI_API_KEY = "your-api-key"
```

macOS/Linux:

```bash
export OPENAI_API_KEY="your-api-key"
```

In **Agent settings**, choose the OpenAI provider and enter a model name available to your account. The key is used only by the backend to authenticate requests to OpenAI. When OpenAI is selected, prompts and chat messages are sent to OpenAI for model processing; they are not being processed locally by Ollama.

## 3. Create the Python environment and install dependencies

The virtual environment installs this app's Python packages separately from other projects.

### Windows PowerShell

Confirm Python is 3.11 or newer:

```powershell
python --version
```

If `python` is not recognized, try the Windows launcher:

```powershell
py -3 --version
```

Create the virtual environment. Use `python` or `py -3` according to which command works and reports Python 3.11+:

```powershell
python -m venv backend\.venv
```

Install the dependencies using that environment's Python:

```powershell
& ".\backend\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\backend\.venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
```

Activation is optional. If PowerShell blocks it, skip activation and use the full virtual-environment Python path above.

If you used `py -3` to create the environment, use the same `backend\.venv\Scripts\python.exe` path for installation and launch.

### macOS and Linux

Confirm Python 3.11 or newer:

```bash
python3 --version
```

Create and activate the environment, then install dependencies:

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
```

If the operating system reports that the `venv` module is missing, install its Python virtual-environment package and repeat the commands.

The requirements include FastAPI and Uvicorn for the web server, Pydantic for validation, Pydantic AI for provider/model support, and Pydantic AI Harness Skills for loading selected `SKILL.md` instructions.

## 4. Start the backend and open the app

Make sure Ollama is running if Ollama is selected. From the repository root, launch Uvicorn.

Windows PowerShell:

```powershell
& ".\backend\.venv\Scripts\python.exe" -m uvicorn backend.main:app --reload
```

macOS/Linux with the environment activated:

```bash
python -m uvicorn backend.main:app --reload
```

Or launch directly without activating:

```bash
./backend/.venv/bin/python -m uvicorn backend.main:app --reload
```

Keep the terminal open. Visit [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser. The interactive API documentation is at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs), and the basic backend health check is at [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health). Stop the backend with **Ctrl+C**.

The UI and API are served from the same origin. Keep the backend bound to its default local address for personal local use; do not expose it to your network without adding authentication and security controls.

## 5. Configure the agent in the app

Choose **Agent settings** in the top bar (or open [http://127.0.0.1:8000/agent_settings](http://127.0.0.1:8000/agent_settings)). Settings now have a dedicated page with a link back to chat. These settings apply to this local installation and are shared by its chats.

### Provider and model

- Choose **Ollama (local)** or **OpenAI (cloud)**.
- Enter the model identifier expected by that provider. For example, the default Ollama model is `gemma3:4b`.
- For Ollama, enter a different API URL only if your server does not use the default `http://localhost:11434/v1`.
- For OpenAI, enter a key in the password field or configure `OPENAI_API_KEY` before starting the backend. The UI never receives the key back from the server.

### Prompts

Select a writing mode to view its instructions. Each mode starts with the built-in prompt file from `writing_prompts/`. Turn on **Use a customized prompt** to edit it, then save settings. Customized prompt text is stored in `backend/local_data/agent_settings.json`; the original prompt files remain unchanged. Choose **Use the built-in prompt** to remove the override for that mode.

### Built-in tools

Enable or disable the word/character counter and character-limit checker. The count tools are deterministic: they count Unicode code points, including spaces and line breaks when reporting total characters. A character-limit check uses the limit supplied by the user; the tool does not guess current platform limits. Models must support tool calls to use these tools. Ollama's Gemma 3 models reject tool calls, so the app pauses the counting tools and Harness skills for those models and explains this on the settings page. Their saved selections remain in place for when you switch to a model that supports tools.

### Harness skills

Create a skill by entering a name, short description, and instruction text. The app saves it as a local `SKILL.md` package and selects it. Use **Edit** to change its name, description, or instructions. Check or uncheck a skill to include or exclude it from the agent's available Harness Skills on future requests. Delete removes that local skill and its selection.

Harness Skills load instruction text; this app does not execute scripts bundled with a skill. Treat skill instructions as trusted prompt content, since they can influence model behavior. Skills are written under `backend/local_data/skills/`.

## How a chat request works

1. Choose **New chat** and select blog post, Facebook, Instagram, or LinkedIn.
2. The backend selects either the saved prompt override or that mode's built-in prompt.
3. The backend constructs a Pydantic AI agent using the saved provider/model, enabled tools, and selected Harness Skills.
4. The browser sends conversation history to `POST /api/chat`; the backend returns the model reply to the chat UI.

The prompt files are mapped on the backend in `backend/prompts.py`. The browser sends a validated mode identifier, never a prompt file path.

## Local data and privacy

- Provider, model, enabled tools, enabled skills, and prompt overrides are stored in `backend/local_data/agent_settings.json`.
- User-authored skills are stored in `backend/local_data/skills/`.
- `backend/local_data/` is ignored by Git and is not included when you push the project. Back it up manually if you want to keep local settings and skills.
- Chat history remains in the browser's `localStorage`, not in a backend database. It is specific to that browser profile and computer.
- An API key entered in the settings screen is held in backend process memory only. It is not saved to the settings file. An environment-provided key remains available for the process started with that environment.
- Ollama generation runs on the local machine. OpenAI generation sends the relevant prompt and chat history to OpenAI and may be billable.

## Project layout

```text
repository-root/
|-- backend/
|   |-- main.py             # FastAPI routes and static UI hosting
|   |-- agent_runtime.py    # Pydantic AI provider/model and Harness setup
|   |-- prompts.py          # Mode-to-built-in-prompt mapping
|   |-- schemas.py          # Chat request and response validation
|   |-- settings_store.py   # Local config and custom skill storage
|   `-- requirements.txt
|-- front-end/
|   |-- index.html
|   |-- agent_settings.html
|   |-- agent_settings.js
|   |-- styles.css
|   `-- script.js
|-- writing_prompts/
|   |-- blog_post/
|   |-- facebook/
|   |-- instagram/
|   `-- linkedin/
`-- README.md
```

## Troubleshooting

### Python or Ollama is not recognized

Open a new terminal after installation. On Windows, try `py -3 --version` if `python --version` does not work. If Ollama is installed but unavailable in PowerShell, use the installer's repair/reinstall instructions from the [official Ollama Windows page](https://ollama.com/download/windows).

### The browser says the connection was refused

The FastAPI backend is not running or its terminal has closed. Start it again and keep its terminal open.

### The backend cannot connect to Ollama

Launch Ollama and run `ollama list`. Confirm the model selected in Agent settings is installed and the URL ends in `/v1`, such as `http://localhost:11434/v1`.

### OpenAI reports that a key is missing or the request failed

Confirm the OpenAI provider is selected, a model name is entered, and either a key was entered in settings for the current backend run or `OPENAI_API_KEY` was set before Uvicorn started. Check the backend terminal for provider diagnostics. API usage may be charged by OpenAI.

### The response is slow

The first local request may take longer while Ollama loads a model. This backend allows up to 180 seconds for a response. Check that the model fits available memory. A smaller Ollama model may respond faster.

### A built-in prompt cannot be loaded

Check that the `writing_prompts/` folder and the corresponding prompt file exist. Confirm the mapping in `backend/prompts.py` matches the mode and filename.
