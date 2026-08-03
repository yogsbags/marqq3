import React from 'react';

const navConfig = [
  { name: 'Operate', items: [{ id: 'command', label: 'Command Center' }, { id: 'chat', label: 'Ask Marqq' }, { id: 'orchestration', label: 'Orchestration' }, { id: 'approvals', label: 'Approvals' }] },
  { name: 'Plan & Create', items: [{ id: 'gtmwizard', label: 'GTM Wizard' }, { id: 'strategy', label: 'Strategy' }, { id: 'ideas', label: 'Marketing Ideas' }, { id: 'pricing', label: 'Pricing' }, { id: 'campaigns', label: 'Campaigns' }, { id: 'content', label: 'Content' }, { id: 'calendar', label: 'Calendar' }, { id: 'landingpages', label: 'Landing Pages' }, { id: 'leadmagnets', label: 'Lead Magnets' }] },
  { name: 'Intelligence', items: [{ id: 'agents', label: 'Agents' }, { id: 'market', label: 'Market Intelligence' }, { id: 'audiences', label: 'Audiences' }, { id: 'brand', label: 'Brand Center' }, { id: 'seo', label: 'SEO' }, { id: 'analytics', label: 'Analytics' }] },
  { name: 'Execution', items: [{ id: 'crm', label: 'CRM Sync' }, { id: 'customer360', label: 'Customer 360' }, { id: 'outreach', label: 'Outreach Studio' }, { id: 'paid', label: 'Paid Media' }, { id: 'social', label: 'Social Media' }, { id: 'creative', label: 'Creative Studio' }, { id: 'voicebot', label: 'Voice & Video Bot' }] },
  { name: 'Grow', items: [{ id: 'experiments', label: 'Experiments' }, { id: 'reporting', label: 'Reporting' }, { id: 'referrals', label: 'Referral Programs' }] },
  { name: 'System', items: [{ id: 'workflows', label: 'Workflows' }, { id: 'tasks', label: 'Tasks' }, { id: 'evaluations', label: 'Evaluations' }, { id: 'knowledge', label: 'Knowledge Base' }, { id: 'files', label: 'Workspace Files' }, { id: 'integrations', label: 'Integrations' }, { id: 'billing', label: 'Billing' }, { id: 'admin', label: 'Administration' }, { id: 'help', label: 'Help & Support' }] },
  { name: 'Setup', items: [{ id: 'onboarding', label: 'Onboarding Wizard' }] }
];

export default function Sidebar({ activeScreen, setActiveScreen, onOpenModal }) {
  return (
    <aside style={{
      width: '232px',
      flex: 'none',
      borderRight: '2px solid var(--color-divider)',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 14px',
      gap: '26px',
      overflowY: 'auto',
      background: 'var(--color-bg)'
    }}>
      {/* Brand Header */}
      <div style={{
        fontFamily: 'var(--font-heading)',
        fontWeight: 800,
        fontSize: '21px',
        letterSpacing: '-0.02em',
        padding: '0 6px',
        cursor: 'pointer'
      }} onClick={() => setActiveScreen('command')}>
        MARQQ<span style={{ color: 'var(--color-accent)' }}>.</span>
      </div>

      {/* Navigation Groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {navConfig.map((grp) => (
          <div key={grp.name} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <div style={{
              fontSize: '10px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              opacity: 0.5,
              margin: '0 0 6px 8px',
              fontWeight: 700
            }}>
              {grp.name}
            </div>
            {grp.items.map((item) => {
              const isActive = activeScreen === item.id ||
                (activeScreen === 'campaign-detail' && item.id === 'campaigns') ||
                (activeScreen === 'agent-detail' && item.id === 'agents');

              return (
                <div
                  key={item.id}
                  onClick={() => setActiveScreen(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '9px',
                    padding: '8px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: isActive ? 'var(--color-accent)' : 'var(--color-text)',
                    background: isActive ? 'rgba(255, 106, 0, 0.08)' : 'transparent',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    flex: 'none',
                    background: isActive ? 'var(--color-accent)' : 'transparent'
                  }} />
                  <span style={{ fontSize: '13px', fontWeight: isActive ? 700 : 400 }}>
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer Workspace Info */}
      <div
        style={{
          marginTop: 'auto',
          padding: '10px 8px',
          borderTop: '2px solid var(--color-divider)',
          paddingTop: '16px',
          cursor: 'pointer'
        }}
        onClick={() => onOpenModal('workspace')}
      >
        <div style={{ fontSize: '11px', opacity: 0.5, marginBottom: '2px' }}>Workspace</div>
        <div style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
          Elevate <span className="text-muted" style={{ fontWeight: 400, fontSize: '11px' }}>· + New</span>
        </div>
      </div>
    </aside>
  );
}
