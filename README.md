# Local Writing Coach

A browser-based writing coach for four formats: blog posts, Facebook posts, Instagram posts, and LinkedIn posts. The app uses a small HTML/CSS/JavaScript front end, a Python FastAPI backend, and a locally running Ollama model. The mode-specific coaching instructions are stored as prompt files in `writing_prompts/`.

This guide explains how to clone the repository and run it on a new computer. The commands cover Windows PowerShell, macOS, and Linux; Windows instructions are listed first.

## What you need

- Git, to clone the repository.
- Python 3.11 or newer. Python 3.11 is the minimum because the backend uses `StrEnum`.
- Ollama, which runs the language model on your computer.
- Internet access for the initial software and model downloads. Once Ollama has downloaded the model, chat generation runs against the local Ollama service; this app does not require an OpenAI API key.
- Enough disk space and memory for the Ollama model you choose. The default `gemma3:4b` model is several gigabytes.

Get Python from [python.org](https://www.python.org/downloads/). Install Git from [git-scm.com](https://git-scm.com/downloads). Install Ollama from the [official Ollama download page](https://ollama.com/download).

## 1. Clone the repository

Open PowerShell, Terminal, or a shell. On the repository's Git hosting page, select **Code** (or the equivalent) and copy its HTTPS clone URL. Replace the placeholder below with that URL:

```text
git clone <repository-url>
cd <repository-folder>
```

For example, if the URL ends in `/writing-coach.git`, the folder will usually be `writing-coach`:

```text
git clone https://host.example/account/repository.git
cd repository
```

The example host and URL above are placeholders; use the actual clone URL for this project. Run the later commands from the repository root, the directory containing `README.md`, `backend/`, `front-end/`, and `writing_prompts/`.

## 2. Install and start Ollama

### Windows

1. Download and run the installer from [Ollama for Windows](https://ollama.com/download/windows).
2. Launch Ollama from the Start menu. Ollama runs a local service that the backend contacts at `http://localhost:11434`.
3. Open a **new** PowerShell window after installation so it sees any updated PATH settings.
4. Check that the command is available:

   ```powershell
   ollama --version
   ```

### macOS

1. Download and install Ollama from the [official download page](https://ollama.com/download/mac).
2. Open the Ollama app and leave it running while using the writing coach.
3. Open Terminal and check the command:

   ```bash
   ollama --version
   ```

### Linux

Follow the current instructions on [Ollama's Linux download page](https://ollama.com/download/linux). After installing, start the Ollama service as described there, then check:

```bash
ollama --version
```

### Download and check the default model

The backend defaults to the Ollama model named `gemma3:4b`. Download and run it once:

```text
ollama run gemma3:4b
```

The first run downloads the model and can take a while. When Ollama shows its interactive prompt, enter a simple question to make sure it responds. Type `/bye` to leave the model prompt. To confirm that Ollama has the model afterward, run:

```text
ollama list
```

Model details and available sizes are listed on the [Ollama Gemma 3 page](https://ollama.com/library/gemma3). If you choose another model, download it with `ollama pull <model-name>` and configure the backend to use that exact name as described under [Optional model configuration](#optional-model-configuration).

## 3. Create a Python virtual environment

The virtual environment keeps this app's Python packages separate from other Python projects on your computer. Create it from the repository root.

### Windows PowerShell

Check that Python is installed:

```powershell
python --version
```

The version must be 3.11 or newer. If `python` is not recognized, try the Windows Python launcher:

```powershell
py -3 --version
```

Create the environment and install the backend packages:

```powershell
python -m venv backend\.venv
& ".\backend\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\backend\.venv\Scripts\python.exe" -m pip install fastapi uvicorn pydantic httpx
```

If you used `py -3` to find Python, use it to create the environment instead:

```powershell
py -3 -m venv backend\.venv
```

The package install commands above use the environment's Python directly, so PowerShell activation is not required. You can activate it for the current terminal if you prefer:

```powershell
.\backend\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation because of its execution policy, skip activation and continue using the full `backend\.venv\Scripts\python.exe` path shown above. Do not change your computer's execution policy just for this app.

### macOS and Linux

Check for Python 3.11 or newer:

```bash
python3 --version
```

Create and activate the virtual environment, then install the packages:

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install --upgrade pip
python -m pip install fastapi uvicorn pydantic httpx
```

If `python3 -m venv` reports that the `venv` module is unavailable, install the Python virtual-environment package provided by your operating system and repeat these commands.

## 4. (Optional) Choose a different Ollama model

If you downloaded a model other than `gemma3:4b`, set `OLLAMA_MODEL` to its exact Ollama name before starting the backend.

Windows PowerShell, for the current terminal only:

```powershell
$env:OLLAMA_MODEL = "<model-name>"
```

macOS/Linux, for the current terminal only:

```bash
export OLLAMA_MODEL="<model-name>"
```

The default Ollama address is `http://localhost:11434`, so most local installs need no URL setting. If your Ollama service uses a different address, set `OLLAMA_BASE_URL` in the same terminal before starting the backend:

```powershell
$env:OLLAMA_BASE_URL = "http://localhost:11434"
```

```bash
export OLLAMA_BASE_URL="http://localhost:11434"
```

These variables apply only to the terminal session where they are set. Set them again in a new terminal if needed.

## 5. Start the writing coach

Make sure Ollama is running, then open a terminal at the repository root. Start the backend with the virtual environment's Python.

### Windows PowerShell

```powershell
& ".\backend\.venv\Scripts\python.exe" -m uvicorn backend.main:app --reload
```

### macOS and Linux

If the environment is activated:

```bash
python -m uvicorn backend.main:app --reload
```

Or use its Python executable directly, without activating:

```bash
./backend/.venv/bin/python -m uvicorn backend.main:app --reload
```

Keep this terminal open while using the app. Uvicorn prints a local address when the server is ready. Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser. The API's interactive documentation is at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs), and its basic health check is at [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health).

To stop the backend, return to its terminal and press **Ctrl+C**. Ollama is a separate app or service; leave it running if you plan to use the coach again.

## 6. Start a writing conversation

1. In the app, select the **plus** button to create a chat.
2. Choose **Blog post**, **Facebook**, **Instagram**, or **LinkedIn**.
3. The browser sends the selected mode and an empty conversation to the backend. The backend loads that mode's prompt from `writing_prompts/` and asks Ollama for the prompt-guided opening response.
4. Continue the conversation in the chat box. The app sends the selected mode and conversation history with each message so the model can respond in context.

The backend keeps the prompt-file mapping on the server. The browser sends a mode name, not a file path. The four prompt files are:

| Mode | Prompt file |
| --- | --- |
| Blog post | `writing_prompts/blog_post/Blog_Post_Writing_Coach_Prompt.txt` |
| Facebook | `writing_prompts/facebook/Facebook_Writing_Coach_Prompt.txt` |
| Instagram | `writing_prompts/instagram/Instagram_Writing_Coach_Prompt.txt` |
| LinkedIn | `writing_prompts/linkedin/LinkedIn_Event_Reflection_Coach_Prompt.txt` |

## Where chat history is kept

The front end saves chats in the browser's `localStorage` on that device and browser. It does not use a server-side database. A saved chat can remain after closing and reopening the browser, but it is not automatically shared with another browser, profile, or computer. Clearing the browser's site data can remove the saved chats. When you send a message, the front end sends the conversation history to the local backend, which forwards it to the local Ollama service for that response.

## Troubleshooting

### `python` or `ollama` is not recognized

- Open a new terminal after installing the program and try again.
- On Windows, try `py -3 --version` if `python --version` does not work.
- If Ollama is installed but its command is not on PATH, launch the Ollama app and follow the installer's repair/reinstall steps from the [official Windows download page](https://ollama.com/download/windows). Avoid downloading runtime files from unofficial sites.

### The browser says it cannot connect or `127.0.0.1` refused to connect

The FastAPI server is not running or the terminal running it has closed. Start it again using the command in [Start the writing coach](#5-start-the-writing-coach), then reload the page.

### The app says it cannot connect to Ollama

Launch Ollama and check that its command works. In a terminal, run `ollama list`. If the command responds but the model is not listed, download it with `ollama pull gemma3:4b` (or the model name configured in `OLLAMA_MODEL`). Check that the backend's `OLLAMA_BASE_URL` matches the Ollama service address.

### The app stays on "Thinking" or the first response is slow

The first request may take longer while Ollama loads the model into memory. The backend allows up to 180 seconds for a model response. Check that the computer has enough available memory and that Ollama is still running. If the model repeatedly takes longer than the timeout, try a smaller Ollama model and set `OLLAMA_MODEL` to its name.

### A prompt cannot be loaded

Check that the repository was cloned with the `writing_prompts/` folder and that the relevant file in the table above exists with the same spelling. The backend mapping in `backend/prompts.py` must match the selected mode and file location.

## Project layout

```text
repository-root/
|-- backend/
|   |-- main.py          # FastAPI app, Ollama call, and static front-end hosting
|   |-- prompts.py       # Allowlisted mapping from mode to prompt file
|   `-- schemas.py       # Pydantic request/response validation
|-- front-end/
|   |-- index.html
|   |-- styles.css
|   `-- script.js
|-- writing_prompts/
|   |-- blog_post/
|   |-- facebook/
|   |-- instagram/
|   `-- linkedin/
`-- README.md
```

The Python virtual environment is created locally at `backend/.venv/`; it is not needed in the clone itself and should not be copied between computers.

## How the local pieces connect

```text
Browser (HTML/CSS/JavaScript)
        |  POST /api/chat: mode + conversation messages
        v
FastAPI backend (Python)
        |  loads the selected server-side prompt and calls Ollama
        v
Ollama local service (default model: gemma3:4b)
        |  returns a reply
        v
FastAPI backend -> browser chat
```

The app serves the front end and API from the same local server, so the browser can call `/api/chat` without separate cross-origin configuration. The default setup does not use an OpenAI API key or send requests to the OpenAI API. Ollama needs internet access to download the application and model; after download, this app sends generation requests to the Ollama service on your own computer.
