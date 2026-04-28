import { loadJson, saveJson } from './storage.js';

const DEFAULT_BASE = loadJson('antara_api_base', null) || 'http://localhost:8000';

export function getApiBase() {
  return loadJson('antara_api_base', DEFAULT_BASE);
}

export function setApiBase(value) {
  const v = String(value || '').trim().replace(/\/$/, '') || DEFAULT_BASE;
  localStorage.setItem('antara_api_base', v);
  return v;
}

export function getToken() {
  return localStorage.getItem('antara_token') || '';
}

export function setToken(token) {
  if (token) localStorage.setItem('antara_token', token);
  else localStorage.removeItem('antara_token');
}

export async function apiFetch(path, options = {}) {
  const base = getApiBase();
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${base}${path}`, { ...options, headers });
  return res;
}

