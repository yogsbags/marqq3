import React, { useState, useEffect } from 'react';
import { X, Check, Loader2, Database, Sliders, CheckCircle2 } from 'lucide-react';
import { CONNECTOR_DISPLAY, connectorLabel } from '../../lib/connectormeta';
import { getActiveWorkspaceId } from '../../lib/workspace.js';

const CONNECTOR_ACCOUNT_CONFIGS = {
  google_ads: {
    title: 'Configure Google Ads Account',
    field: 'google_ads_customer_id',
    placeholder: '842-192-3841',
    description: 'Enter your 10-digit Google Ads Customer ID to authorize campaign management.',
    helpText: 'Found in the top right corner of your Google Ads manager dashboard (format: XXX-XXX-XXXX).'
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
  gsc: {
    title: 'Configure Search Console Domain',
    field: 'gsc_site_url',
    placeholder: 'https://yourdomain.com',
    description: 'Enter your verified Google Search Console site domain for rank monitoring.',
    helpText: 'Enter full domain with https:// or sc-domain:yourdomain.com.'
  },
  google_sheets: {
    title: 'Configure Google Spreadsheet',
    field: 'google_sheets_spreadsheet_id',
    placeholder: '1VcoUynWArCt6RaKdSHfOfb0pPka3nPd0AzA28NeKAxk',
    description: 'Enter the spreadsheet ID used for lead capture / ops tables (from Marqq2).',
    helpText: 'From the Sheet URL: docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit'
  },
  google_drive: {
    title: 'Configure Google Drive Folder (optional)',
    field: 'google_drive_folder_id',
    placeholder: 'root or folder ID',
    description: 'Optional default Drive folder for asset uploads and report delivery.',
    helpText: 'Leave blank to use Drive root; folder ID is in the Drive URL after /folders/.'
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
  const config = CONNECTOR_ACCOUNT_CONFIGS[connectorId] || {
    title: `Configure ${connectorLabel(connectorId)} Account`,
    field: `${connectorId}_account_id`,
    placeholder: 'Enter Account ID',
    description: `Enter the target account ID for ${connectorLabel(connectorId)}.`,
    helpText: 'Enter the account identifier provided by your platform dashboard.'
  };

  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/integrations/preferences?companyId=${encodeURIComponent(companyId)}`)
      .then(r => r.json())
      .then(data => {
        const saved = data?.preferences?.[config.field];
        if (saved) {
          setAccountId(saved);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [connectorId, companyId]);

  const handleSave = async () => {
    const valueToSave = accountId.trim();
    if (!valueToSave) return;

    setSaving(true);
    try {
      await fetch('/api/integrations/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          [config.field]: valueToSave
        })
      });
      onSaved?.(connectorId, valueToSave);
      onClose();
    } catch (err) {
      console.warn('Preference save failed:', err);
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
          <button type="button" className="btn btn-ghost" onClick={onClose} style={{ padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: '8px', color: 'var(--color-text-muted)' }}>
              <Loader2 size={16} className="spin" />
              <span style={{ fontSize: '12px' }}>Loading configuration...</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div className="field">
                <label style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  Target Account / Property ID
                </label>
                <input
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
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 20px', borderTop: '1px solid var(--color-divider)', background: 'rgba(255,255,255,0.02)' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving} style={{ fontSize: '12px' }}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || !accountId.trim()} style={{ fontSize: '12px' }}>
            {saving ? 'Saving...' : 'Save Account'}
          </button>
        </div>

      </div>
    </div>
  );
}
