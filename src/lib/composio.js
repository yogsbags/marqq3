/** Turn API/error payloads into a toast-safe string (avoids `[object Object]`). */
import { supabase } from './supabase.js';
import { apiFetch } from './apiFetch.js';

export function formatConnectorError(error, fallback = 'Connect failed') {
  if (error == null) return fallback;
  if (typeof error === 'string') {
    const trimmed = error.trim();
    return trimmed && trimmed !== '[object Object]' ? trimmed : fallback;
  }
  if (error instanceof Error) {
    const msg = error.message?.trim();
    return msg && msg !== '[object Object]' ? msg : fallback;
  }
  if (typeof error === 'object') {
    for (const key of ['message', 'error', 'detail', 'description']) {
      const value = error[key];
      if (typeof value === 'string' && value.trim() && value.trim() !== '[object Object]') {
        return value.trim();
      }
      if (value && typeof value === 'object') {
        const nested = formatConnectorError(value, '');
        if (nested) return nested;
      }
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}' && json !== 'null') return json.slice(0, 280);
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

const COMPOSIO_SUCCESS_EVENT = 'marqq:integration-connected';

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isActiveConnectorRecord(connector) {
  if (!connector) return false;
  if (connector.connected) return true;
  const status = String(connector.status || '').toLowerCase();
  return status === 'active' || status === 'connected' || status === 'success';
}

/** Poll Integrations until Composio marks the connector active (OAuth can lag the popup close). */
export async function waitForConnectorActive(
  companyId,
  connectorId,
  { attempts = 8, delayMs = 900 } = {}
) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`/api/integrations?companyId=${encodeURIComponent(companyId)}`);
      const json = res.ok ? await res.json().catch(() => ({})) : {};
      const match = (json?.connectors ?? []).find((c) => c.id === connectorId);
      if (isActiveConnectorRecord(match)) return true;
    } catch {
      /* retry */
    }
    if (i < attempts - 1) await sleep(delayMs);
  }
  return false;
}

export async function notifyAgentIntegrationConnected({ connectorId, companyId, userEmail, userName }) {
  let email = userEmail;
  let name = userName;
  if (!email) {
    const { data } = await supabase.auth.getUser();
    email = data?.user?.email || '';
    name = name || data?.user?.user_metadata?.full_name || '';
  }
  if (!email) return;
  try {
    await apiFetch('/api/agents/integration-connected', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectorId, workspaceId: companyId, userEmail: email, userName: name }),
    });
  } catch {
    // Ignore notification failures.
  }
}

function emitIntegrationConnected(detail) {
  window.dispatchEvent(new CustomEvent(COMPOSIO_SUCCESS_EVENT, { detail }));
}

export function addIntegrationConnectedListener(handler) {
  const listener = (event) => {
    if (!event.detail?.companyId || !event.detail?.connectorId) return;
    handler(event.detail);
  };
  window.addEventListener(COMPOSIO_SUCCESS_EVENT, listener);
  return () => window.removeEventListener(COMPOSIO_SUCCESS_EVENT, listener);
}

