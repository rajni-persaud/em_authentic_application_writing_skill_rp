// These mode identifiers are the API contract values. Keep them in sync with
// WritingMode in backend/schemas.py and the prompt mapping in backend/prompts.py.
const MODES = {
  blog_post: { label: 'Blog post', greeting: 'Your blog post chat is ready. What would you like the post to be about?' },
  facebook: { label: 'Facebook', greeting: 'Your Facebook chat is ready. What would you like to share?' },
  instagram: { label: 'Instagram', greeting: 'Your Instagram chat is ready. What would you like to share?' },
  linkedin: { label: 'LinkedIn', greeting: 'Your LinkedIn chat is ready. What would you like to communicate?' },
};

// Browser-only storage key and same-origin backend route.
const STORAGE_KEY = 'voice-first-writing-coach-chats-v1';
const CHAT_API_URL = '/api/chat';

// Cache the important page elements once so event handlers can update them.
const sidebar = document.querySelector('#sidebar');
const historyEl = document.querySelector('#chatHistory');
const welcome = document.querySelector('#welcome');
const messagesEl = document.querySelector('#messages');
const composerWrap = document.querySelector('#composerWrap');
const composerForm = document.querySelector('#composerForm');
const messageInput = document.querySelector('#messageInput');
const sendButton = document.querySelector('#sendButton');
const selectedModeEl = document.querySelector('#selectedMode');
const modal = document.querySelector('#modeModal');
const closeModalButton = document.querySelector('#closeModal');
const mobileScrim = document.querySelector('#mobileScrim');

// App state lives in this page. Chat content is also saved in localStorage so
// it survives a page refresh on this browser, but there is no server database.
let chats = readChats();
let activeChatId = null;
let returnFocusTo = null;
// A set supports an in-flight request per chat and lets the UI show its
// "Thinking…" state without adding that temporary text to the real history.
const sendingChatIds = new Set();

function readChats() {
  // localStorage can be empty, malformed, or unavailable (for example in
  // some private/file contexts). Fall back to an empty list in those cases.
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((chat) => chat && MODES[chat.mode] && Array.isArray(chat.messages)) : [];
  } catch {
    return [];
  }
}

function persistChats() {
  // Save only in this browser. The backend receives history with each request
  // but does not persist it between app/server runs.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    showNotice('This browser could not save chat history. You can keep using this page until it is closed.');
  }
}

function showNotice(message) {
  // Display short-lived notices for storage or network errors without
  // replacing the user's conversation.
  let notice = document.querySelector('.temporary-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.className = 'temporary-notice';
    notice.setAttribute('role', 'status');
    document.body.append(notice);
  }
  notice.textContent = message;
  window.clearTimeout(showNotice.timeoutId);
  showNotice.timeoutId = window.setTimeout(() => notice.remove(), 4200);
}

