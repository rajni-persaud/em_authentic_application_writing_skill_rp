const MODES = {
  blog_post: { label: 'Blog post', greeting: 'Your blog post chat is ready. What would you like the post to be about?' },
  facebook: { label: 'Facebook', greeting: 'Your Facebook chat is ready. What would you like to share?' },
  instagram: { label: 'Instagram', greeting: 'Your Instagram chat is ready. What would you like to share?' },
  linkedin: { label: 'LinkedIn', greeting: 'Your LinkedIn chat is ready. What would you like to communicate?' },
};

const STORAGE_KEY = 'voice-first-writing-coach-chats-v1';
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

let chats = readChats();
let activeChatId = null;
let returnFocusTo = null;

function readChats() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((chat) => chat && MODES[chat.mode] && Array.isArray(chat.messages)) : [];
  } catch {
    return [];
  }
}

function persistChats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    showNotice('This browser could not save chat history. You can keep using this page until it is closed.');
  }
}

function showNotice(message) {
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
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openModePicker(trigger) {
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
  const firstUserMessage = chat.messages.find((message) => message.role === 'user');
  if (!firstUserMessage) return;
  const plain = firstUserMessage.content.replace(/\s+/g, ' ').trim();
  chat.title = plain.length > 30 ? `${plain.slice(0, 30).trimEnd()}…` : plain;
}

function appendMessage(role, content) {
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
  messagesEl.replaceChildren();
  for (const message of chat.messages) appendMessage(message.role, message.content);

  const note = document.createElement('div');
  note.className = 'preview-message';
  const icon = document.createElement('span');
  icon.className = 'note-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '✳';
  const copy = document.createElement('span');
  copy.textContent = 'Front-end preview only. Your message is shown here, but no AI reply is generated yet. The backend will connect this chat to Ollama and the selected writing prompt.';
  note.append(icon, copy);
  messagesEl.append(note);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderHistory() {
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

function sendMessage() {
  const chat = getActiveChat();
  const content = messageInput.value.trim();
  if (!chat || !content) return;

  chat.messages.push({ role: 'user', content });
  updateChatTitle(chat);
  messageInput.value = '';
  resizeInput();
  updateSendButton();
  persistChats();
  render();
  messageInput.focus();
}

function updateSendButton() {
  sendButton.disabled = messageInput.value.trim().length === 0;
}

function resizeInput() {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 170)}px`;
}

function openMobileSidebar() {
  sidebar.classList.add('open');
  mobileScrim.hidden = false;
}

function closeMobileSidebar() {
  sidebar.classList.remove('open');
  mobileScrim.hidden = true;
}

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
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendMessage();
  }
});

render();
