/**
 * Notifications panel — Marqq2 parity (AI Team + Competitor alerts via Supabase).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  X,
  CheckCircle,
  AlertTriangle,
  Info,
  TrendingUp,
  DollarSign,
  Trash2,
  Settings,
  Newspaper,
  Rocket,
  Handshake,
  UserPlus,
  ExternalLink,
  Shield,
} from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { getActiveWorkspaceId } from '../../lib/workspace.js';
import CofounderDigestCard from './CofounderDigestCard.jsx';

const AGENT_COLOURS = {
  zara: { bg: '#e0e7ff', fg: '#3730a3' },
  maya: { bg: '#dbeafe', fg: '#1e40af' },
  riya: { bg: '#f3e8ff', fg: '#6b21a8' },
  arjun: { bg: '#dcfce7', fg: '#166534' },
  dev: { bg: '#ffedd5', fg: '#9a3412' },
  priya: { bg: '#fee2e2', fg: '#991b1b' },
  neel: { bg: '#e0f2fe', fg: '#075985' },
};

const AGENT_INITIALS = {
  zara: 'ZA', maya: 'MA', riya: 'RI', arjun: 'AR', dev: 'DV', priya: 'PR', neel: 'NE',
};

function formatTimeAgo(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return date.toLocaleDateString();
}

function alertTypeIcon(type) {
  switch (type) {
    case 'funding': return <DollarSign size={14} style={{ color: '#22c55e' }} />;
    case 'product_launch': return <Rocket size={14} style={{ color: '#3b82f6' }} />;
    case 'pricing_change': return <DollarSign size={14} style={{ color: '#f97316' }} />;
    case 'acquisition':
    case 'partnership': return <Handshake size={14} style={{ color: '#a855f7' }} />;
    case 'leadership_change': return <UserPlus size={14} style={{ color: '#ec4899' }} />;
    case 'news': return <Newspaper size={14} style={{ color: '#64748b' }} />;
    default: return <Info size={14} style={{ color: '#3b82f6' }} />;
  }
}

export default function NotificationsPanel({
  isOpen,
  onClose,
  onScreenSelect,
  onUnreadCountChange,
}) {
  const workspaceId = getActiveWorkspaceId();
  const [user, setUser] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [agentNotifs, setAgentNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('ai-team');
  const [agentFilter, setAgentFilter] = useState('all');

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUser(data?.session?.user || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (mounted) setUser(session?.user || null);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const fetchAgentNotifications = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from('agent_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (workspaceId && workspaceId !== 'marqq-ws-1') {
      query = query.eq('workspace_id', workspaceId);
    }
    const { data, error } = await query;
    if (!error && data) setAgentNotifs(data);
  }, [user, workspaceId]);

  const fetchAlerts = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    const baseQuery = () =>
      supabase
        .from('competitor_alerts')
        .select('*')
        .eq('user_id', user.id)
        .eq('archived', false)
        .order('created_at', { ascending: false })
        .limit(100);

    try {
      let { data, error } =
        workspaceId && workspaceId !== 'marqq-ws-1'
          ? await baseQuery().eq('workspace_id', workspaceId)
          : await baseQuery();

      if (error?.code === '42703') {
        ({ data, error } = await baseQuery());
      }
      if (error) throw error;
      setAlerts(data || []);
    } catch (err) {
      console.error('[notifications] alerts', err);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [user, workspaceId]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      onUnreadCountChange?.(0);
      return undefined;
    }
    void fetchAlerts();
    void fetchAgentNotifications();

    // Keep unread badge fresh even when panel is closed
    const poll = setInterval(() => {
      void fetchAlerts();
      void fetchAgentNotifications();
    }, 60_000);

    if (!isOpen) {
      return () => clearInterval(poll);
    }

    const agentChannel = supabase
      .channel('agent-notifications-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const next = payload.new;
          if (next.workspace_id && next.workspace_id !== workspaceId) return;
          setAgentNotifs((prev) => [next, ...prev]);
        }
      )
      .subscribe();

    const alertChannel = supabase
      .channel('competitor_alerts_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'competitor_alerts', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const next = payload.new;
          if (next.workspace_id && next.workspace_id !== workspaceId) return;
          setAlerts((prev) => [next, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'competitor_alerts', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const next = payload.new;
          if (next.workspace_id && next.workspace_id !== workspaceId) return;
          setAlerts((prev) => prev.map((a) => (a.id === next.id ? next : a)));
        }
      )
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(agentChannel);
      supabase.removeChannel(alertChannel);
    };
  }, [user, workspaceId, isOpen, fetchAlerts, fetchAgentNotifications, onUnreadCountChange]);

  const unreadCount =
    alerts.filter((a) => !a.read && !a.dismissed).length + agentNotifs.filter((n) => !n.read).length;

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const markAgentRead = async (id) => {
    await supabase.from('agent_notifications').update({ read: true }).eq('id', id);
    setAgentNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAsRead = async (alertId) => {
    await supabase.from('competitor_alerts').update({ read: true }).eq('id', alertId).eq('user_id', user?.id);
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, read: true } : a)));
  };

  const markAsUnread = async (alertId) => {
    await supabase.from('competitor_alerts').update({ read: false }).eq('id', alertId).eq('user_id', user?.id);
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, read: false } : a)));
  };

  const archiveAlert = async (alertId) => {
    await supabase.from('competitor_alerts').update({ archived: true }).eq('id', alertId).eq('user_id', user?.id);
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  const markAllAsRead = async () => {
    const unread = alerts.filter((a) => !a.read).map((a) => a.id);
    if (!unread.length) return;
    await supabase.from('competitor_alerts').update({ read: true }).in('id', unread).eq('user_id', user?.id);
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
  };

  const clearAll = async () => {
    const ids = alerts.map((a) => a.id);
    if (!ids.length) return;
    await supabase.from('competitor_alerts').update({ archived: true }).in('id', ids).eq('user_id', user?.id);
    setAlerts([]);
  };

  if (!isOpen) return null;

  const filteredAlerts = filter === 'unread' ? alerts.filter((a) => !a.read) : alerts;
  const filteredAgentNotifs =
    agentFilter === 'all' ? agentNotifs : agentNotifs.filter((n) => n.agent_name === agentFilter);

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 90 }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          top: 64,
          right: 20,
          width: 420,
          maxWidth: 'calc(100vw - 24px)',
          height: 560,
          maxHeight: 'calc(100vh - 80px)',
          background: 'var(--color-bg)',
          border: '2px solid var(--color-divider)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--color-divider)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, background: 'var(--color-surface)', border: '1px solid var(--color-divider)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bell size={14} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Notifications</div>
              {unreadCount > 0 ? (
                <div className="text-muted" style={{ fontSize: 11 }}>{unreadCount} unread</div>
              ) : null}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-divider)' }}>
          {[
            { id: 'ai-team', label: 'AI Team', count: agentNotifs.filter((n) => !n.read).length },
            { id: 'competitors', label: 'Competitors', count: alerts.filter((a) => !a.read).length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '10px 8px',
                border: 0,
                borderBottom: activeTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
                background: 'transparent',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                color: activeTab === tab.id ? 'var(--color-text)' : 'var(--color-muted)',
              }}
            >
              {tab.label}
              {tab.count > 0 ? (
                <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', background: 'var(--color-surface)', border: '1px solid var(--color-divider)' }}>
                  {tab.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {activeTab === 'competitors' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--color-divider)' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className={filter === 'all' ? 'btn btn-primary' : 'btn btn-ghost'} style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setFilter('all')}>
                All ({alerts.length})
              </button>
              <button type="button" className={filter === 'unread' ? 'btn btn-primary' : 'btn btn-ghost'} style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setFilter('unread')}>
                Unread ({alerts.filter((a) => !a.read).length})
              </button>
            </div>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 11 }} disabled={!alerts.some((a) => !a.read)} onClick={markAllAsRead}>
              Mark all read
            </button>
          </div>
        )}

        {activeTab === 'ai-team' && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '8px 10px', borderBottom: '1px solid var(--color-divider)' }}>
            {['all', 'zara', 'maya', 'riya', 'arjun', 'dev', 'priya', 'neel'].map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setAgentFilter(name)}
                style={{
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'capitalize',
                  border: '1px solid var(--color-divider)',
                  background: agentFilter === name ? 'var(--color-text)' : 'var(--color-surface)',
                  color: agentFilter === name ? 'var(--color-bg)' : 'var(--color-muted)',
                  cursor: 'pointer',
                  borderRadius: 0,
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-muted)' }}>
              <Bell size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
              <div style={{ fontSize: 13 }}>Loading notifications…</div>
            </div>
          ) : !user ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-muted)' }}>
              <Shield size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
              <div style={{ fontSize: 13 }}>Sign in to view notifications</div>
            </div>
          ) : activeTab === 'ai-team' ? (
            <>
              <CofounderDigestCard workspaceId={workspaceId} onOpenScreen={onScreenSelect} compact />
              {!filteredAgentNotifs.length ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-muted)' }}>
                  <Bell size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
                  <div style={{ fontSize: 13 }}>No AI team updates yet</div>
                  <div style={{ fontSize: 11 }}>Scheduled agent runs surface here</div>
                </div>
              ) : (
              filteredAgentNotifs.map((notif) => {
                const colours = AGENT_COLOURS[notif.agent_name] || { bg: '#f1f5f9', fg: '#334155' };
                return (
                  <div
                    key={notif.id}
                    onClick={() => !notif.read && markAgentRead(notif.id)}
                    style={{
                      padding: 10,
                      marginBottom: 6,
                      border: '1px solid var(--color-divider)',
                      background: !notif.read ? 'color-mix(in srgb, var(--color-accent) 6%, transparent)' : 'var(--color-surface)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{
                        width: 28, height: 28, flexShrink: 0,
                        background: colours.bg, color: colours.fg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 800,
                      }}>
                        {AGENT_INITIALS[notif.agent_name] || String(notif.agent_name || 'AG').slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'capitalize' }}>
                            {notif.agent_name}
                            {notif.agent_role ? <span className="text-muted" style={{ fontWeight: 500 }}> · {notif.agent_role}</span> : null}
                          </span>
                          <span className="text-muted" style={{ fontSize: 11 }}>{formatTimeAgo(notif.created_at)}</span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: !notif.read ? 700 : 600, marginTop: 2 }}>{notif.title}</div>
                        <div className="text-muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>{notif.summary}</div>
                        {Array.isArray(notif.action_items) && notif.action_items.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                            {notif.action_items.slice(0, 3).map((item, i) => (
                              <button
                                key={i}
                                type="button"
                                className="btn btn-ghost"
                                style={{ fontSize: 10, padding: '2px 6px' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (item.url && onScreenSelect) {
                                    onScreenSelect(item.url);
                                    onClose();
                                  }
                                }}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
              )}
            </>
          ) : !filteredAlerts.length ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-muted)' }}>
              <Bell size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
              <div style={{ fontSize: 13 }}>No competitor alerts</div>
              <div style={{ fontSize: 11 }}>Monitoring webhook → competitor_alerts</div>
            </div>
          ) : (
            filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                style={{
                  padding: 10,
                  marginBottom: 6,
                  border: '1px solid var(--color-divider)',
                  background: !alert.read ? 'color-mix(in srgb, var(--color-accent) 6%, transparent)' : 'var(--color-surface)',
                }}
              >
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ paddingTop: 2 }}>{alertTypeIcon(alert.alert_type)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 800 }}>{alert.competitor_name}</span>
                      {!alert.read ? <span style={{ width: 6, height: 6, background: 'var(--color-accent)', display: 'inline-block' }} /> : null}
                      <span className="tag tag-outline" style={{ fontSize: 10 }}>{alert.priority}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{alert.title}</div>
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>{alert.summary}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8 }}>
                      <div className="text-muted" style={{ fontSize: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ textTransform: 'capitalize' }}>{String(alert.alert_type || '').replace('_', ' ')}</span>
                        {alert.sentiment === 'negative' ? <AlertTriangle size={10} /> : alert.sentiment === 'positive' ? <TrendingUp size={10} /> : null}
                        <span>{formatTimeAgo(alert.created_at)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {alert.source_url ? (
                          <a href={alert.source_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-icon" title="Source">
                            <ExternalLink size={12} />
                          </a>
                        ) : null}
                        <button type="button" className="btn btn-ghost btn-icon" title={alert.read ? 'Unread' : 'Read'} onClick={() => (alert.read ? markAsUnread(alert.id) : markAsRead(alert.id))}>
                          <CheckCircle size={12} />
                        </button>
                        <button type="button" className="btn btn-ghost btn-icon" title="Archive" onClick={() => archiveAlert(alert.id)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {activeTab === 'competitors' && alerts.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: 12, borderTop: '1px solid var(--color-divider)' }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12, color: 'var(--color-accent-2)' }} onClick={clearAll}>
              <Trash2 size={12} /> Clear all
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
              onClick={() => {
                onScreenSelect?.('market');
                onClose();
              }}
            >
              <Settings size={12} /> Configure
            </button>
          </div>
        )}
      </div>
    </>
  );
}
