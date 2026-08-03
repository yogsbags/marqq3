import React, { useState } from 'react';
import { Search, Bell, CheckCircle, ChevronDown, Shield, CreditCard, LogOut } from 'lucide-react';
import { getCompanyName } from '../../lib/liveWorkspace';
import NotificationsPanel from '../notifications/NotificationsPanel.jsx';

export default function Header({
  activeScreen,
  setActiveScreen,
  setActiveModal,
  onLogout,
  approvalsCount = 0,
  credits = null,
  userName = '',
  userEmail = '',
}) {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const pendingApprovalsCount = Number(approvalsCount) || 0;
  const workspaceName = getCompanyName();
  const displayName = String(userName || '').trim() || workspaceName || 'Workspace owner';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || 'M';

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ border: '1px solid var(--color-divider)', padding: '5px 10px', fontSize: '13px', borderRadius: '0px' }}
          onClick={() => setActiveModal && setActiveModal('workspace')}
        >
          <span style={{ fontWeight: 800 }}>{workspaceName}</span>
          <ChevronDown size={14} style={{ opacity: 0.7 }} />
        </button>
      </div>

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

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
          <span style={{ color: 'var(--color-accent)' }}>
            {credits != null ? `⚡ ${Number(credits).toLocaleString()} credits` : '⚡ Usage unmetered'}
          </span>
        </div>

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
          style={{ position: 'relative', borderRadius: '0px' }}
        >
          <Bell size={16} />
          {unreadNotifications > 0 && (
            <span style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              background: 'var(--color-accent)',
              color: 'var(--color-bg)',
              fontSize: '9px',
              fontWeight: 800,
              minWidth: '15px',
              height: '15px',
              padding: '0 3px',
              borderRadius: '0px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {unreadNotifications > 99 ? '99+' : unreadNotifications}
            </span>
          )}
        </button>

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
            {initials}
          </div>

          {showProfileMenu && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '40px',
              width: '220px',
              background: 'var(--color-surface)',
              border: '2px solid var(--color-divider)',
              borderRadius: '0px',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 100,
              padding: '6px 0'
            }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-divider)' }}>
                <div style={{ fontWeight: 800, fontSize: '13px' }}>{displayName}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                  {userEmail || 'Workspace owner'}
                </div>
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
                onClick={() => {
                  setShowProfileMenu(false);
                  if (onLogout) onLogout();
                  else setActiveScreen('login');
                }}
              >
                <LogOut size={14} /> Sign out
              </div>
            </div>
          )}
        </div>
      </div>

      <NotificationsPanel
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        onScreenSelect={setActiveScreen}
        onUnreadCountChange={setUnreadNotifications}
      />

      {showSearchModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80
          }}
          onClick={() => setShowSearchModal(false)}
        >
          <div className="card" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
            <input className="input" autoFocus placeholder="Type to search workspace..." />
          </div>
        </div>
      )}
    </header>
  );
}
