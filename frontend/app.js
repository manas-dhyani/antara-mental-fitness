const state = {
  apiBase: localStorage.getItem('antara_api_base') || 'http://localhost:8000',
  token: localStorage.getItem('antara_token') || '',
  sessionId: localStorage.getItem('antara_session_id') || '',
  journalEntries: [],
  chatMessages: [],
  onboarding: loadJson('antara_onboarding_v1', null),
  dismissedTips: loadJson('antara_dismissed_tips_v1', {}),
  tipTriggers: {
    hasJournals3: false,
    insightsSparse: false
  }
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const apiBaseInput = $('#apiBase');
const apiStatus = $('#apiStatus');
const userStatus = $('#userStatus');
const tokenState = $('#tokenState');
const journalCount = $('#journalCount');
const sessionState = $('#sessionState');
const insightState = $('#insightState');
const journalStreak = $('#journalStreak');
const breathingStreak = $('#breathingStreak');
const chatSession = $('#chatSession');
const chatThread = $('#chatThread');
const journalList = $('#journalList');
const insightOutput = $('#insightOutput');
const toast = $('#toast');
const tipDock = $('#tipDock');

const chatForm = $('#chatForm');
const chatInput = $('#chatForm input[name="message"]');
const micBtn = $('#micBtn');

const onboardingModal = $('#onboardingModal');
const onboardingForm = $('#onboardingForm');
const onboardingClose = $('#onboardingClose');
const onboardingSkip = $('#onboardingSkip');

const breathingStatus = $('#breathingStatus');
const breathingPreset = $('#breathingPreset');
const breathingStart = $('#breathingStart');
const breathingPause = $('#breathingPause');
const breathingReset = $('#breathingReset');
const breathingSteps = $('#breathingSteps');
const breathingCue = $('#breathingCue');
const breathingTimer = $('#breathingTimer');
const breathingOrb = $('#breathingOrb');

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
    bumpStreak('journal');
    updateStatus();
    await loadJournal();
  } catch (err) {
    toastMsg(err.message, true);
  }
});

$('#refreshJournal').addEventListener('click', loadJournal);
$('#loadInsights').addEventListener('click', loadInsights);

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.token) {
    toastMsg('Log in before sending a chat message.', true);
    return;
  }
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = '';
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

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

// --- Voice recording / transcription ---
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

micBtn?.addEventListener('click', async () => {
  if (!state.token) {
    toastMsg('Log in before using voice input.', true);
    return;
  }
  if (isRecording) {
    stopRecording();
    return;
  }
  await startRecording();
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    });
    mediaRecorder.addEventListener('stop', async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(recordedChunks, { type: recordedChunks[0]?.type || 'audio/webm' });
      recordedChunks = [];
      if (blob.size < 256) return;
      await transcribeAudio(blob);
    });
    mediaRecorder.start();
    isRecording = true;
    micBtn.classList.add('active-rec');
    micBtn.textContent = '⏹️';
    toastMsg('Recording… click again to stop.');
  } catch (err) {
    toastMsg(err.message || 'Microphone permission denied', true);
  }
}

function stopRecording() {
  try {
    mediaRecorder?.stop();
  } catch {
    // ignore
  } finally {
    isRecording = false;
    micBtn.classList.remove('active-rec');
    micBtn.textContent = '🎙️';
  }
}

async function transcribeAudio(blob) {
  try {
    toastMsg('Transcribing…');
    const fd = new FormData();
    const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('wav') ? 'wav' : 'webm';
    fd.append('file', blob, `voice.${ext}`);
    const res = await apiFetch('/voice/transcribe', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Transcription failed');
    if (data.text) {
      chatInput.value = String(data.text).trim();
      chatInput.focus();
      toastMsg('Transcription ready (filled input).');
    } else {
      toastMsg('No speech detected.', true);
    }
  } catch (err) {
    toastMsg(err.message, true);
  }
}

// Keyboard shortcut: M toggles mic (when in Chat)
document.addEventListener('keydown', (e) => {
  if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'm' || e.key === 'M') {
    const chatView = document.getElementById('chat');
    if (chatView?.classList.contains('active')) micBtn?.click();
  }
});

// Idle nudge in Chat
let chatIdleTimeout = null;
function resetChatIdleNudge() {
  clearTimeout(chatIdleTimeout);
  const chatView = document.getElementById('chat');
  if (!chatView?.classList.contains('active')) return;
  chatIdleTimeout = setTimeout(() => {
    if (state.dismissedTips['idle-breathing-tip']) return;
    addTip({
      id: 'idle-breathing-tip',
      title: 'Need a quick reset?',
      message: 'Try the Breathing view for a 2-minute guided pattern.',
      actions: [
        { label: 'Open breathing', primary: true, onClick: () => showView('breathing') },
        { label: 'Dismiss', onClick: () => dismissTip('idle-breathing-tip') }
      ]
    });
  }, 45000);
}

