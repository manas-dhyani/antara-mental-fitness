const state = {
  apiBase: localStorage.getItem('antara_api_base') || 'http://localhost:8000',
  token: localStorage.getItem('antara_token') || '',
  sessionId: localStorage.getItem('antara_session_id') || '',
  journalEntries: [],
  chatMessages: []
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const apiBaseInput = $('#apiBase');
const apiStatus = $('#apiStatus');
const userStatus = $('#userStatus');
const tokenState = $('#tokenState');
const journalCount = $('#journalCount');
const sessionState = $('#sessionState');
const insightState = $('#insightState');
const chatSession = $('#chatSession');
const chatThread = $('#chatThread');
const journalList = $('#journalList');
const insightOutput = $('#insightOutput');
const toast = $('#toast');

apiBaseInput.value = state.apiBase;
updateStatus();
showView('dashboard');

apiBaseInput.addEventListener('change', () => {
  state.apiBase = apiBaseInput.value.trim().replace(/\/$/, '') || 'http://localhost:8000';
  localStorage.setItem('antara_api_base', state.apiBase);
  toastMsg(`API set to ${state.apiBase}`);
  updateStatus();
});

$$('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  showView(btn.dataset.view);
}));

$$('[data-jump]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.jump)));

document.querySelector('#logoutBtn').addEventListener('click', () => {
  state.token = '';
  state.sessionId = '';
  localStorage.removeItem('antara_token');
  localStorage.removeItem('antara_session_id');
  updateStatus();
  toastMsg('Logged out');
});

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const body = new URLSearchParams();
  body.set('username', form.get('username'));
  body.set('password', form.get('password'));
  try {
    const res = await fetch(`${state.apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Login failed');
    state.token = data.access_token;
    localStorage.setItem('antara_token', state.token);
    updateStatus();
    toastMsg('Login successful');
  } catch (err) {
    toastMsg(err.message, true);
  }
});

$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = Object.fromEntries(new FormData(e.target).entries());
  try {
    const res = await fetch(`${state.apiBase}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Registration failed');
    toastMsg('Account created. Log in now.');
    e.target.reset();
  } catch (err) {
    toastMsg(err.message, true);
  }
});

$('#journalForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const tags = (form.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean);
  const payload = {
    title: form.get('title'),
    content: form.get('content'),
    mood_score: Number(form.get('mood_score')),
    tags
  };
  try {
    const res = await apiFetch('/journal/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to save journal');
    e.target.reset();
    toastMsg('Journal saved');
    await loadJournal();
  } catch (err) {
    toastMsg(err.message, true);
  }
});

$('#refreshJournal').addEventListener('click', loadJournal);
$('#loadInsights').addEventListener('click', loadInsights);

$('#chatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.token) {
    toastMsg('Log in before sending a chat message.', true);
    return;
  }
  const input = e.target.message;
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  appendChat('user', message);
  try {
    const res = await apiFetch('/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, session_id: state.sessionId || null })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Chat failed');
    state.sessionId = data.session_id;
    localStorage.setItem('antara_session_id', state.sessionId);
    appendChat('ai', data.response || 'No response received');
    updateStatus();
  } catch (err) {
    toastMsg(err.message, true);
  }
});

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`);
  return fetch(`${state.apiBase}${path}`, { ...options, headers });
}

function showView(id) {
  $$('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function updateStatus() {
  apiStatus.textContent = state.apiBase;
  tokenState.textContent = state.token ? 'Stored' : 'Absent';
  userStatus.textContent = state.token ? 'Signed in' : 'Signed out';
  sessionState.textContent = state.sessionId ? 'Active' : 'New';
  chatSession.textContent = state.sessionId ? state.sessionId.slice(0, 8) + '…' : 'No session yet';
}

async function loadJournal() {
  if (!state.token) {
    journalList.innerHTML = '<div class="meta">Log in to view your journal entries.</div>';
    journalCount.textContent = '0';
    return;
  }
  try {
    const res = await apiFetch('/journal/');
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Could not load journal entries');
    state.journalEntries = data;
    journalCount.textContent = data.length;
    journalList.innerHTML = data.length ? '' : '<div class="meta">No entries yet.</div>';
    data.forEach(entry => {
      const el = document.createElement('div');
      el.className = 'entry';
      el.innerHTML = `
        <strong>${escapeHtml(entry.title || 'Untitled')}</strong>
        <div class="meta">Mood: ${entry.mood_score ?? '—'} • ${formatDate(entry.created_at)}</div>
        <p>${escapeHtml(entry.content || '')}</p>
        <small>${(entry.tags || []).map(escapeHtml).join(', ') || 'No tags'}</small>
      `;
      journalList.appendChild(el);
    });
  } catch (err) {
    journalList.innerHTML = `<div class="entry" style="border-color: rgba(255,107,107,0.35)">${escapeHtml(err.message)}</div>`;
  }
}

async function loadInsights() {
  if (!state.token) {
    insightOutput.innerHTML = '<div class="meta">Log in to generate insights.</div>';
    insightState.textContent = 'Idle';
    return;
  }
  insightState.textContent = 'Loading…';
  insightOutput.innerHTML = '<div class="meta">Generating weekly insights…</div>';
  try {
    const res = await apiFetch('/insights/weekly');
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Could not load insights');
    insightState.textContent = 'Ready';
    const patterns = Array.isArray(data.patterns) ? data.patterns : [];
    const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
    insightOutput.innerHTML = `
      <div class="insight-box"><strong>Summary</strong><p>${escapeHtml(data.summary || '')}</p></div>
      <div class="insight-box"><strong>Patterns</strong><p>${patterns.map(escapeHtml).join('<br>') || 'No patterns returned.'}</p></div>
      <div class="insight-box"><strong>Suggestions</strong><p>${suggestions.map(escapeHtml).join('<br>') || 'No suggestions returned.'}</p></div>
      <div class="insight-box"><strong>Affirmation</strong><p>${escapeHtml(data.affirmation || '')}</p></div>
    `;
  } catch (err) {
    insightState.textContent = 'Error';
    insightOutput.innerHTML = `<div class="entry" style="border-color: rgba(255,107,107,0.35)">${escapeHtml(err.message)}</div>`;
  }
}

function appendChat(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;
  bubble.innerHTML = `<small>${role === 'user' ? 'You' : 'Antara'}</small><div>${escapeHtml(text)}</div>`;
  chatThread.appendChild(bubble);
  chatThread.scrollTop = chatThread.scrollHeight;
}

function toastMsg(msg, isError = false) {
  toast.textContent = msg;
  toast.style.borderColor = isError ? 'rgba(255,107,107,0.45)' : 'rgba(124,140,255,0.45)';
  toast.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.add('hidden'), 2600);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value) {
  if (!value) return 'Unknown time';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

// Initial load helpers
updateStatus();
loadJournal();
