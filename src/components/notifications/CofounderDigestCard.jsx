/**
 * Co-founder Digest Card — the single-persona rollup of everything the agent
 * roster + control loop did, shown above the raw per-agent notification feed.
 * Mengo-style: "Marqq · online" header, one narrative, agent highlight chips.
 *
 * Used in both NotificationsPanel.jsx (AI Team tab) and CommandCenter.jsx
 * (AI insights home) — same card, two homes, per the phase-3 scope.
 */
import { useCallback, useEffect, useState } from 'react';
import { Sparkles, RefreshCw, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { fetchLatestDigest, generateDigestNow, markDigestRead } from '../../lib/cofounderDigest.js';

const AGENT_COLOURS = {
  zara: { bg: '#e0e7ff', fg: '#3730a3' },
  maya: { bg: '#dbeafe', fg: '#1e40af' },
  riya: { bg: '#f3e8ff', fg: '#6b21a8' },
  arjun: { bg: '#dcfce7', fg: '#166534' },
  dev: { bg: '#ffedd5', fg: '#9a3412' },
  priya: { bg: '#fee2e2', fg: '#991b1b' },
  neel: { bg: '#e0f2fe', fg: '#075985' },
  isha: { bg: '#fef9c3', fg: '#854d0e' },
  tara: { bg: '#fce7f3', fg: '#9d174d' },
  sam: { bg: '#ccfbf1', fg: '#115e59' },
  kiran: { bg: '#ede9fe', fg: '#5b21b6' },
};

function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const diffMin = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export default function CofounderDigestCard({ workspaceId, onOpenScreen, compact = false }) {
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [migrationPending, setMigrationPending] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    const result = await fetchLatestDigest(workspaceId);
    if (result.ok) {
      setDigest(result.digest);
      setMigrationPending(Boolean(result.migrationPending));
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: new digest lands the moment the scheduler (or a manual refresh) writes one.
  useEffect(() => {
    if (!workspaceId) return undefined;
    const channel = supabase
      .channel(`cofounder-digest-${workspaceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cofounder_digests', filter: `workspace_id=eq.${workspaceId}` },
        (payload) => setDigest(payload.new)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const result = await generateDigestNow(workspaceId, { force: true });
    if (result.ok && result.digest) setDigest(result.digest);
    setRefreshing(false);
  };

  const handleOpen = () => {
    if (digest && !digest.read) void markDigestRead(digest.id);
    if (digest?.highlights?.[0]?.agent && onOpenScreen) {
      onOpenScreen(digest.highlights[0].agent);
    }
  };

  if (loading || !workspaceId) return null;
  if (!digest) {
    if (migrationPending) return null; // table not migrated yet — stay silent, don't alarm the user
    return (
      <div
        style={{
          padding: 12,
          marginBottom: 10,
          border: '1px dashed var(--color-divider)',
          borderRadius: 6,
          color: 'var(--color-muted)',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>Your co-founder is warming up — the first daily recap lands once the team has a run to report.</span>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: 11, whiteSpace: 'nowrap', marginLeft: 8 }}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={11} style={{ marginRight: 4, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          {refreshing ? 'Checking…' : 'Check now'}
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={handleOpen}
      style={{
        padding: compact ? 10 : 14,
        marginBottom: 12,
        borderRadius: 8,
        border: '1px solid var(--color-divider)',
        background: !digest.read
          ? 'color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))'
          : 'var(--color-surface)',
        cursor: onOpenScreen ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={13} style={{ color: 'var(--color-accent)' }} />
          <span style={{ fontSize: 11, fontWeight: 800 }}>Marqq</span>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#22c55e',
              display: 'inline-block',
            }}
            title="online"
          />
          <span className="text-muted" style={{ fontSize: 11 }}>· co-founder digest</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="text-muted" style={{ fontSize: 11 }}>{formatTimeAgo(digest.created_at)}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleRefresh();
            }}
            title="Refresh recap"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: 2 }}
          >
            <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{digest.headline}</div>
      <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: digest.highlights?.length ? 8 : 0 }}>
        {digest.narrative}
      </div>

      {Array.isArray(digest.highlights) && digest.highlights.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {digest.highlights.slice(0, compact ? 3 : 6).map((h, i) => {
            const colours = AGENT_COLOURS[h.agent] || { bg: '#f1f5f9', fg: '#334155' };
            return (
              <span
                key={i}
                title={h.text}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: colours.bg,
                  color: colours.fg,
                  textTransform: 'capitalize',
                }}
              >
                {h.agent}
              </span>
            );
          })}
        </div>
      )}

      {digest.stats && (digest.stats.tasks_completed || digest.stats.agents_active) ? (
        <div className="text-muted" style={{ fontSize: 10, marginTop: 8, display: 'flex', gap: 10 }}>
          {digest.stats.tasks_completed ? <span>{digest.stats.tasks_completed} task(s)</span> : null}
          {digest.stats.agents_active ? <span>{digest.stats.agents_active} agent(s)</span> : null}
          {digest.stats.action_items_count ? <span>{digest.stats.action_items_count} action item(s)</span> : null}
          {onOpenScreen && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
              Open <ChevronRight size={10} />
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
