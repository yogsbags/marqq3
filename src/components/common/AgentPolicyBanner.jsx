import React, { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch.js';
import { getActiveWorkspaceId } from '../../lib/workspace.js';
import { connectorLabel, connectorNeedsResourcePicker } from '../../lib/connectormeta.js';

const LABELS = { draft_safe: 'Draft-safe', live_drafts: 'Live drafts', live_publish: 'Live publish' };

const CONNECTOR_FIELDS = {
  google_ads: 'google_ads_customer_id',
  meta_ads: 'meta_ads_account_id',
  linkedin_ads: 'linkedin_ads_account_id',
  ga4: 'ga4_property_id',
  gsc: 'gsc_site_url',
  facebook: 'facebook_page_id',
  instagram: 'instagram_account_id',
  google_sheets: 'google_sheets_spreadsheet_id',
  google_docs: 'google_docs_document_id',
  google_drive: 'google_drive_folder_id',
  github: 'github_repository',
  hubspot: 'hubspot_account_id',
  salesforce: 'salesforce_account_id',
};

export default function AgentPolicyBanner({ destination = 'connected destination', connectorIds = [], setActiveScreen }) {
  const [policy, setPolicy] = useState(null);
  const [selectedDestination, setSelectedDestination] = useState('');
  useEffect(() => {
    let active = true;
    const workspaceId = getActiveWorkspaceId();
    Promise.all([
      apiFetch(`/api/agent-os?workspaceId=${encodeURIComponent(workspaceId)}`).then((res) => (res.ok ? res.json() : null)),
      apiFetch(`/api/integrations/preferences?companyId=${encodeURIComponent(workspaceId)}`).then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([modeData, prefData]) => {
        if (!active) return;
        setPolicy(modeData?.agentOs || modeData?.profile || modeData);
        const prefs = prefData?.preferences || {};
        const ids = Array.isArray(connectorIds) ? connectorIds : [];
        const pickerIds = ids.filter((id) => connectorNeedsResourcePicker(id));
        const relevant = pickerIds
          .map((id) => ({ id, value: prefs[CONNECTOR_FIELDS[id]] }))
          .filter((item) => item.value);
        if (relevant.length) {
          setSelectedDestination(relevant.map((item) => `${connectorLabel(item.id)}: ${item.value}`).join(' · '));
        } else if (!ids.length) {
          const keys = Object.keys(prefs).filter((key) => /account|property|site|spreadsheet|portal/i.test(key) && prefs[key]);
          if (keys.length) setSelectedDestination(String(prefs[keys[0]]));
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [connectorIds]);
  const mode = policy?.actionMode || policy?.action_mode || 'draft_safe';
  const live = mode === 'live_publish';
  const target = selectedDestination ? `${destination} · selected ${selectedDestination}` : destination;
  return <div className={`policy-summary${live ? ' policy-summary-live' : ''}`} role="status" aria-live="polite">
    {live ? <AlertTriangle size={16} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
    <div style={{ minWidth: 0, flex: 1 }}><strong>Workspace action policy: {LABELS[mode] || 'Draft-safe'}</strong>
      <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>{live ? `Live actions can affect ${target}. Confirm the selected account and final preview before continuing.` : `This action will not publish or send to ${target}.`}</div>
    </div>
    {connectorIds.some((id) => connectorNeedsResourcePicker(id)) && !selectedDestination && setActiveScreen ? (
      <button type="button" className="btn btn-secondary" style={{ fontSize: 11, flex: 'none' }} onClick={() => setActiveScreen('integrations')}>
        Configure destination
      </button>
    ) : null}
  </div>;
}
