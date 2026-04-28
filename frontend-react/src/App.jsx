import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, getApiBase, setApiBase, setToken, getToken } from './lib/api.js';
import { loadJson, saveJson } from './lib/storage.js';

function Toast({ toast, clearToast }) {
  if (!toast) return null;
  return (
    <div className="toast" style={{ borderColor: toast.error ? 'rgba(255,107,107,0.45)' : 'rgba(124,140,255,0.45)' }}>
      {toast.msg}
      <button className="ghost-btn" style={{ marginLeft: 12 }} onClick={clearToast}>Close</button>
    </div>
  );
}

function formatDate(value) {
  if (!value) return 'Unknown time';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

const ONBOARDING_KEY = 'antara_onboarding_v1';
const BREATHING_DONE_DATE_KEY = 'antara_breathing_done_date_v1';
const BREATHING_NUDGE_DISMISS_KEY = 'antara_breathing_nudge_dismiss_v1';
const BREATHING_NUDGE_SNOOZE_UNTIL_KEY = 'antara_breathing_nudge_snooze_until_v1';
const DAILY_BREATHING_TARGET_SECONDS = 10 * 60;
const REMIND_LATER_SNOOZE_MINUTES = 120;

function decodeJwtSub(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    const json = atob(padded);
    const payload = JSON.parse(json);
    return payload?.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

function userScopedKey(baseKey) {
  const sub = decodeJwtSub(getToken());
  return sub ? `${baseKey}:${sub}` : baseKey;
}

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function spotifySearchUrl(query) {
  const q = String(query || '').trim();
  return `https://open.spotify.com/search/${encodeURIComponent(q || 'mood music')}`;
}

function computeMoodCategory({ avgMood, lastMood }) {
  const x = Number.isFinite(avgMood) ? avgMood : Number.isFinite(lastMood) ? lastMood : null;
  if (x === null) return 'neutral';
  if (x <= 3.5) return 'low';
  if (x <= 6.5) return 'neutral';
  return 'high';
}

function buildPlaylistPalette({ prefs, moodCategory }) {
  const genres = (prefs?.genres || []).filter(Boolean);
  const artists = (prefs?.artists || []).filter(Boolean);

  const hasPref = Boolean(genres.length || artists.length);
  const base = hasPref
    ? `${[...genres.slice(0, 2), ...artists.slice(0, 1)].join(' ').trim()}`
    : '';

  const moodMap = {
    low: {
      header: 'Gentle uplift',
      tiles: [
        { title: 'Calm & comfort', tag: 'calm', q: `${base} calm comfort` || 'calm comfort songs' },
        { title: 'Release stress', tag: 'reset', q: `${base} stress relief` || 'stress relief music' },
        { title: 'Soft focus', tag: 'focus', q: `${base} focus mellow` || 'lofi focus' },
      ]
    },
    neutral: {
      header: 'Balanced day',
      tiles: [
        { title: 'Focus mode', tag: 'focus', q: `${base} focus` || 'lofi focus' },
        { title: 'Light energy', tag: 'uplift', q: `${base} uplifting` || 'uplifting songs' },
        { title: 'Chill vibes', tag: 'chill', q: `${base} chill` || 'chill vibes' },
      ]
    },
    high: {
      header: 'Ride the momentum',
      tiles: [
        { title: 'Feel-good hits', tag: 'uplift', q: `${base} feel good` || 'feel good hits' },
        { title: 'Workout / energy', tag: 'energy', q: `${base} energetic` || 'workout music' },
        { title: 'Flow state', tag: 'focus', q: `${base} deep focus` || 'deep focus' },
      ]
    }
  };

  const m = moodMap[moodCategory] || moodMap.neutral;
  return {
    header: m.header,
    tiles: m.tiles.map((t) => ({
      ...t,
      href: spotifySearchUrl(t.q),
      desc: hasPref ? `Based on your preferences: ${[...genres, ...artists].slice(0, 3).join(', ')}` : 'Based on your recent mood trends'
    }))
  };
}

function OnboardingModal({ open, initialPrefs, onClose, onSave }) {
  const [goal, setGoal] = useState(initialPrefs?.goal || 'stress');
  const [genres, setGenres] = useState((initialPrefs?.genres || []).join(', '));
  const [artists, setArtists] = useState((initialPrefs?.artists || []).join(', '));
  const [language, setLanguage] = useState(initialPrefs?.language || '');

  useEffect(() => {
    if (!open) return;
    setGoal(initialPrefs?.goal || 'stress');
    setGenres((initialPrefs?.genres || []).join(', '));
    setArtists((initialPrefs?.artists || []).join(', '));
    setLanguage(initialPrefs?.language || '');
  }, [open, initialPrefs]);

  if (!open) return null;

  return (
    <div className="backdrop" role="dialog" aria-modal="true" aria-label="Onboarding survey">
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>Personalize your experience</h3>
            <div className="meta" style={{ marginTop: 6 }}>This helps Antara recommend breathing presets and Spotify listening for today. You can edit anytime.</div>
          </div>
          <button className="ghost-btn" type="button" onClick={onClose}>Close</button>
        </div>

        <div className="grid-2">
          <div className="stack">
            <div className="meta">Primary goal</div>
            <select value={goal} onChange={(e) => setGoal(e.target.value)}>
              <option value="stress">Reduce stress</option>
              <option value="anxiety">Manage anxiety</option>
              <option value="focus">Improve focus</option>
              <option value="sleep">Sleep better</option>
              <option value="mood">Feel better</option>
            </select>
            <div className="meta">Favorite genres (comma separated)</div>
            <input value={genres} onChange={(e) => setGenres(e.target.value)} placeholder="e.g. lo-fi, indie, bollywood, classical" />
          </div>

          <div className="stack">
            <div className="meta">Favorite artists (comma separated)</div>
            <input value={artists} onChange={(e) => setArtists(e.target.value)} placeholder="e.g. Arijit Singh, The Weeknd, Taylor Swift" />
            <div className="meta">Language (optional)</div>
            <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="e.g. Hindi / English" />
          </div>
        </div>

        <div className="modal-foot">
          <button className="ghost-btn" type="button" onClick={() => {
            onSave({
              goal,
              genres: String(genres || '').split(',').map((s) => s.trim()).filter(Boolean),
              artists: String(artists || '').split(',').map((s) => s.trim()).filter(Boolean),
              language: String(language || '').trim() || ''
            });
          }}>Save</button>
          <button className="primary-btn" type="button" onClick={() => {
            onSave({ goal: 'stress', genres: [], artists: [], language: '' });
          }}>Skip for now</button>
        </div>
      </div>
    </div>
  );
}

function DailyBreathingNudge({ open, onStart, onLater, onDismissToday }) {
  if (!open) return null;
  return (
    <div className="backdrop" role="dialog" aria-modal="true" aria-label="Daily breathing reminder">
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>Daily breathing</h3>
            <div className="meta" style={{ marginTop: 6 }}>
              Want to do a quick <strong>10‑minute</strong> breathing exercise today? It helps reduce stress and improves focus.
            </div>
          </div>
          <button className="ghost-btn" type="button" onClick={onLater}>Close</button>
        </div>

        <div className="modal-foot">
          <button className="ghost-btn" type="button" onClick={onDismissToday}>Don’t show today</button>
          <button className="ghost-btn" type="button" onClick={onLater}>Remind later</button>
          <button className="primary-btn" type="button" onClick={onStart}>Start now</button>
        </div>
      </div>
    </div>
  );
}

function AuthCard({ setToast, onAuthed }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function login(e) {
    e.preventDefault();
    const body = new URLSearchParams();
    body.set('username', email);
    body.set('password', password);
    const res = await fetch(`${getApiBase()}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setToast({ msg: data.detail || 'Login failed', error: true });
    setToken(data.access_token);
    setToast({ msg: 'Logged in', error: false });
    onAuthed?.();
  }

  async function register(e) {
    e.preventDefault();
    const payload = { email, username, password };
    const res = await fetch(`${getApiBase()}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setToast({ msg: data.detail || 'Registration failed', error: true });
    setToast({ msg: 'Account created. You can log in now.', error: false });
    setUsername('');
    setPassword('');
  }

  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-head">
          <h3>Sign in</h3>
          <span className="pill">JWT</span>
        </div>
        <form className="stack" onSubmit={login}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" required />
          <button className="primary-btn" type="submit">Login</button>
        </form>
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Create account</h3>
        </div>
        <form className="stack" onSubmit={register}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" required />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" required />
          <button className="primary-btn" type="submit">Register</button>
        </form>
      </div>
    </div>
  );
}

function DashboardCard({ setToast, onGo, prefs, onOpenPrefs }) {
  const authed = Boolean(getToken());
  const [journalCount, setJournalCount] = useState(null);
  const [sessionId] = useState(localStorage.getItem('antara_session_id') || '');
  const [avgMood, setAvgMood] = useState(null);
  const [lastMood, setLastMood] = useState(null);
  const [breathingDoneToday, setBreathingDoneToday] = useState(false);

  useEffect(() => {
    let alive = true;
    async function loadCount() {
      if (!authed) return setJournalCount(null);
      try {
        const res = await apiFetch('/journal/');
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error(data?.detail || 'Could not load journal entries');
        if (!alive) return;
        const arr = Array.isArray(data) ? data : [];
        setJournalCount(arr.length);
        const moods = arr.map((j) => Number(j.mood_score)).filter((x) => Number.isFinite(x));
        if (moods.length) {
          const avg = moods.reduce((a, b) => a + b, 0) / moods.length;
          setAvgMood(Number(avg.toFixed(2)));
          setLastMood(moods[0]); // API sorts reverse chrono in backend
        } else {
          setAvgMood(null);
          setLastMood(null);
        }
      } catch {
        if (alive) setJournalCount(0);
      }
    }
    loadCount();
    return () => { alive = false; };
  }, [authed]);

  useEffect(() => {
    if (!authed) return setBreathingDoneToday(false);
    const doneDate = loadJson(userScopedKey(BREATHING_DONE_DATE_KEY), '');
    setBreathingDoneToday(doneDate === todayKey());
  }, [authed]);

  const moodCategory = computeMoodCategory({ avgMood, lastMood });
  const palette = buildPlaylistPalette({ prefs, moodCategory });

  return (
    <div className="card">
      <div className="page-head">
        <div>
          <h2 style={{ margin: 0 }}>Dashboard</h2>
          <div className="meta" style={{ marginTop: 6 }}>Your mental fitness workspace—journals, chat, insights, and quick calming tools.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span className="pill">{authed ? 'Signed in' : 'Signed out'}</span>
          <button className="ghost-btn" type="button" onClick={onOpenPrefs}>Personalize</button>
        </div>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="k">Token</div>
          <div className="v">{authed ? 'Stored' : 'Absent'}</div>
        </div>
        <div className="metric">
          <div className="k">Journal entries</div>
          <div className="v">{authed ? (journalCount ?? '…') : '—'}</div>
        </div>
        <div className="metric">
          <div className="k">Chat session</div>
          <div className="v">{sessionId ? `${sessionId.slice(0, 8)}…` : 'New'}</div>
        </div>
        <div className="metric">
          <div className="k">Breathing today</div>
          <div className="v">{authed ? (breathingDoneToday ? 'Done' : 'Not yet') : '—'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <button className="primary-btn" type="button" onClick={() => onGo('journal')}>Write journal</button>
        <button className="ghost-btn" type="button" onClick={() => onGo('chat')}>Open chat</button>
        <button className="ghost-btn" type="button" onClick={() => onGo('insights')}>Generate insights</button>
        <button className="ghost-btn" type="button" onClick={() => onGo('breathing')}>Start breathing</button>
        {!authed && <button className="ghost-btn" type="button" onClick={() => { setToast({ msg: 'Please sign in to use journals and insights.', error: false }); onGo('auth'); }}>Sign in</button>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3 style={{ margin: 0 }}>Listen today</h3>
          <span className="pill">{palette.header}</span>
        </div>
        <div className="meta">No Spotify login needed—these open Spotify search results based on your mood and preferences.</div>
        <div className="palette">
          {palette.tiles.map((t) => (
            <a key={t.title} className="tile" href={t.href} target="_blank" rel="noreferrer">
              <div className="t">{t.title}</div>
              <div className="d">{t.desc}</div>
              <div className="tag">{t.tag}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatCard({ setToast }) {
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(localStorage.getItem('antara_session_id') || '');
  const [input, setInput] = useState('');
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  async function send(e) {
    e.preventDefault();
    if (!getToken()) return setToast({ msg: 'Log in before chatting.', error: true });
    const text = input.trim();
    if (!text) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    const res = await apiFetch('/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, session_id: sessionId || null })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setToast({ msg: data.detail || 'Chat failed', error: true });
    setSessionId(data.session_id);
    localStorage.setItem('antara_session_id', data.session_id);
    setMessages((m) => [...m, { role: 'ai', text: data.response || 'No response received' }]);
  }

  async function startRecording() {
    if (recording) return;
    if (!getToken()) return setToast({ msg: 'Log in before using voice input.', error: true });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.addEventListener('dataavailable', (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      });
      mr.addEventListener('stop', async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' });
        chunksRef.current = [];
        if (blob.size < 256) return;
        await transcribe(blob);
      });
      mr.start();
      setRecording(true);
      setToast({ msg: 'Recording… click again to stop.', error: false });
    } catch (err) {
      setToast({ msg: err?.message || 'Microphone permission denied', error: true });
    }
  }

  function stopRecording() {
    try { mediaRecorderRef.current?.stop(); } catch {}
    setRecording(false);
  }

  async function transcribe(blob) {
    try {
      setToast({ msg: 'Transcribing…', error: false });
      const fd = new FormData();
      const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('wav') ? 'wav' : 'webm';
      fd.append('file', blob, `voice.${ext}`);
      const res = await apiFetch('/voice/transcribe', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Transcription failed');
      setInput(String(data.text || '').trim());
      setToast({ msg: 'Transcription ready (filled input).', error: false });
    } catch (err) {
      setToast({ msg: err.message, error: true });
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Chat</h3>
        <span className="pill">{sessionId ? `${sessionId.slice(0, 8)}…` : 'New session'}</span>
      </div>
      <div className="chat-thread">
        {messages.length ? messages.map((m, idx) => (
          <div key={idx} className={`bubble ${m.role === 'user' ? 'user' : 'ai'}`}>
            <div className="meta" style={{ marginBottom: 6 }}>{m.role === 'user' ? 'You' : 'Antara'}</div>
            <div>{m.text}</div>
          </div>
        )) : <div className="meta">Say hi, or use the mic to dictate.</div>}
      </div>
      <form className="chat-form" onSubmit={send}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your message…" />
        <button className={`ghost-btn mic ${recording ? 'active-rec' : ''}`} type="button" onClick={() => (recording ? stopRecording() : startRecording())}>
          {recording ? '⏹️' : '🎙️'}
        </button>
        <button className="primary-btn" type="submit">Send</button>
      </form>
    </div>
  );
}

function JournalCard({ setToast }) {
  const authed = Boolean(getToken());
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState([]);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('5');
  const [tags, setTags] = useState('');

  async function load() {
    if (!authed) return setEntries([]);
    setLoading(true);
    try {
      const res = await apiFetch('/journal/');
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.detail || 'Could not load journal entries');
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      setToast({ msg: err.message, error: true });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [authed]);

  async function submit(e) {
    e.preventDefault();
    if (!authed) return setToast({ msg: 'Log in before writing a journal.', error: true });
    const payload = {
      title,
      content,
      mood_score: Number(mood),
      tags: String(tags || '').split(',').map((s) => s.trim()).filter(Boolean)
    };
    try {
      const res = await apiFetch('/journal/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || 'Failed to save journal');
      setTitle('');
      setContent('');
      setMood('5');
      setTags('');
      setToast({ msg: 'Journal saved', error: false });
      await load();
    } catch (err) {
      setToast({ msg: err.message, error: true });
    }
  }

  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-head">
          <h3>New journal entry</h3>
          <span className="pill">Mood 0–10</span>
        </div>
        <form className="stack" onSubmit={submit}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={9} placeholder="Write your thoughts..." required />
          <div className="grid-2">
            <input value={mood} onChange={(e) => setMood(e.target.value)} type="number" min="0" max="10" step="0.1" placeholder="Mood score" required />
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags (comma separated)" />
          </div>
          <button className="primary-btn" type="submit">Save entry</button>
          {!authed && <div className="meta">Sign in to save and view entries.</div>}
        </form>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Your entries</h3>
          <button className="ghost-btn" type="button" onClick={load} disabled={!authed || loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
        {!authed ? (
          <div className="meta">Sign in to view your entries.</div>
        ) : (
          <div className="list">
            {entries.length ? entries.map((e) => (
              <div key={e.id || `${e.title}-${e.created_at}`} className="entry">
                <strong>{e.title || 'Untitled'}</strong>
                <div className="meta" style={{ marginTop: 6 }}>Mood: {e.mood_score ?? '—'} • {formatDate(e.created_at)}</div>
                <p>{e.content || ''}</p>
                <small>{(e.tags || []).join(', ') || 'No tags'} • Embedding: {e.embedding_status || '—'}</small>
              </div>
            )) : (
              <div className="meta">No entries yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InsightsCard({ setToast }) {
  const authed = Boolean(getToken());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  async function generate() {
    if (!authed) return setToast({ msg: 'Log in to generate insights.', error: true });
    setLoading(true);
    setData(null);
    try {
      const res = await apiFetch('/insights/weekly');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.detail || 'Could not load insights');
      setData(d);
    } catch (err) {
      setToast({ msg: err.message, error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Weekly insights</h3>
        <button className="primary-btn" type="button" onClick={generate} disabled={!authed || loading}>
          {loading ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {!authed && <div className="meta">Sign in to generate insights.</div>}

      {loading && <div className="meta">Analyzing your last 7 days of journals and mood logs…</div>}

      {!loading && authed && !data && (
        <div className="meta">Press Generate to get a summary, patterns, suggestions, and an affirmation.</div>
      )}

      {!loading && data && (
        <div className="list">
          <div className="entry">
            <strong>Summary</strong>
            <p>{String(data.summary || '')}</p>
          </div>
          <div className="entry">
            <strong>Patterns</strong>
            <p>{(Array.isArray(data.patterns) ? data.patterns : []).join('\n') || 'No patterns returned.'}</p>
          </div>
          <div className="entry">
            <strong>Suggestions</strong>
            <p>{(Array.isArray(data.suggestions) ? data.suggestions : []).join('\n') || 'No suggestions returned.'}</p>
          </div>
          <div className="entry">
            <strong>Affirmation</strong>
            <p>{String(data.affirmation || '')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function BreathingCard({ setToast }) {
  const presets = useMemo(() => ({
    box: {
      label: 'Box (4-4-4-4)',
      phases: [
        { cue: 'Inhale', seconds: 4, orb: 1.15 },
        { cue: 'Hold', seconds: 4, orb: 1.15 },
        { cue: 'Exhale', seconds: 4, orb: 0.85 },
        { cue: 'Hold', seconds: 4, orb: 0.85 }
      ]
    },
    '478': {
      label: '4-7-8',
      phases: [
        { cue: 'Inhale', seconds: 4, orb: 1.15 },
        { cue: 'Hold', seconds: 7, orb: 1.15 },
        { cue: 'Exhale', seconds: 8, orb: 0.82 }
      ]
    },
    calm: {
      label: 'Calm (4-6)',
      phases: [
        { cue: 'Inhale', seconds: 4, orb: 1.12 },
        { cue: 'Exhale', seconds: 6, orb: 0.88 }
      ]
    }
  }), []);

  const [preset, setPreset] = useState('box');
  const [running, setRunning] = useState(false);
  const [cue, setCue] = useState('Select a preset and press Start');
  const [t, setT] = useState(0);
  const [orb, setOrb] = useState(1);
  const [markedDone, setMarkedDone] = useState(false);

  const phaseRef = useRef({ idx: 0, left: 0 });
  const timerRef = useRef(null);

  function fmtMMSS(total) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  useEffect(() => () => clearInterval(timerRef.current), []);

  useEffect(() => {
    if (!running) return;
    if (markedDone) return;
    if (t < DAILY_BREATHING_TARGET_SECONDS) return;
    setMarkedDone(true);
    saveJson(userScopedKey(BREATHING_DONE_DATE_KEY), todayKey());
    setToast?.({ msg: 'Nice work — you completed 10 minutes of breathing today.', error: false });
  }, [running, t, markedDone, setToast]);

  function start() {
    const p = presets[preset];
    phaseRef.current = { idx: 0, left: p.phases[0].seconds };
    setCue(p.phases[0].cue);
    setOrb(p.phases[0].orb);
    setT(0);
    setMarkedDone(false);
    setRunning(true);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setT((x) => x + 1);
      phaseRef.current.left -= 1;
      if (phaseRef.current.left <= 0) {
        const p2 = presets[preset];
        phaseRef.current.idx = (phaseRef.current.idx + 1) % p2.phases.length;
        const ph = p2.phases[phaseRef.current.idx];
        phaseRef.current.left = ph.seconds;
        setCue(ph.cue);
        setOrb(ph.orb);
      }
    }, 1000);
  }

  function pause() {
    clearInterval(timerRef.current);
    setRunning(false);
  }

  function reset() {
    clearInterval(timerRef.current);
    setRunning(false);
    setCue('Select a preset and press Start');
    setT(0);
    setOrb(1);
    setMarkedDone(false);
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Breathing</h3>
        <span className="pill">{running ? 'In progress' : 'Ready'}</span>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="breathing-stage">
            <div className="orb" style={{ ['--orb-scale']: orb }} />
            <div className="overlay">
              <div className="cue">{cue}</div>
              <div className="timer">{fmtMMSS(t)}</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="stack">
            <div className="meta">Preset</div>
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {Object.entries(presets).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <div className="meta">
              {presets[preset].phases.map((p) => `${p.cue} ${p.seconds}s`).join(' • ')}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="primary-btn" type="button" onClick={() => (running ? pause() : start())}>
                {running ? 'Pause' : 'Start'}
              </button>
              <button className="ghost-btn" type="button" onClick={reset}>Reset</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState('dashboard');
  const [apiBase, setApiBaseState] = useState(getApiBase());
  const [toast, setToast] = useState(null);
  const [prefs, setPrefs] = useState(loadJson(ONBOARDING_KEY, null));
  const [showPrefs, setShowPrefs] = useState(false);
  const [showBreathingNudge, setShowBreathingNudge] = useState(false);

  function clearToast() {
    setToast(null);
  }

  function logout() {
    setToken('');
    setToast({ msg: 'Logged out', error: false });
  }

  const authed = Boolean(getToken());

  useEffect(() => {
    if (!authed) return;
    const existing = loadJson(ONBOARDING_KEY, null);
    if (!existing) setShowPrefs(true);
  }, [authed]);

  useEffect(() => {
    if (!authed) return setShowBreathingNudge(false);
    // Only consider showing the nudge on the Dashboard (no route-spam).
    if (view !== 'dashboard') return setShowBreathingNudge(false);

    const doneDate = loadJson(userScopedKey(BREATHING_DONE_DATE_KEY), '');
    const dismissedFor = loadJson(userScopedKey(BREATHING_NUDGE_DISMISS_KEY), '');
    const snoozeUntil = Number(loadJson(userScopedKey(BREATHING_NUDGE_SNOOZE_UNTIL_KEY), 0)) || 0;
    const now = Date.now();

    const shouldShow =
      doneDate !== todayKey() &&
      dismissedFor !== todayKey() &&
      now >= snoozeUntil;

    setShowBreathingNudge(shouldShow);
  }, [authed, view]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">A</div>
          <div>
            <h1>Antara</h1>
            <p>React prototype</p>
          </div>
        </div>

        <div className="card">
          <div className="meta" style={{ marginBottom: 8 }}>Backend URL</div>
          <input
            value={apiBase}
            onChange={(e) => setApiBaseState(e.target.value)}
            onBlur={() => setApiBaseState(setApiBase(apiBase))}
            placeholder="http://localhost:8000"
          />
          <div className="meta" style={{ marginTop: 10 }}>
            Token: <strong>{authed ? 'Stored' : 'Absent'}</strong>
          </div>
        </div>

        <div className="nav">
          <button className={`nav-btn ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>Dashboard</button>
          <button className={`nav-btn ${view === 'journal' ? 'active' : ''}`} onClick={() => setView('journal')}>Journal</button>
          <button className={`nav-btn ${view === 'chat' ? 'active' : ''}`} onClick={() => setView('chat')}>Chat</button>
          <button className={`nav-btn ${view === 'insights' ? 'active' : ''}`} onClick={() => setView('insights')}>Insights</button>
          <button className={`nav-btn ${view === 'breathing' ? 'active' : ''}`} onClick={() => setView('breathing')}>Breathing</button>
          <button className={`nav-btn ${view === 'auth' ? 'active' : ''}`} onClick={() => setView('auth')}>Auth</button>
        </div>

        <button className="ghost-btn" onClick={logout}>Log out</button>
      </aside>

      <main className="content">
        {view === 'dashboard' && <DashboardCard setToast={setToast} onGo={setView} prefs={prefs} onOpenPrefs={() => setShowPrefs(true)} />}
        {view === 'journal' && <JournalCard setToast={setToast} />}
        {view === 'chat' && <ChatCard setToast={setToast} />}
        {view === 'insights' && <InsightsCard setToast={setToast} />}
        {view === 'breathing' && <BreathingCard setToast={setToast} />}
        {view === 'auth' && <AuthCard setToast={setToast} onAuthed={() => setView('chat')} />}
      </main>

      <Toast toast={toast} clearToast={clearToast} />
      <OnboardingModal
        open={showPrefs}
        initialPrefs={prefs}
        onClose={() => setShowPrefs(false)}
        onSave={(p) => {
          saveJson(ONBOARDING_KEY, p);
          setPrefs(p);
          setShowPrefs(false);
          setToast({ msg: 'Preferences saved.', error: false });
        }}
      />
      <DailyBreathingNudge
        open={showBreathingNudge && authed}
        onStart={() => {
          setShowBreathingNudge(false);
          setView('breathing');
          setToast({ msg: 'Start a 10-minute breathing session. You’ve got this.', error: false });
        }}
        onLater={() => {
          // Snooze for a while so it doesn't pop up repeatedly.
          const until = Date.now() + REMIND_LATER_SNOOZE_MINUTES * 60 * 1000;
          saveJson(userScopedKey(BREATHING_NUDGE_SNOOZE_UNTIL_KEY), until);
          setShowBreathingNudge(false);
          setToast({ msg: `Okay — I’ll remind you later.`, error: false });
        }}
        onDismissToday={() => {
          saveJson(userScopedKey(BREATHING_NUDGE_DISMISS_KEY), todayKey());
          setShowBreathingNudge(false);
          setToast({ msg: 'Okay — I won’t show this again today.', error: false });
        }}
      />
    </div>
  );
}

