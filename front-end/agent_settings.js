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
const capabilityWarning = document.querySelector('#capabilityWarning');
const saveSkillButton = document.querySelector('#saveSkillButton');
const cancelSkillEditButton = document.querySelector('#cancelSkillEdit');

let settingsData = null;
let settingsDraft = null;
let editingSkillId = null;

// Keep all feedback in the page's accessible status area, and distinguish
// validation/server errors visually without injecting server text as HTML.
function showStatus(message, isError = false) {
  settingsSaveStatus.textContent = message;
  settingsSaveStatus.classList.toggle('error', isError);
}

// Use one JSON request helper so every settings action gets the same response
// parsing and turns FastAPI's `detail` message into a useful page error.
async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status}).`);
  return data;
}

// Only show fields that apply to the selected provider; both providers share
// the model-name field, while Ollama and OpenAI have different connection data.
function updateProviderFields() {
  const isOpenAI = providerSelect.value === 'openai';
  openaiKeyFields.hidden = !isOpenAI;
  ollamaUrlField.hidden = isOpenAI;
  modelNameInput.placeholder = isOpenAI ? 'Enter an OpenAI model name' : 'Enter an Ollama model name';
}

// Preserve the current prompt editor in the unsaved draft before switching
// modes or submitting, so changing modes does not discard in-progress edits.
function stashPromptEditor() {
  if (!settingsDraft) return;
  const mode = promptModeSelect.value;
  if (useCustomPromptInput.checked) settingsDraft.prompt_overrides[mode] = promptEditor.value;
  else delete settingsDraft.prompt_overrides[mode];
}

// Show a custom override when one exists; otherwise display the server's
// built-in prompt as read-only reference text for the selected writing mode.
function showPromptEditor() {
  if (!settingsData || !settingsDraft) return;
  const mode = promptModeSelect.value;
  const override = settingsDraft.prompt_overrides[mode];
  useCustomPromptInput.checked = typeof override === 'string';
  promptEditor.value = override || settingsData.default_prompts[mode] || '';
  promptEditor.disabled = !useCustomPromptInput.checked;
}

// Build tool checkboxes from server-provided allowlisted tool metadata rather
// than trusting browser-defined tool names or descriptions.
function renderTools() {
  toolOptions.replaceChildren();
  for (const tool of settingsData.available_tools) {
    const label = document.createElement('label');
    label.className = 'settings-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = settingsDraft.enabled_tools.includes(tool.id);
    checkbox.disabled = !settingsData.tool_support.supported;
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

// Render the saved Harness skills, their enabled state, and edit/delete actions.
// The browser only sends selected skill IDs; skill instructions remain managed
// by the backend and are loaded from its local skills directory.
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
    checkbox.disabled = !settingsData.tool_support.supported;
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

// Populate the shared skill editor with a selected skill and switch its submit
// action into update mode while bringing the form into view.
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

// Return the skill form to create mode and erase values from the previous edit.
function clearSkillEditor() {
  editingSkillId = null;
  document.querySelector('#newSkillName').value = '';
  document.querySelector('#newSkillDescription').value = '';
  document.querySelector('#newSkillInstructions').value = '';
  saveSkillButton.textContent = 'Save skill';
  cancelSkillEditButton.hidden = true;
}

// Validate the required fields locally, then create or update the skill via
// the matching API route and refresh the displayed skill list.
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

// Delete the selected skill on the server, then remove it from the current
// settings draft so a deleted ID cannot be submitted as enabled.
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

// Send the current configuration as a single validated update. The API key is
// included only in this request, then immediately cleared from the password
// input because the backend keeps it in process memory rather than JSON config.
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
    settingsData.tool_support = result.tool_support;
    capabilityWarning.hidden = result.tool_support.supported;
    capabilityWarning.textContent = result.tool_support.notice;
    renderTools();
    renderSkills();
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

// Load backend settings and metadata, then create a separate editable draft.
// Keeping a draft lets users change controls without saving each interaction.
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
    capabilityWarning.hidden = settingsData.tool_support.supported;
    capabilityWarning.textContent = settingsData.tool_support.notice;
    showStatus('');
  } catch (error) {
    showStatus(`${error.message || 'Could not load settings.'} Check that the backend is running.`, true);
  }
}

// Form and control listeners update the local draft; only the main form submit
// persists provider, prompt, tool, and skill selections on the backend.
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
// Restore removes only the selected mode's override; saving later makes the
// backend use that mode's unchanged prompt file again.
document.querySelector('#restorePrompt').addEventListener('click', () => {
  delete settingsDraft.prompt_overrides[promptModeSelect.value];
  showPromptEditor();
  showStatus('Built-in prompt selected. Save settings to apply it.');
});

loadSettings();
