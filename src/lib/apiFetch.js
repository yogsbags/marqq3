/**
 * Authenticated API fetch — attaches Supabase Bearer token (Marqq2 App.tsx pattern).
 */
import { supabase } from './supabase.js';

export async function apiFetch(input, init = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(input, { ...init, headers });
}

export async function apiJson(input, init = {}) {
  const res = await apiFetch(input, init);
  const json = await res.json().catch(() => ({}));
  return { res, json };
}