['keydown', 'mousedown', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, () => resetChatIdleNudge(), { passive: true });
});

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`);
  return fetch(`${state.apiBase}${path}`, { ...options, headers });
}

function showView(id) {
  $$('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  onViewShown(id);
}

function updateStatus() {
  apiStatus.textContent = state.apiBase;
  tokenState.textContent = state.token ? 'Stored' : 'Absent';
  userStatus.textContent = state.token ? 'Signed in' : 'Signed out';
  sessionState.textContent = state.sessionId ? 'Active' : 'New';
  chatSession.textContent = state.sessionId ? state.sessionId.slice(0, 8) + '…' : 'No session yet';
  const j = loadJson('antara_journal_streak_v1', { count: 0 });
  const b = loadJson('antara_breathing_streak_v1', { count: 0 });
  if (journalStreak) journalStreak.textContent = String(j.count || 0);
  if (breathingStreak) breathingStreak.textContent = String(b.count || 0);
}

// --- Tips / onboarding (frontend-only) ---
function dismissTip(id) {
  state.dismissedTips[id] = true;
  saveJson('antara_dismissed_tips_v1', state.dismissedTips);
  renderTips();
}

function addTip({ id, title, message, actions = [] }) {
  if (state.dismissedTips[id]) return;
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.innerHTML = `
    <div class="tip-head">
      <strong>${escapeHtml(title)}</strong>
      <button class="ghost-btn small tip-x" type="button" aria-label="Dismiss">✕</button>
    </div>
    <div class="meta">${escapeHtml(message)}</div>
    <div class="button-row tip-actions"></div>
  `;
  tip.querySelector('.tip-x').addEventListener('click', () => dismissTip(id));
  const row = tip.querySelector('.tip-actions');
  actions.forEach(a => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = a.primary ? 'primary-btn' : 'ghost-btn';
    b.textContent = a.label;
    b.addEventListener('click', () => a.onClick?.());
    row.appendChild(b);
  });
  tipDock.appendChild(tip);
}

function renderTips() {
  if (!tipDock) return;
  tipDock.innerHTML = '';

  if (!state.onboarding) {
    addTip({
      id: 'onboarding',
      title: 'Personalize (optional)',
      message: 'Answer 4 quick questions to tailor breathing preset + UI hints. Saved only on this device.',
      actions: [
        { label: 'Open setup', primary: true, onClick: () => openOnboarding() },
        { label: 'Dismiss', onClick: () => dismissTip('onboarding') }
      ]
    });
  }

  // Tips depend on what the user is doing.
  const activeId = $$('.view').find(v => v.classList.contains('active'))?.id;
  if (activeId === 'chat') {
    addTip({
      id: 'voice-tip',
      title: 'Try voice input',
      message: 'Tap the mic to record, then we’ll fill the message box with the transcription.',
      actions: [{ label: 'Got it', onClick: () => dismissTip('voice-tip') }]
    });
  }

  if (state.tipTriggers.hasJournals3 && (activeId === 'dashboard' || activeId === 'journal' || activeId === 'insights')) {
    addTip({
      id: 'insights-tip',
      title: 'Generate insights',
      message: 'You have a few entries—try the weekly insights view for patterns and suggestions.',
      actions: [{ label: 'Open insights', primary: true, onClick: () => showView('insights') }]
    });
  }

  if (state.tipTriggers.insightsSparse && activeId === 'insights') {
    addTip({
      id: 'more-journal-tip',
      title: 'Not enough data?',
      message: 'If insights are sparse, add a couple more journal entries this week.',
      actions: [{ label: 'Write journal', primary: true, onClick: () => showView('journal') }]
    });
  }
}

function openOnboarding() {
  onboardingModal?.classList.remove('hidden');
}

function closeOnboarding() {
  onboardingModal?.classList.add('hidden');
}

onboardingClose?.addEventListener('click', closeOnboarding);
onboardingSkip?.addEventListener('click', () => {
  dismissTip('onboarding');
  closeOnboarding();
});

onboardingForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = new FormData(onboardingForm);
  state.onboarding = Object.fromEntries(form.entries());
  saveJson('antara_onboarding_v1', state.onboarding);
  toastMsg('Saved preferences.');

  // Use the survey only for UI defaults; no backend changes.
  const goal = state.onboarding.goal;
  const voiceOk = state.onboarding.voice;
  if (voiceOk === 'no') dismissTip('voice-tip');
  if (goal === 'sleep') breathingPreset.value = '478';
  if (goal === 'stress' || goal === 'anxiety') breathingPreset.value = 'box';

  closeOnboarding();
  renderTips();
  updateBreathingPresetUI();
});

// Show onboarding once on first load.
if (!state.onboarding && !state.dismissedTips['onboarding']) {
  setTimeout(() => openOnboarding(), 250);
}

// --- Breathing exercise ---
const breathingPresets = {
  box: {
    name: 'Box breathing (4-4-4-4)',
    phases: [
      { cue: 'Inhale', seconds: 4, orb: 1.15, cls: 'inhale' },
      { cue: 'Hold', seconds: 4, orb: 1.15, cls: 'hold' },
      { cue: 'Exhale', seconds: 4, orb: 0.85, cls: 'exhale' },
      { cue: 'Hold', seconds: 4, orb: 0.85, cls: 'hold' }
    ]
  },
  478: {
    name: '4-7-8 breathing',
    phases: [
      { cue: 'Inhale', seconds: 4, orb: 1.15, cls: 'inhale' },
      { cue: 'Hold', seconds: 7, orb: 1.15, cls: 'hold' },
      { cue: 'Exhale', seconds: 8, orb: 0.82, cls: 'exhale' }
    ]
  },
  calm: {
    name: 'Calm (4-6)',
    phases: [
      { cue: 'Inhale', seconds: 4, orb: 1.12, cls: 'inhale' },
      { cue: 'Exhale', seconds: 6, orb: 0.88, cls: 'exhale' }
    ]
  }
};

let breathTimer = null;
let breathRunning = false;
let breathPhaseIdx = 0;
let breathPhaseLeft = 0;
let breathTotal = 0;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function fmtMMSS(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function updateBreathingPresetUI() {
  const preset = breathingPresets[breathingPreset.value] || breathingPresets.box;
  const text = preset.phases.map(p => `${p.cue} ${p.seconds}s`).join(' • ');
  breathingSteps.textContent = text;
}

breathingPreset?.addEventListener('change', updateBreathingPresetUI);

function setOrbPhase(phase) {
  if (!breathingOrb) return;
  breathingOrb.classList.remove('inhale', 'exhale', 'hold');
  breathingOrb.classList.add(phase.cls);
  breathingOrb.style.setProperty('--orb-scale', phase.orb);
}

function tickBreathing() {
  const preset = breathingPresets[breathingPreset.value] || breathingPresets.box;
  const phase = preset.phases[breathPhaseIdx];

  breathingCue.textContent = `${phase.cue}`;
  breathingTimer.textContent = fmtMMSS(breathTotal);
  breathingStatus.textContent = 'In progress';

  if (breathPhaseLeft <= 0) {
    breathPhaseIdx = (breathPhaseIdx + 1) % preset.phases.length;
    const next = preset.phases[breathPhaseIdx];
    breathPhaseLeft = next.seconds;
    setOrbPhase(next);
    breathingCue.textContent = `${next.cue}`;
  }

  breathTotal += 1;
  breathPhaseLeft -= 1;
}

function startBreathing() {
  if (breathRunning) return;
  const preset = breathingPresets[breathingPreset.value] || breathingPresets.box;
  breathRunning = true;
  breathPhaseIdx = 0;
  breathTotal = 0;
  breathPhaseLeft = preset.phases[0].seconds;
  setOrbPhase(preset.phases[0]);
  breathingCue.textContent = preset.phases[0].cue;
  breathingStatus.textContent = 'In progress';
  breathingTimer.textContent = '00:00';
  clearInterval(breathTimer);
  breathTimer = setInterval(tickBreathing, 1000);
  bumpStreak('breathing');
  updateStatus();
}

function pauseBreathing() {
  if (!breathRunning) return;
  breathRunning = false;
  clearInterval(breathTimer);
  breathingStatus.textContent = 'Paused';
}

function resetBreathing() {
  breathRunning = false;
  clearInterval(breathTimer);
  breathPhaseIdx = 0;
  breathPhaseLeft = 0;
  breathTotal = 0;
  breathingStatus.textContent = 'Ready';
  breathingCue.textContent = 'Select a preset and press Start';
  breathingTimer.textContent = '00:00';
  breathingOrb?.classList.remove('inhale', 'exhale', 'hold');
}

breathingStart?.addEventListener('click', startBreathing);
breathingPause?.addEventListener('click', () => (breathRunning ? pauseBreathing() : startBreathing()));
breathingReset?.addEventListener('click', resetBreathing);

function bumpStreak(kind) {
  const key = `antara_${kind}_streak_v1`;
  const data = loadJson(key, { last: null, count: 0 });
  const today = new Date().toISOString().slice(0, 10);
  if (data.last === today) return;
  // If yesterday, increment; else reset.
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  data.count = data.last === yesterday ? (data.count || 0) + 1 : 1;
  data.last = today;
  saveJson(key, data);
}

function onViewShown(id) {
  renderTips();
  if (id === 'breathing') updateBreathingPresetUI();
  if (id === 'chat') resetChatIdleNudge();
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
    if (data.length >= 3) {
      state.tipTriggers.hasJournals3 = true;
    }
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
  renderTips();
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
    if (!patterns.length && !suggestions.length) state.tipTriggers.insightsSparse = true;
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
  renderTips();
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
renderTips();
