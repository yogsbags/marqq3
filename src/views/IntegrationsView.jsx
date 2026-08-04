import React, { useState, useEffect } from 'react';
import { connectComposioConnector, formatConnectorError } from '../lib/composio';
import { CONNECTOR_DISPLAY, isConnectorActive, connectorLabel } from '../lib/connectormeta';
import { ResourcePickerModal } from '../components/common/ResourcePickerModal';
import { getActiveWorkspaceId } from '../lib/workspace.js';

export function IntegrationsView({ setActiveScreen }) {
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

  const fetchPreferences = () => {
    fetch(`/api/integrations/preferences?companyId=${encodeURIComponent(getActiveWorkspaceId())}`)
      .then(r => r.json())
      .then(data => {
        if (data?.preferences) {
          setPreferences(data.preferences);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetch(`/api/integrations?companyId=${encodeURIComponent(getActiveWorkspaceId())}`)
      .then(r => r.json())
      .then(data => {
        if (data?.connectors && data.connectors.length > 0) {
          setConnectors(data.connectors);
        }
      })
      .catch(() => {});

    fetchPreferences();
  }, []);

  const handleConnect = async (connectorId) => {
    setConnectingId(connectorId);
    setConnectError('');
    try {
      const res = await connectComposioConnector({
        companyId: getActiveWorkspaceId(),
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
      salesforce: 'salesforce_account_id',
      hubspot: 'hubspot_account_id'
    };
    const field = fieldMap[id] || `${id}_account_id`;
    return preferences[field] || null;
  };

  const analyticsReady = connectors.some(
    (c) => isConnectorActive(c) && ['ga4', 'gsc', 'meta_ads', 'google_ads', 'google_sheets'].includes(c.id)
  );

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
          companyId={getActiveWorkspaceId()}
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
