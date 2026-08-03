import React, { useState } from 'react';
import { Search, Bell, CheckCircle, ChevronDown, User, Shield, CreditCard, LogOut } from 'lucide-react';

export default function Header({
  activeScreen,
  setActiveScreen,
  setActiveModal,
  approvalsCount = 0,
  credits = 1790
}) {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const pendingApprovalsCount = approvalsCount || 3;

  return (
    <header style={{
      height: '56px',
      background: 'var(--color-bg)',
      borderBottom: '2px solid var(--color-divider)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      {/* Left: Workspace Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          className="btn btn-secondary"
          style={{ border: '1px solid var(--color-divider)', padding: '5px 10px', fontSize: '13px', borderRadius: '0px' }}
          onClick={() => setActiveModal('workspace')}
        >
          <span style={{ fontWeight: 800 }}>Elevate</span>
          <ChevronDown size={14} style={{ opacity: 0.7 }} />
        </button>
      </div>

      {/* Center: Global Search Bar */}
      <div style={{ flex: 1, maxWidth: '420px', margin: '0 20px' }}>
        <div
          onClick={() => setShowSearchModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-divider)',
            padding: '6px 12px',
            borderRadius: '0px',
            cursor: 'pointer',
            fontSize: '13px',
            color: 'var(--color-muted)'
          }}
        >
          <Search size={14} />
          <span>Search campaigns, agents, content, accounts...</span>
        </div>
      </div>

      {/* Right: Credits, Approvals, Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Credit Counter Badge */}
        <div
          onClick={() => setActiveScreen('billing')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-divider)',
            padding: '5px 10px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            borderRadius: '0px'
          }}
        >
          <span style={{ color: 'var(--color-accent)' }}>⚡ {credits.toLocaleString()} credits</span>
        </div>

        {/* Approvals Quick Gate Button */}
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          title="Pending Approvals"
          onClick={() => setActiveScreen('approvals')}
          style={{ position: 'relative', borderRadius: '0px' }}
        >
          <CheckCircle size={16} />
          {pendingApprovalsCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              background: 'var(--color-accent)',
              color: 'var(--color-bg)',
              fontSize: '9px',
              fontWeight: 800,
              width: '15px',
              height: '15px',
              borderRadius: '0px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {pendingApprovalsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-icon"
          title="Notifications"
          onClick={() => setShowNotifications(!showNotifications)}
          style={{ borderRadius: '0px' }}
        >
          <Bell size={16} />
        </button>

        {/* Profile Avatar & Menu — 0px Sharp Square */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              background: 'var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              color: 'var(--color-bg)',
              fontSize: '12px',
              borderRadius: '0px',
              cursor: 'pointer'
            }}
            onClick={() => setShowProfileMenu(!showProfileMenu)}
          >
            SC
          </div>

          {showProfileMenu && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '40px',
              width: '200px',
              background: 'var(--color-surface)',
              border: '2px solid var(--color-divider)',
              borderRadius: '0px',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 100,
              padding: '6px 0'
            }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-divider)' }}>
                <div style={{ fontWeight: 800, fontSize: '13px' }}>Sarah Cole</div>
                <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>CMO · Workspace Owner</div>
              </div>
              <div
                style={{ padding: '8px 12px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={() => { setActiveScreen('admin'); setShowProfileMenu(false); }}
              >
                <Shield size={14} /> Admin &amp; Security
              </div>
              <div
                style={{ padding: '8px 12px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={() => { setActiveScreen('billing'); setShowProfileMenu(false); }}
              >
                <CreditCard size={14} /> Billing &amp; Usage
              </div>
              <div
                style={{ padding: '8px 12px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent-2)' }}
                onClick={() => { setActiveScreen('login'); setShowProfileMenu(false); }}
              >
                <LogOut size={14} /> Sign out
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Global Search Modal */}
      {showSearchModal && (
        <div className="modal-overlay" onClick={() => setShowSearchModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ borderRadius: '0px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--color-divider)', paddingBottom: '10px' }}>
              <Search size={16} />
              <input
                className="input"
                autoFocus
                placeholder="Type to search workspace..."
                style={{ border: 'none', background: 'transparent', fontSize: '14px', borderRadius: '0px' }}
              />
            </div>
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div className="text-muted" style={{ fontSize: '11px', textTransform: 'uppercase' }}>Quick Jump</div>
              <div onClick={() => { setActiveScreen('command'); setShowSearchModal(false); }} style={{ padding: '8px 12px', background: 'var(--color-bg)', borderRadius: '0px', cursor: 'pointer' }}>⚡ Go to Command Center</div>
              <div onClick={() => { setActiveScreen('gtmwizard'); setShowSearchModal(false); }} style={{ padding: '8px 12px', background: 'var(--color-bg)', borderRadius: '0px', cursor: 'pointer' }}>🚀 Launch GTM Strategy Wizard</div>
              <div onClick={() => { setActiveScreen('outreach'); setShowSearchModal(false); }} style={{ padding: '8px 12px', background: 'var(--color-bg)', borderRadius: '0px', cursor: 'pointer' }}>✉️ Open Outreach Prospecting Studio</div>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Drawer */}
      {showNotifications && (
        <div style={{
          position: 'absolute',
          right: '50px',
          top: '60px',
          width: '320px',
          background: 'var(--color-surface)',
          border: '2px solid var(--color-divider)',
          borderRadius: '0px',
          padding: '12px',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 100
        }}>
          <div style={{ fontWeight: 800, fontSize: '14px', marginBottom: '8px', borderBottom: '1px solid var(--color-divider)', paddingBottom: '6px' }}>
            Notifications &amp; Agent Alerts
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
            <div style={{ padding: '8px', background: 'var(--color-bg)', borderRadius: '0px' }}>
              <strong style={{ color: 'var(--color-accent)' }}>Dev Agent:</strong> Drafted budget reallocation ($12K shift).
            </div>
            <div style={{ padding: '8px', background: 'var(--color-bg)', borderRadius: '0px' }}>
              <strong style={{ color: 'var(--color-accent-2)' }}>Google Ads:</strong> Account sync error — token expired.
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