export async function connectComposioConnector({
  companyId,
  connectorId,
  userEmail,
  userName,
  onConnected,
}) {
  // Must open synchronously from the button click to avoid browser popup blocks.
  const popup = window.open(
    'about:blank',
    'composio_oauth',
    'width=600,height=700,left=200,top=100'
  );
  const oauthNonce = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (popup) {
    try {
      popup.document.title = 'Connecting account...';
      popup.document.body.innerHTML =
        '<div style="font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #fff; background: #0c0b0a; height: 100vh;">Opening secure connection...</div>';
    } catch (e) {
      /* ignore cross-origin DOM write */
    }
  }

  let response;
  let json = {};
  try {
    response = await fetch('/api/integrations/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyId, connectorId, oauthNonce }),
    });
    json = await response.json().catch(() => ({}));
  } catch (networkErr) {
    const notice = formatConnectorError(networkErr, 'Could not reach integrations API');
    try { popup?.close(); } catch (_) {}
    throw new Error(notice);
  }

  // Debug: log exactly what the server returned
  console.log('[composio] /api/integrations/connect response:', JSON.stringify(json));

  const redirectUrl = json?.redirectUrl || json?.redirect_url;

  if (!json?.ok || !redirectUrl) {
    const notice = formatConnectorError(json?.error, 'OAuth URL missing — connector not configured');
    console.warn('[composio] No OAuth URL — closing popup. Reason:', notice);
    if (popup && !popup.closed) {
      try {
        popup.document.title = 'Connect failed';
        popup.document.body.innerHTML = `<div style="font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #fff; background: #0c0b0a; height: 100vh;"><strong>Could not open connector</strong><p style="opacity:.85;line-height:1.45">${notice}</p><p style="opacity:.6;font-size:12px">You can close this window.</p></div>`;
      } catch (e) {
        try { popup.close(); } catch (_) {}
      }
    }
    const err = new Error(notice);
    err.code = 'COMPOSIO_CONNECT_CONFIG';
    throw err;
  }

  console.log('[composio] Opening OAuth popup →', redirectUrl);

  const finalize = async (resolvedConnectorId) => {
    emitIntegrationConnected({ companyId, connectorId: resolvedConnectorId });
    await notifyAgentIntegrationConnected({
      companyId,
      connectorId: resolvedConnectorId,
      userEmail,
      userName,
    });
    await onConnected?.(resolvedConnectorId);
  };

  if (!popup) {
    // Popup blocked — fall back to same-tab navigation so Connect still works.
    window.location.assign(redirectUrl);
    return { status: 'redirect', connectorId };
  }

  try {
    popup.location.href = redirectUrl;
  } catch (e) {
    /* ignore location set protection */
  }

  return await new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      window.clearInterval(pollTimer);
    };

    const settleConnected = async (resolvedConnectorId) => {
      if (settled) return;
      settled = true;
      cleanup();
      await finalize(resolvedConnectorId);
      resolve({ status: 'connected', connectorId: resolvedConnectorId });
    };

    const settleClosed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ status: 'closed' });
    };

    const handleMessage = async (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'composio_oauth_success') return;
      await settleConnected(event.data?.connectorId || connectorId);
    };

    const pollTimer = window.setInterval(async () => {
      if (!popup) { settleClosed(); return; }

      // Case 1: user closed the popup manually
      if (popup.closed) {
        if (settled) return;
        settled = true;
        cleanup();
        const active = await waitForConnectorActive(companyId, connectorId, { attempts: 6, delayMs: 1000 });
        if (active) {
          await finalize(connectorId);
          resolve({ status: 'connected', connectorId });
        } else {
          resolve({ status: 'closed' });
        }
        return;
      }

      // Case 2: Composio redirected the popup back to our origin after OAuth
      try {
        const popupHref = popup.location.href;
        // Same-origin readable → Composio callback landed back on our app
        if (popupHref && !popupHref.startsWith('about:') && popupHref.includes(window.location.origin)) {
          console.log('[composio] OAuth callback detected — popup returned to our origin. Closing popup & checking connector status.');
          try { popup.close(); } catch (e) {}
          if (settled) return;
          settled = true;
          cleanup();
          const active = await waitForConnectorActive(companyId, connectorId, { attempts: 8, delayMs: 1200 });
          if (active) {
            await finalize(connectorId);
            resolve({ status: 'connected', connectorId });
          } else {
            // Still fire onConnected — Composio marks it active asynchronously
            await finalize(connectorId);
            resolve({ status: 'connected', connectorId });
          }
        }
      } catch (e) {
        // Cross-origin (still on Composio's domain) — not ready yet, keep polling
      }
    }, 1000);

    window.addEventListener('message', handleMessage);
  });
}
