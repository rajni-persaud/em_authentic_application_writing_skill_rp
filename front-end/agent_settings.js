// The settings page talks directly to the local FastAPI settings endpoints.
// Secrets are never placed in localStorage; the API key field is sent once to
// the backend and cleared as soon as the save request succeeds.
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
const toolOptions = document.querySelector('#toolOptions');
const skillOptions = document.querySelector('#skillOptions');
const settingsSaveStatus = document.querySelector('#settingsSaveStatus');
const saveSkillButton = document.querySelector('#saveSkillButton');
const cancelSkillEditButton = document.querySelector('#cancelSkillEdit');

let settingsData = null;
let settingsDraft = null;
let editingSkillId = null;

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
  modelNameInput.placeholder = isOpenAI ? 'Enter an OpenAI model name' : 'Enter an Ollama model name';
}

function stashPromptEditor() {
  if (!settingsDraft) return;
  const mode = promptModeSelect.value;
  if (useCustomPromptInput.checked) settingsDraft.prompt_overrides[mode] = promptEditor.value;
  else delete settingsDraft.prompt_overrides[mode];
}

function showPromptEditor() {
  if (!settingsData || !settingsDraft) return;
  const mode = promptModeSelect.value;
  const override = settingsDraft.prompt_overrides[mode];
  useCustomPromptInput.checked = typeof override === 'string';
  promptEditor.value = override || settingsData.default_prompts[mode] || '';
  promptEditor.disabled = !useCustomPromptInput.checked;
}

function renderTools() {
  toolOptions.replaceChildren();
  for (const tool of settingsData.available_tools) {
    const label = document.createElement('label');
    label.className = 'settings-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = settingsDraft.enabled_tools.includes(tool.id);
    checkbox.addEventListener('change', () => {
      settingsDraft.enabled_tools = checkbox.checked
        ? [...new Set([...settingsDraft.enabled_tools, tool.id])]
        : settingsDraft.enabled_tools.filter((id) => id !== tool.id);
    });
    const copy = document.createElement('span');
    copy.className = 'settings-option-copy';
    const title = document.createElement('strong');
    title.textContent = tool.label;
    const description = document.createElement('small');
    description.textContent = tool.description;
    copy.append(title, description);
    label.append(checkbox, copy);
    toolOptions.append(label);
  }
}

function renderSkills() {
  skillOptions.replaceChildren();
  if (settingsData.skills.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'settings-help';
    empty.textContent = 'No custom skills yet. Create one below to add focused instructions.';
    skillOptions.append(empty);
    return;
  }

  for (const skill of settingsData.skills) {
    const row = document.createElement('div');
    row.className = 'settings-option skill-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', `Enable ${skill.name}`);
    checkbox.checked = settingsDraft.enabled_skills.includes(skill.id);
    checkbox.addEventListener('change', () => {
      settingsDraft.enabled_skills = checkbox.checked
        ? [...new Set([...settingsDraft.enabled_skills, skill.id])]
        : settingsDraft.enabled_skills.filter((id) => id !== skill.id);
    });

    const copy = document.createElement('span');
    copy.className = 'settings-option-copy';
    const title = document.createElement('strong');
    title.textContent = skill.name;
    const description = document.createElement('small');
    description.textContent = skill.description;
    copy.append(title, description);

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'edit-skill-button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => beginSkillEdit(skill));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-skill-button';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => deleteSkill(skill));
    row.append(checkbox, copy, edit, remove);
    skillOptions.append(row);
  }
}

function beginSkillEdit(skill) {
  editingSkillId = skill.id;
  document.querySelector('#newSkillName').value = skill.name;
  document.querySelector('#newSkillDescription').value = skill.description;
  document.querySelector('#newSkillInstructions').value = skill.instructions;
  saveSkillButton.textContent = 'Update skill';
  cancelSkillEditButton.hidden = false;
  document.querySelector('.skill-create').open = true;
  document.querySelector('#newSkillName').focus();
  showStatus(`Editing ${skill.name}.`);
}

function clearSkillEditor() {
  editingSkillId = null;
  document.querySelector('#newSkillName').value = '';
  document.querySelector('#newSkillDescription').value = '';
  document.querySelector('#newSkillInstructions').value = '';
  saveSkillButton.textContent = 'Save skill';
  cancelSkillEditButton.hidden = true;
}

async function saveSkill() {
  const definition = {
    name: document.querySelector('#newSkillName').value.trim(),
    description: document.querySelector('#newSkillDescription').value.trim(),
    instructions: document.querySelector('#newSkillInstructions').value.trim(),
  };
  if (!definition.name || !definition.description || !definition.instructions) {
    showStatus('Enter a skill name, description, and instructions first.', true);
    return;
  }

  const wasEditing = Boolean(editingSkillId);
  const url = wasEditing ? `/api/skills/${encodeURIComponent(editingSkillId)}` : '/api/skills';
  try {
    const skill = await requestJson(url, {
      method: wasEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(definition),
    });
    if (wasEditing) {
      settingsData.skills = settingsData.skills.map((item) => item.id === skill.id ? skill : item);
    } else {
      settingsData.skills.push(skill);
      settingsDraft.enabled_skills = [...new Set([...settingsDraft.enabled_skills, skill.id])];
    }
    clearSkillEditor();
    renderSkills();
    showStatus(wasEditing
      ? 'Skill updated. Enabled skills use the updated instructions on future replies.'
      : 'Skill saved and selected. Save settings to enable it for the agent.');
  } catch (error) {
    showStatus(error.message || 'Could not save the skill.', true);
  }
}

async function deleteSkill(skill) {
  try {
    await requestJson(`/api/skills/${encodeURIComponent(skill.id)}`, { method: 'DELETE' });
    settingsData.skills = settingsData.skills.filter((item) => item.id !== skill.id);
    settingsDraft.enabled_skills = settingsDraft.enabled_skills.filter((id) => id !== skill.id);
    if (editingSkillId === skill.id) clearSkillEditor();
    renderSkills();
    showStatus('Skill deleted.');
  } catch (error) {
    showStatus(error.message || 'Could not delete the skill.', true);
  }
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
    openaiKeyStatus.textContent = settingsData.openai_api_key_configured
      ? 'An API key is available to this backend process. Enter a new key to replace it.'
      : 'No key is configured. Enter one here for this run, or set OPENAI_API_KEY before starting the backend.';
    updateProviderFields();
    showPromptEditor();
    renderTools();
    renderSkills();
    showStatus('');
  } catch (error) {
    showStatus(`${error.message || 'Could not load settings.'} Check that the backend is running.`, true);
  }
}

settingsForm.addEventListener('submit', saveSettings);
saveSkillButton.addEventListener('click', saveSkill);
cancelSkillEditButton.addEventListener('click', clearSkillEditor);
providerSelect.addEventListener('change', () => {
  if (settingsDraft && providerSelect.value !== settingsDraft.provider) {
    // Model identifiers belong to a provider; don't submit the previous one
    // accidentally after changing between local Ollama and hosted OpenAI.
    modelNameInput.value = '';
    showStatus('Enter a model name for the selected provider.');
  }
  updateProviderFields();
});
promptModeSelect.addEventListener('change', () => {
  stashPromptEditor();
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
