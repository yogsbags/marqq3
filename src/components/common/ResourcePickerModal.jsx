import React, { useState, useEffect } from 'react';
import { X, Check, Database, Sliders, CheckCircle2 } from 'lucide-react';
import { CONNECTOR_DISPLAY, connectorLabel, connectorNeedsResourcePicker } from '../../lib/connectormeta';
import { getActiveWorkspaceId } from '../../lib/workspace.js';
import { LoadingState } from './AsyncState.jsx';
import { apiFetch } from '../../lib/apiFetch.js';

const CONNECTOR_ACCOUNT_CONFIGS = {
  google_ads: {
    title: 'Configure Google Ads Account',
    field: 'google_ads_customer_id',
    placeholder: '842-192-3841',
    description: 'Enter your 10-digit Google Ads Customer ID to authorize campaign management.',
    helpText: 'Found in the top right corner of your Google Ads manager dashboard (format: XXX-XXX-XXXX).'
  },
  gsc: {
    title: 'Configure Search Console Site',
    field: 'gsc_site_url',
    placeholder: 'https://yourdomain.com',
    description: 'Select the verified Search Console site used for SEO reporting.',
    helpText: 'Sites can be selected from your connected Google account or entered as a full URL.'
  },
  meta_ads: {
    title: 'Configure Meta Ad Account',
    field: 'meta_ads_account_id',
    placeholder: 'act_492019482',
    description: 'Enter your Meta Business Ad Account ID for Facebook & Instagram campaigns.',
    helpText: 'Found under Meta Business Settings → Ad Accounts (format: act_XXXXXXXXX).'
  },
  linkedin_ads: {
    title: 'Configure LinkedIn Ad Account',
    field: 'linkedin_ads_account_id',
    placeholder: '503920194',
    description: 'Enter your LinkedIn Campaign Manager Account ID for B2B targeting.',
    helpText: 'Found in the upper left account switcher of Campaign Manager (format: 9-digit number).'
  },
  ga4: {
    title: 'Configure GA4 Analytics Property',
    field: 'ga4_property_id',
    placeholder: 'properties/392019481',
    description: 'Enter your Google Analytics 4 Property ID to track website funnel events.',
    helpText: 'Found in GA4 Admin → Property Settings (format: properties/XXXXXXXXX or numeric ID).'
  },
  facebook: {
    title: 'Configure Facebook Page',
    field: 'facebook_page_id',
    placeholder: 'Page ID',
    description: 'Select the Facebook Page used for publishing and page insights.',
    helpText: 'Only Facebook Pages are supported; personal profiles are not selectable.'
  },
  instagram: {
    title: 'Configure Instagram Account',
    field: 'instagram_account_id',
    placeholder: 'Instagram account ID',
    description: 'Select the connected Instagram Business or Creator account.',
    helpText: 'Personal Instagram accounts are not supported by the connected toolkit.'
  },
  google_sheets: {
    title: 'Configure Google Spreadsheet',
    field: 'google_sheets_spreadsheet_id',
    placeholder: '1VcoUynWArCt6RaKdSHfOfb0pPka3nPd0AzA28NeKAxk',
    description: 'Enter the spreadsheet ID used for lead capture / ops tables (from Marqq2).',
    helpText: 'From the Sheet URL: docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit'
  },
  google_docs: {
    title: 'Configure Google Doc',
    field: 'google_docs_document_id',
    placeholder: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
    description: 'Select the Google Doc used for briefs, reports, or document delivery.',
    helpText: 'From the Doc URL: docs.google.com/document/d/<DOCUMENT_ID>/edit'
  },
  github: {
    title: 'Configure GitHub Repository',
    field: 'github_repository',
    placeholder: 'owner/repository',
    description: 'Select the GitHub repository used for issues, code, and deployment workflows.',
    helpText: 'Choose a detected repository or enter it manually as owner/repository.'
  },
  supabase: {
    title: 'Configure Supabase Project',
    field: 'supabase_project_ref',
    placeholder: 'abcdefghijklmnopqrst',
    description: 'Select the Supabase project Marqq should use for product analytics.',
    helpText: 'Choose a detected project. Marqq reads schema and aggregate analytics only.'
  },
  firebase: {
    title: 'Configure Firebase Project',
    field: 'firebase_project_id',
    placeholder: 'your-firebase-project-id',
    description: 'Select the Firebase project Marqq should use for product analytics.',
    helpText: 'Choose a detected project or enter the Firebase project ID.'
  },
  appstore_connect: {
    title: 'Configure App Store App',
    field: 'appstore_connect_app_id',
    placeholder: '1234567890',
    description: 'Select the App Store app Marqq should use for App Store analytics.',
    helpText: 'Choose a detected app or enter its App Store Connect app ID.'
  },
  google_play_console: {
    title: 'Configure Google Play App',
    field: 'google_play_package_name',
    placeholder: 'com.example.app',
    description: 'Set the Android package name Marqq should use for Play reporting.',
    helpText: 'Google Play enumeration is not available yet; enter the exact package name.'
  },
  revenuecat: {
    title: 'Configure RevenueCat Project',
    field: 'revenuecat_project_id',
    placeholder: 'RevenueCat project ID',
    description: 'Set the RevenueCat project Marqq should use for subscription analytics.',
    helpText: 'RevenueCat project discovery is not available yet; enter the project ID.'
  },
  google_drive: {
    title: 'Configure Google Drive Folder (optional)',
    field: 'google_drive_folder_id',
    placeholder: 'root or folder ID',
    description: 'Optional default Drive folder for asset uploads and report delivery.',
    helpText: 'Leave blank to use Drive root; folder ID is in the Drive URL after /folders/.',
    allowBlank: true,
  },
  salesforce: {
    title: 'Configure Salesforce CRM Instance',
    field: 'salesforce_account_id',
    placeholder: '00D5e0000014abc',
    description: 'Enter your Salesforce Organization ID or Account ID for CRM deal sync.',
    helpText: 'Found in Salesforce Setup → Company Information → Salesforce Organization ID.'
  },
  hubspot: {
    title: 'Configure HubSpot Portal ID',
    field: 'hubspot_account_id',
    placeholder: '29401928',
    description: 'Enter your HubSpot Hub ID for lead scoring & CRM sync.',
    helpText: 'Found in the upper right profile menu in HubSpot (format: 7 or 8-digit Hub ID).'
  }
};