function makeId() {
  // Prefer the browser's UUID generator; use a timestamp/random fallback for
  // browsers that do not provide crypto.randomUUID().
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openModePicker(trigger) {
  // Remember the button that opened the modal so keyboard focus can return to
  // it after the user chooses a mode or closes the dialog.
  returnFocusTo = trigger || document.activeElement;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  closeModalButton.focus();
}

function closeModePicker() {
  if (modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove('modal-open');
  returnFocusTo?.focus?.();
}

function createChat(mode) {
  // A new chat starts with a local greeting. The model is not called until the
  // user submits their first message.
  const chat = {
    id: makeId(),
    mode,
    title: MODES[mode].label,
    createdAt: Date.now(),
    messages: [{ role: 'assistant', content: MODES[mode].greeting }],
  };
  chats.unshift(chat);
  activeChatId = chat.id;
  persistChats();
  render();
  closeModePicker();
  closeMobileSidebar();
  messageInput.focus();
}

function getActiveChat() {
  return chats.find((chat) => chat.id === activeChatId) || null;
}

function updateChatTitle(chat) {
  // Use the first user message as a compact sidebar title; this is display
  // text only and does not alter the message sent to the model.
  const firstUserMessage = chat.messages.find((message) => message.role === 'user');
  if (!firstUserMessage) return;
  const plain = firstUserMessage.content.replace(/\s+/g, ' ').trim();
  chat.title = plain.length > 30 ? `${plain.slice(0, 30).trimEnd()}…` : plain;
}

function appendMessage(role, content) {
  // Build message elements with textContent so text from the model/user is
  // displayed literally rather than interpreted as HTML.
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  if (role === 'assistant') {
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = 'v';
    row.append(avatar);
  }

  const text = document.createElement('div');
  text.className = 'message-content';
  text.textContent = content;
  row.append(text);
  messagesEl.append(row);
}

function renderMessages(chat) {
  // Redraw the active conversation from its saved message array. Thinking is
  // transient UI feedback, so it is rendered separately from chat.messages.
  messagesEl.replaceChildren();
  for (const message of chat.messages) appendMessage(message.role, message.content);

  if (sendingChatIds.has(chat.id)) appendMessage('assistant', 'Thinking…');
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderHistory() {
  // Recreate the sidebar buttons from current chat state. Each button switches
  // the active conversation without deleting or changing other chats.
  historyEl.replaceChildren();
  if (chats.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'Your new conversations will appear here.';
    historyEl.append(empty);
    return;
  }

  for (const chat of chats) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `history-item${chat.id === activeChatId ? ' active' : ''}`;
    button.title = `${MODES[chat.mode].label}: ${chat.title}`;
    button.setAttribute('aria-current', chat.id === activeChatId ? 'page' : 'false');
    const label = document.createElement('span');
    label.textContent = chat.title || MODES[chat.mode].label;
    button.append(label);
    button.addEventListener('click', () => {
      activeChatId = chat.id;
      render();
      closeMobileSidebar();
      messageInput.focus();
    });
    historyEl.append(button);
  }
}

function render() {
  // The welcome screen is shown when there is no selected chat; a selected chat
  // shows its transcript and composer instead.
  const chat = getActiveChat();
  const hasChat = Boolean(chat);
  welcome.hidden = hasChat;
  messagesEl.hidden = !hasChat;
  composerWrap.hidden = !hasChat;

  if (chat) {
    selectedModeEl.textContent = MODES[chat.mode].label;
    renderMessages(chat);
  } else {
    selectedModeEl.textContent = '';
    messagesEl.replaceChildren();
  }
  renderHistory();
}

async function sendMessage() {
  // Add the user's text locally, then send the selected mode and full history
  // to FastAPI. The backend loads the mode prompt and calls Ollama.
  const chat = getActiveChat();
  const content = messageInput.value.trim();
  if (!chat || !content || sendingChatIds.has(chat.id)) return;

  chat.messages.push({ role: 'user', content });
  updateChatTitle(chat);
  messageInput.value = '';
  resizeInput();
  updateSendButton();
  persistChats();
  sendingChatIds.add(chat.id);
  render();

  // Send only the fields accepted by ChatMessage; internal UI fields such as
  // chat title and creation time are not part of the model conversation.
  const requestMessages = chat.messages.map(({ role, content: messageContent }) => ({
    role,
    content: messageContent,
  }));

  try {
    // Same-origin POST avoids separate CORS configuration. The response is
    // JSON with a `reply` field, as defined by ChatResponse in the backend.
    const response = await fetch(CHAT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: chat.mode,
        chat_id: chat.id,
        messages: requestMessages,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || `The backend returned HTTP ${response.status}.`);
    }
    if (typeof data.reply !== 'string' || !data.reply.trim()) {
      throw new Error('The backend returned an empty reply.');
    }

    chat.chatId = data.chat_id || chat.id;
    chat.messages.push({ role: 'assistant', content: data.reply });
    persistChats();
  } catch (error) {
    // Keep the user's message visible if the backend or Ollama is unavailable.
    // The temporary notice explains why no assistant response was added.
    const message = error instanceof Error ? error.message : 'The chat request failed.';
    showNotice(`Could not get a reply: ${message}`);
  } finally {
    sendingChatIds.delete(chat.id);
    updateSendButton();
    render();
    if (activeChatId === chat.id) messageInput.focus();
  }
}

function updateSendButton() {
  // Prevent an empty submission and a second simultaneous request in the same
  // conversation. Sending in another chat remains possible.
  sendButton.disabled = messageInput.value.trim().length === 0 || sendingChatIds.has(activeChatId);
}

function resizeInput() {
  // Grow the textarea with typed content up to the CSS maximum height.
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 170)}px`;
}

function openMobileSidebar() {
  // On small screens the sidebar slides over the chat and a scrim closes it.
  sidebar.classList.add('open');
  mobileScrim.hidden = false;
}

function closeMobileSidebar() {
  sidebar.classList.remove('open');
  mobileScrim.hidden = true;
}

// Wire the page controls to their behaviors. Mode buttons pass their
// data-mode value (blog_post/facebook/instagram/linkedin) to createChat().
document.querySelector('#newChatButton').addEventListener('click', (event) => openModePicker(event.currentTarget));
document.querySelector('#welcomeStart').addEventListener('click', (event) => openModePicker(event.currentTarget));
document.querySelectorAll('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => createChat(button.dataset.mode));
});
closeModalButton.addEventListener('click', closeModePicker);
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModePicker();
});
document.addEventListener('keydown', (event) => {
  // Escape closes overlays; Tab is kept inside the mode-picker dialog so
  // keyboard users do not tab into the obscured page behind it.
  if (event.key === 'Escape') {
    closeModePicker();
    closeMobileSidebar();
  }
  if (event.key === 'Tab' && !modal.hidden) {
    const focusables = [...modal.querySelectorAll('button:not([disabled])')];
    const first = focusables[0];
    const last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
document.querySelector('#openSidebar').addEventListener('click', openMobileSidebar);
document.querySelector('#closeSidebar').addEventListener('click', closeMobileSidebar);
mobileScrim.addEventListener('click', closeMobileSidebar);
composerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage();
});
messageInput.addEventListener('input', () => {
  resizeInput();
  updateSendButton();
});
messageInput.addEventListener('keydown', (event) => {
  // Enter submits; Shift+Enter inserts a line break. Ignore IME composition
  // so typing with an input method does not accidentally submit mid-entry.
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendMessage();
  }
});

// Draw the initial welcome screen and any saved recent chats on page load.
render();
