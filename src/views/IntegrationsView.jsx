import React, { useState, useEffect } from 'react';
import { connectComposioConnector, formatConnectorError } from '../lib/composio';
import { CONNECTOR_DISPLAY, isConnectorActive, connectorLabel } from '../lib/connectormeta';
import { ResourcePickerModal } from '../components/common/ResourcePickerModal';
import { getActiveWorkspaceId } from '../lib/workspace.js';

export function IntegrationsView({ setActiveScreen }) {
  const [workspaceId, setWorkspaceId] = useState(getActiveWorkspaceId());
  const [connectors, setConnectors] = useState([
    { id: 'google_ads', name: 'Google Ads', connected: false, status: 'not_connected' },
    { id: 'linkedin', name: 'LinkedIn', connected: false, status: 'not_connected' },
    { id: 'linkedin_ads', name: 'LinkedIn Ads', connected: false, status: 'not_connected' },
    { id: 'facebook', name: 'Facebook', connected: false, status: 'not_connected' },
    { id: 'instagram', name: 'Instagram', connected: false, status: 'not_connected' },
    { id: 'twitter', name: 'X (Twitter)', connected: false, status: 'not_connected' },
    { id: 'youtube', name: 'YouTube', connected: false, status: 'not_connected' },
    { id: 'meta_ads', name: 'Meta Ads', connected: false, status: 'not_connected' },
    { id: 'salesforce', name: 'Salesforce CRM', connected: false, status: 'not_connected' },
    { id: 'hubspot', name: 'HubSpot CRM', connected: false, status: 'not_connected' },
    { id: 'ga4', name: 'Google Analytics', connected: false, status: 'not_connected' },
    { id: 'gsc', name: 'Google Search Console', connected: false, status: 'not_connected' },
    { id: 'google_sheets', name: 'Google Sheets', connected: false, status: 'not_connected' },
    { id: 'google_docs', name: 'Google Docs', connected: false, status: 'not_connected' },
    { id: 'google_drive', name: 'Google Drive', connected: false, status: 'not_connected' },
    { id: 'instantly', name: 'Instantly', connected: false, status: 'not_connected' },
    { id: 'heyreach', name: 'HeyReach', connected: false, status: 'not_connected' },
    { id: 'whatsapp', name: 'WhatsApp', connected: false, status: 'not_connected' },
    { id: 'apollo', name: 'Apollo', connected: false, status: 'not_connected' },
    { id: 'gmail', name: 'Gmail', connected: false, status: 'not_connected' },
    { id: 'github', name: 'GitHub', connected: false, status: 'not_connected' },
  ]);
  const [preferences, setPreferences] = useState({});
  const [connectingId, setConnectingId] = useState(null);
  const [pickerConnectorId, setPickerConnectorId] = useState(null);
  const [connectError, setConnectError] = useState('');
  const [webhookEndpoints, setWebhookEndpoints] = useState([]);
  const [webhookProvider, setWebhookProvider] = useState('');
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [webhookNotice, setWebhookNotice] = useState('');

  const fetchPreferences = (targetWorkspaceId = workspaceId) => {
    fetch(`/api/integrations/preferences?companyId=${encodeURIComponent(targetWorkspaceId)}`)
      .then(r => r.json())
      .then(data => {
        if (data?.preferences) {
          setPreferences(data.preferences);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetch(`/api/integrations?companyId=${encodeURIComponent(workspaceId)}`)
      .then(r => r.json())
      .then(data => {
        if (data?.connectors && data.connectors.length > 0) {
          setConnectors(data.connectors);
        }
      })
      .catch(() => {});

    fetchPreferences(workspaceId);
    fetch(`/api/integrations/webhooks?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(r => r.json())
      .then(data => setWebhookEndpoints(data?.endpoints || []))
      .catch(() => setWebhookEndpoints([]));
  }, [workspaceId]);

  useEffect(() => {
    const onWorkspaceChanged = (event) => setWorkspaceId(event.detail?.id || getActiveWorkspaceId());
    window.addEventListener('marqq:workspace-changed', onWorkspaceChanged);
    return () => window.removeEventListener('marqq:workspace-changed', onWorkspaceChanged);
  }, []);

  const handleConnect = async (connectorId) => {
    setConnectingId(connectorId);
    setConnectError('');
    try {
      const res = await connectComposioConnector({
        companyId: workspaceId,
        connectorId,
        onConnected: (id) => {
          setConnectors(prev => prev.map(c => c.id === id ? { ...c, connected: true, status: 'active' } : c));
          setPickerConnectorId(id);
        }
      });
      if (res?.status === 'connected') {
        setConnectors(prev => prev.map(c => c.id === connectorId ? { ...c, connected: true, status: 'active' } : c));
        setPickerConnectorId(connectorId);
      }
    } catch (err) {
      const msg = formatConnectorError(err);
      console.warn('Connect notice:', msg);
      setConnectError(msg);
    } finally {
      setConnectingId(null);
    }
  };

  const getAccountValueForConnector = (id) => {
    const fieldMap = {
      google_ads: 'google_ads_customer_id',
      meta_ads: 'meta_ads_account_id',
      linkedin_ads: 'linkedin_ads_account_id',
      ga4: 'ga4_property_id',
      gsc: 'gsc_site_url',
      google_sheets: 'google_sheets_spreadsheet_id',
      google_docs: 'google_docs_document_id',
      github: 'github_repository',
      salesforce: 'salesforce_account_id',
      hubspot: 'hubspot_account_id'
    };
    const field = fieldMap[id] || `${id}_account_id`;
    return preferences[field] || null;
  };

  const analyticsReady = connectors.some(
    (c) => isConnectorActive(c) && ['ga4', 'gsc', 'meta_ads', 'google_ads', 'google_sheets'].includes(c.id)
  );

  const rotateWebhook = async () => {
    if (!webhookProvider) return;
    setWebhookBusy(true);
    setWebhookNotice('');
    try {
      const response = await fetch('/api/integrations/webhooks/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          provider: webhookProvider,
          connectedAccountId: getAccountValueForConnector(webhookProvider),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.endpoint) throw new Error(data?.error || 'Could not create webhook endpoint');
      await navigator.clipboard?.writeText(data.endpoint.secret || '');
      setWebhookNotice(`Endpoint created. Secret copied — configure ${webhookProvider} with the URL and secret now.`);
      setWebhookEndpoints(prev => [data.endpoint, ...prev.filter(item => item.provider !== webhookProvider)]);
    } catch (err) {
      setWebhookNotice(err.message || 'Could not create webhook endpoint');
    } finally {
      setWebhookBusy(false);
    }
  };

  const revealWebhook = async (endpointId) => {
    try {
      const response = await fetch(`/api/integrations/webhooks/${encodeURIComponent(endpointId)}/reveal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Could not reveal secret');
      await navigator.clipboard?.writeText(data.endpoint.secret || '');
      setWebhookNotice('Secret copied to clipboard.');
    } catch (err) { setWebhookNotice(err.message || 'Could not reveal secret'); }
  };

  const revokeWebhook = async (endpointId) => {
    setWebhookBusy(true);
    try {
      const response = await fetch(`/api/integrations/webhooks/${encodeURIComponent(endpointId)}/revoke`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId }),
      });
      if (!response.ok) throw new Error('Could not revoke endpoint');
      setWebhookEndpoints(prev => prev.filter(item => item.id !== endpointId));
      setWebhookNotice('Webhook endpoint revoked.');
    } catch (err) { setWebhookNotice(err.message || 'Could not revoke endpoint'); }
    finally { setWebhookBusy(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Integrations &amp; Connectors</h1>
          <p className="text-muted" style={{ marginTop: '4px' }}>Manage ad platform OAuth tokens, CRM syncs, and web analytics connectors.</p>
          {connectError ? (
            <p className="text-muted" role="alert" style={{ marginTop: 8, color: '#c45c26', fontSize: 13 }}>
              {connectError}
            </p>
          ) : null}
        </div>
        {setActiveScreen ? (
          <button
            type="button"
            className={analyticsReady ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setActiveScreen('analytics')}
          >
            {analyticsReady ? 'View Performance Scorecard' : 'Open Scorecard'}
          </button>
        ) : null}
      </div>
      {analyticsReady ? (
        <div className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="card-kicker">Measurement ready</div>
            <p className="card-body" style={{ margin: '4px 0 0' }}>
              Analytics connectors are active — review GSC + Meta on the Performance Scorecard.
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('analytics')}>
            Go to Scorecard
          </button>
        </div>
      ) : null}
      <div className="card" style={{ padding: '16px' }}>
        <div className="card-kicker">Provider webhooks</div>
        <p className="card-body" style={{ margin: '4px 0 12px' }}>
          Generate a private callback URL for a connected provider. Secrets are workspace-scoped and never shared as Railway environment variables.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={webhookProvider} onChange={event => setWebhookProvider(event.target.value)} style={{ minWidth: 180 }}>
            <option value="">Choose provider</option>
            {connectors.filter(item => ['apollo', 'instantly', 'heyreach', 'whatsapp'].includes(item.id)).map(item => (
              <option key={item.id} value={item.id}>{item.name || item.id}</option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary" onClick={rotateWebhook} disabled={!webhookProvider || webhookBusy}>
            {webhookBusy ? 'Working...' : 'Generate / rotate endpoint'}
          </button>
        </div>
        {webhookNotice ? <p className="text-muted" role="status" style={{ margin: '10px 0 0', fontSize: 12 }}>{webhookNotice}</p> : null}
        {webhookEndpoints.length > 0 ? (
          <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
            {webhookEndpoints.map(endpoint => (
              <div key={endpoint.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
                <div>
                  <strong>{endpoint.provider}</strong>
                  <div className="text-muted" style={{ fontSize: 11, wordBreak: 'break-all' }}>{endpoint.endpointUrl}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(endpoint.endpointUrl)}>Copy URL</button>
                  <button type="button" className="btn btn-ghost" onClick={() => revealWebhook(endpoint.id)}>Copy secret</button>
                  <button type="button" className="btn btn-ghost" onClick={() => revokeWebhook(endpoint.id)} disabled={webhookBusy}>Revoke</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr><th>Platform</th><th>Active Account / ID</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {connectors.map((ing) => {
                const active = isConnectorActive(ing);
                const isConnecting = connectingId === ing.id;
                const meta = CONNECTOR_DISPLAY[ing.id] || { bg: 'var(--color-accent)' };
                const accountVal = getAccountValueForConnector(ing.id);

                return (
                  <tr key={ing.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="tag" style={{ background: meta.bg, color: '#fff', fontWeight: 700, border: 'none' }}>
                          {ing.id.toUpperCase()}
                        </span>
                        <span style={{ fontWeight: 700 }}>{ing.name || connectorLabel(ing.id)}</span>
                      </div>
                    </td>
                    <td>
                      {active ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--color-text)' }}>
                            {accountVal || 'No account selected'}
                          </span>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setPickerConnectorId(ing.id)}
                            style={{ padding: '2px 6px', fontSize: '10px', textDecoration: 'underline' }}
                          >
                            Configure
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted" style={{ fontSize: '11px' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={active ? 'tag tag-accent' : 'tag tag-neutral'}>
                        {active ? 'Active' : 'Not Connected'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className={active ? 'btn btn-secondary' : 'btn btn-primary'}
                          onClick={() => handleConnect(ing.id)}
                          disabled={isConnecting}
                          style={{ padding: '6px 12px', fontSize: '11px' }}
                        >
                          {isConnecting ? 'Connecting...' : active ? 'Reconnect' : 'Connect'}
                        </button>
                        {active && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setPickerConnectorId(ing.id)}
                            style={{ padding: '6px 10px', fontSize: '11px' }}
                          >
                            Select Account
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {pickerConnectorId && (
        <ResourcePickerModal
          connectorId={pickerConnectorId}
          companyId={workspaceId}
          onClose={() => setPickerConnectorId(null)}
          onSaved={() => {
            fetchPreferences();
            setPickerConnectorId(null);
          }}
        />
      )}
    </div>
  );
}
