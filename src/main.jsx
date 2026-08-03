import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/main.css';

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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
