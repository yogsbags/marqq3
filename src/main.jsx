import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/main.css';
import { supabase } from './lib/supabase.js';

// ── Composio OAuth popup callback (Marqq2 parity) ────────────────────────────
// When Composio redirects back into the popup, notify the opener and close.
// Must run before React mounts so the popup never paints login/onboarding.
if (typeof window !== 'undefined' && window.opener) {
  const params = new URLSearchParams(window.location.search);
  const connectorId =
    params.get('connected') ||
    params.get('connectorId') ||
    params.get('connector_id') ||
    null;
  const status = String(params.get('status') || '').toLowerCase();
  const connectedAccountId =
    params.get('connected_account_id') ||
    params.get('connectedAccountId') ||
    null;

  if (connectorId || status === 'success' || connectedAccountId) {
    try {
      window.opener.postMessage(
        {
          type: 'composio_oauth_success',
          connectorId,
          connectedAccountId,
          status: status || 'success',
        },
        window.location.origin
      );
    } catch {
      /* ignore */
    }
    try {
      window.close();
    } catch {
      /* ignore */
    }
  }
}

// Legacy screens still use fetch('/api/...') directly. Attach the current
// Supabase session at the browser boundary so workspace guards apply
// consistently without requiring every older screen to be rewritten at once.
if (typeof window !== 'undefined' && !window.__marqqAuthenticatedFetch) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input?.url;
    const pathname = rawUrl ? new URL(rawUrl, window.location.origin).pathname : '';
    if (!pathname.startsWith('/api/')) return nativeFetch(input, init);
    const { data } = await supabase.auth.getSession();
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (data.session?.access_token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${data.session.access_token}`);
    }
    return nativeFetch(input, { ...init, headers });
  };
  window.__marqqAuthenticatedFetch = true;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