export function ResourcePickerModal({ connectorId, companyId = getActiveWorkspaceId(), onClose, onSaved }) {
  const known = CONNECTOR_ACCOUNT_CONFIGS[connectorId];
  // API-key connectors (Apollo, Instantly, Gmail, …) have no extra account ID.
  // Never fall through to the generic "Configure {Name} Account" dialog.
  const allowed = Boolean(known) || connectorNeedsResourcePicker(connectorId);
  const config = known || {
    title: '',
    field: `${connectorId}_account_id`,
    placeholder: '',
    description: '',
    helpText: '',
  };

  const [accountId, setAccountId] = useState('');
  const [resources, setResources] = useState([]);
  const [resourceError, setResourceError] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!allowed) onClose?.();
  }, [allowed, onClose]);

  useEffect(() => {
    if (!allowed) return undefined;
    let hints = {};
    try {
      hints = JSON.parse(localStorage.getItem(`marqq_mobile_app_hints_${companyId}`) || '{}');
    } catch { /* ignore malformed convenience hints */ }
    setDiscovering(true);
    setResourceError('');
    apiFetch(`/api/integrations/resources?companyId=${encodeURIComponent(companyId)}&connectorId=${encodeURIComponent(connectorId)}`)
      .then(r => r.json().catch(() => ({})))
      .then(data => {
        const found = Array.isArray(data?.resources) ? data.resources : [];
        setResources(found);
        if (data?.error && !found.length && data?.supported) setResourceError(data.error);
      })
      .catch(() => setResourceError('Could not detect available accounts.'))
      .finally(() => setDiscovering(false));

    apiFetch(`/api/integrations/preferences?companyId=${encodeURIComponent(companyId)}`)
      .then(r => r.json())
      .then(data => {
        const saved = data?.preferences?.[config.field];
        const suggested = config.field === 'firebase_project_id'
          ? hints.firebaseProjectId
          : config.field === 'google_play_package_name'
            ? hints.googlePlayPackageName
            : config.field === 'appstore_connect_app_id'
              ? hints.appstoreConnectAppId
              : '';
        setAccountId(saved || suggested || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [allowed, connectorId, companyId, config.field]);

  if (!allowed) return null;

  const handleSave = async () => {
    const valueToSave = accountId.trim();
    if (!valueToSave && !config.allowBlank) return;

    setSaving(true);
    try {
      const response = await apiFetch('/api/integrations/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          [config.field]: valueToSave
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) throw new Error(result.error || 'Could not save account selection');
      onSaved?.(connectorId, valueToSave);
      onClose();
    } catch (err) {
      setResourceError(err.message || 'Could not save account selection');
    } finally {
      setSaving(false);
    }
  };

  const meta = CONNECTOR_DISPLAY[connectorId] || { bg: 'var(--color-accent)' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', padding: '16px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '480px', background: '#141210', border: '1px solid var(--color-divider)', boxShadow: '0 20px 40px rgba(0,0,0,0.8)', borderRadius: '0px', padding: '0', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-divider)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '28px', height: '28px', background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0px', color: '#fff', fontWeight: 800, fontSize: '11px' }}>
              {connectorId.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>{config.title}</div>
              <div className="text-muted" style={{ fontSize: '11px', marginTop: '1px' }}>{config.description}</div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost" aria-label="Close account selector" onClick={onClose} style={{ padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          {loading ? (
            <LoadingState label="Loading connector configuration…" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {resources.length > 0 ? (
                <div className="field">
                  <label htmlFor="detected-resource" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                    Select detected {connectorLabel(connectorId).toLowerCase()} account or property
                  </label>
                  <select
                    id="detected-resource"
                    className="input resource-picker-select"
                    value={resources.some((resource) => resource.id === accountId) ? accountId : ''}
                    onChange={(e) => setAccountId(e.target.value)}
                    disabled={discovering}
                    style={{ width: '100%', fontSize: '13px', colorScheme: 'dark' }}
                  >
                    <option value="">Choose an account or property…</option>
                    {resources.map((resource) => (
                      <option key={resource.id} value={resource.id}>
                        {resource.name} · {resource.id}
                      </option>
                    ))}
                  </select>
                  <p className="text-muted" style={{ fontSize: '11px', marginTop: '6px', lineHeight: 1.4 }}>
                    Detected from the connected {connectorLabel(connectorId)} account. Marqq will use the selected destination for this workspace.
                  </p>
                </div>
              ) : null}

              <div className="field">
                <label htmlFor="manual-resource-id" style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  {resources.length ? 'Or enter an ID manually' : 'Target Account / Property ID'}
                </label>
                <input
                  id="manual-resource-id"
                  type="text"
                  className="input"
                  placeholder={config.placeholder}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: '13px' }}
                />
                {config.helpText && (
                  <p className="text-muted" style={{ fontSize: '11px', marginTop: '6px', lineHeight: 1.4 }}>
                    {config.helpText}
                  </p>
                )}
                {discovering ? <p className="text-muted" style={{ fontSize: '11px', marginTop: '6px' }}>Detecting available accounts…</p> : null}
                {resourceError ? <p className="text-muted" style={{ fontSize: '11px', marginTop: '6px', color: 'var(--color-accent)' }}>Detection unavailable — manual ID is still supported.</p> : null}
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 20px', borderTop: '1px solid var(--color-divider)', background: 'rgba(255,255,255,0.02)' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving} style={{ fontSize: '12px' }}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || (!config.allowBlank && !accountId.trim())} style={{ fontSize: '12px' }}>
            {saving ? 'Saving...' : 'Save Account'}
          </button>
        </div>

      </div>
    </div>
  );
}
