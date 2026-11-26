// Settings page for provider, model, and writing-prompt configuration.
// OpenAI credentials are sent to the backend once and are never stored in this page.
const settingsForm = document.querySelector('#settingsForm');
const providerSelect = document.querySelector('#providerSelect');
const modelNameInput = document.querySelector('#modelName');
const ollamaUrlField = document.querySelector('#ollamaUrlField');
const ollamaBaseUrlInput = document.querySelector('#ollamaBaseUrl');
const openaiKeyFields = document.querySelector('#openaiKeyFields');
const openaiApiKeyInput = document.querySelector('#openaiApiKey');
const forgetOpenaiKeyInput = document.querySelector('#forgetOpenaiKey');
const openaiKeyStatus = document.querySelector('#openaiKeyStatus');
const promptModeSelect = document.querySelector('#promptMode');
const useCustomPromptInput = document.querySelector('#useCustomPrompt');
const promptEditor = document.querySelector('#promptEditor');
const settingsSaveStatus = document.querySelector('#settingsSaveStatus');

let settingsData = null;
let settingsDraft = null;

const PROMPT_MODE_STORAGE_KEY = 'writingCoachSelectedPromptMode';

function showStatus(message, isError = false) {
  settingsSaveStatus.textContent = message;
  settingsSaveStatus.classList.toggle('error', isError);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status}).`);
  return data;
}

function updateProviderFields() {
  const isOpenAI = providerSelect.value === 'openai';
  openaiKeyFields.hidden = !isOpenAI;
  ollamaUrlField.hidden = isOpenAI;
}

function stashPromptEditor() {
  if (!settingsDraft) return;
  const mode = promptModeSelect.value;
  if (useCustomPromptInput.checked) {
    settingsDraft.prompt_overrides[mode] = promptEditor.value;
  } else {
    delete settingsDraft.prompt_overrides[mode];
  }
}

function showPromptEditor() {
  if (!settingsDraft || !settingsData) return;
  const mode = promptModeSelect.value;
  const override = settingsDraft.prompt_overrides[mode];
  useCustomPromptInput.checked = Boolean(override);
  promptEditor.value = override || settingsData.default_prompts[mode] || '';
  promptEditor.disabled = !override;
}

async function saveSettings(event) {
  event.preventDefault();
  stashPromptEditor();
  showStatus('Saving...');
  const payload = {
    ...settingsDraft,
    openai_api_key: openaiApiKeyInput.value.trim() || null,
    forget_openai_api_key: forgetOpenaiKeyInput.checked,
  };

  try {
    const result = await requestJson('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    settingsDraft = result.settings;
    settingsData.settings = result.settings;
    settingsData.openai_api_key_configured = result.openai_api_key_configured;
    openaiApiKeyInput.value = '';
    forgetOpenaiKeyInput.checked = false;
    openaiKeyStatus.textContent = result.openai_api_key_configured
      ? 'An API key is available to this backend process. Enter a new key to replace it.'
      : 'No key is configured. Enter one here for this run, or set OPENAI_API_KEY before starting the backend.';
    showStatus('Settings saved on this computer. New replies will use these settings.');
  } catch (error) {
    showStatus(error.message || 'Could not save settings.', true);
  }
}

async function loadSettings() {
  try {
    settingsData = await requestJson('/api/settings');
    settingsDraft = structuredClone(settingsData.settings);

    providerSelect.value = settingsDraft.provider;
    modelNameInput.value = settingsDraft.model;
    ollamaBaseUrlInput.value = settingsDraft.ollama_base_url;

    // Restore the last selected writing mode.
    const savedMode = localStorage.getItem(PROMPT_MODE_STORAGE_KEY);
    const availableModes = Array.from(promptModeSelect.options)
      .map(option => option.value);

    if (savedMode && availableModes.includes(savedMode)) {
      promptModeSelect.value = savedMode;
    } else {
      // If no mode was previously selected, open a mode
      // that already has a custom prompt, if one exists.
      const customModes = Object.keys(settingsDraft.prompt_overrides || {});
      const firstCustomMode = customModes.find(mode =>
        availableModes.includes(mode)
      );

      if (firstCustomMode) {
        promptModeSelect.value = firstCustomMode;
      }
    }

    openaiKeyStatus.textContent = settingsData.openai_api_key_configured
      ? 'An API key is available to this backend process. Enter a new key to replace it.'
      : 'No key is configured. Enter one here for this run, or set OPENAI_API_KEY before starting the backend.';

    updateProviderFields();
    showPromptEditor();
    showStatus('');

  } catch (error) {
    showStatus(
      `${error.message || 'Could not load settings.'} Check that the backend is running.`,
      true
    );
  }
}

settingsForm.addEventListener('submit', saveSettings);
providerSelect.addEventListener('change', () => {
  if (settingsDraft && providerSelect.value !== settingsDraft.provider) {
    modelNameInput.value = '';
    showStatus('Enter a model name for the selected provider.');
  }
  updateProviderFields();
});
promptModeSelect.addEventListener('change', () => {
  stashPromptEditor();

  localStorage.setItem(
    PROMPT_MODE_STORAGE_KEY,
    promptModeSelect.value
  );

  showPromptEditor();
});
useCustomPromptInput.addEventListener('change', () => {
  const mode = promptModeSelect.value;
  if (useCustomPromptInput.checked) {
    promptEditor.disabled = false;
    if (!settingsDraft.prompt_overrides[mode]) {
      promptEditor.value = settingsData.default_prompts[mode] || '';
    }
  } else {
    delete settingsDraft.prompt_overrides[mode];
    promptEditor.value = settingsData.default_prompts[mode] || '';
    promptEditor.disabled = true;
  }
});
promptEditor.addEventListener('input', stashPromptEditor);
document.querySelector('#restorePrompt').addEventListener('click', () => {
  delete settingsDraft.prompt_overrides[promptModeSelect.value];
  showPromptEditor();
  showStatus('Built-in prompt selected. Save settings to apply it.');
});

loadSettings();
