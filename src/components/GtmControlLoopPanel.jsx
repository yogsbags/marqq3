/**
 * Control loop panel — Measure → Diagnose → Recommend → Approve (Marqq2 parity).
 * Workspace-scoped via /api/control-loop*.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { getActiveWorkspaceId } from '../lib/brandContext';
import { saveAgentOs } from '../lib/agents/persist';

function statusStyle(status) {
  switch (status) {
    case 'green':
      return { color: '#0f7b4a', borderColor: 'rgba(15,123,74,0.35)', background: 'rgba(15,123,74,0.08)' };
    case 'amber':
      return { color: '#9a6b00', borderColor: 'rgba(154,107,0,0.35)', background: 'rgba(154,107,0,0.08)' };
    case 'red':
    case 'critical':
      return { color: '#b42318', borderColor: 'rgba(180,35,24,0.35)', background: 'rgba(180,35,24,0.08)' };
    default:
      return { color: 'var(--color-muted)', borderColor: 'var(--color-divider)', background: 'var(--color-bg)' };
  }
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export function GtmControlLoopPanel({ onOsChange }) {
  const ws = getActiveWorkspaceId();
  const [loop, setLoop] = useState(null);
  const [goalSystem, setGoalSystem] = useState(null);
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [actualInput, setActualInput] = useState('');
  const [periodInput, setPeriodInput] = useState('');

  const applyOs = (agentOs) => {
    if (agentOs) {
      try {
        saveAgentOs(agentOs);
      } catch {
        /* ignore */
      }
      if (onOsChange) onOsChange(agentOs);
    }
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api(`/api/control-loop?workspaceId=${encodeURIComponent(ws)}`);
      setLoop(data.controlLoop);
      setGoalSystem(data.goalSystem);
      setRoster(data.agentRoster || null);
      applyOs(data.agentOs);
      const cur = data.controlLoop?.currentPeriod;
      if (cur?.period) setPeriodInput(String(cur.period));
    } catch (err) {
      setError(err.message || 'Failed to load control loop');
      setLoop(null);
    } finally {
      setLoading(false);
    }
  }, [ws]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (fn, successMsg) => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const data = await fn();
      if (data.controlLoop) setLoop(data.controlLoop);
      if (data.agentRoster) setRoster(data.agentRoster);
      if (data.goalSystem) setGoalSystem(data.goalSystem);
      applyOs(data.agentOs);
      if (successMsg) setMsg(successMsg);
      return data;
    } catch (err) {
      setError(err.message || 'Action failed');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const onMeasure = async () => {
    const actual = Number(actualInput);
    if (!Number.isFinite(actual)) {
      setError('Enter a numeric actual for this period');
      return;
    }
    const period = periodInput ? Number(periodInput) : undefined;
    const data = await run(
      () =>
        api('/api/control-loop/measure', {
          method: 'POST',
          body: { workspaceId: ws, actual, period },
        }),
      'Measurement recorded'
    );
    if (data) setActualInput('');
  };

  const onDiagnose = () =>
    run(
      () => api('/api/control-loop/diagnose', { method: 'POST', body: { workspaceId: ws } }),
      'Bottleneck diagnosed — agent priorities updated'
    );

  const onPropose = async () => {
    const data = await run(() =>
      api('/api/control-loop/interventions', { method: 'POST', body: { workspaceId: ws } })
    );
    if (data) setMsg(`${(data.interventions || []).length} interventions proposed`);
  };

  const onDecide = (id, decision) =>
    run(() =>
      api(`/api/control-loop/interventions/${encodeURIComponent(id)}/decide`, {
        method: 'POST',
        body: { workspaceId: ws, decision },
      })
    );

  const onRefreshRoster = () =>
    run(
      () => api('/api/control-loop/roster/refresh', { method: 'POST', body: { workspaceId: ws } }),
      'Agent roster refreshed'
    );

  if (loading) {
    return (
      <div className="card">
        <p className="card-body">Loading control loop…</p>
      </div>
    );
  }

  if (!loop) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Control loop</h3>
        <p className="card-body">
          {error || 'Lock a GTM strategy and activate it to open Measure → Diagnose → Recommend.'}
        </p>
      </div>
    );
  }

  const checkpoints = loop.checkpointPlan?.checkpoints || [];
  const openInterventions = (loop.interventions || []).filter((i) =>
    ['proposed', 'approved', 'executing'].includes(String(i.status))
  );
  const st = statusStyle(loop.status);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>Control loop</h3>
          <p className="card-body" style={{ marginTop: 6 }}>
            Measure → Diagnose → Recommend → Approve → Execute → Re-measure. North Star stays locked unless a human
            changes it.
          </p>
        </div>
        <span className="tag" style={{ ...st, border: `1px solid ${st.borderColor}`, padding: '4px 10px' }}>
          {loop.status || 'pending'}
          {loop.currentPeriod?.attainmentPct != null ? ` · ${loop.currentPeriod.attainmentPct}%` : ''}
        </span>
      </div>

      {(goalSystem?.north_star_metric || goalSystem?.quantified_target) && (
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          <strong style={{ color: 'var(--color-text)' }}>
            {goalSystem.north_star_metric || 'North Star'}
          </strong>
          {goalSystem.quantified_target ? ` — ${goalSystem.quantified_target}` : ''}
        </p>
      )}

      {msg ? <div className="text-muted" style={{ fontSize: 13 }}>{msg}</div> : null}
      {error ? <div style={{ color: 'var(--color-accent)', fontSize: 13 }}>{error}</div> : null}

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        {checkpoints.map((c) => {
          const cs = statusStyle(c.status);
          return (
            <div
              key={c.period}
              style={{
                minWidth: 110,
                padding: 10,
                border: `1px solid ${cs.borderColor}`,
                background: cs.background,
                textAlign: 'center',
              }}
            >
              <div className="card-kicker">{c.label}</div>
              <div style={{ fontWeight: 700, color: cs.color }}>{c.target ?? '—'}</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>actual {c.actual ?? '—'}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          Period
          <input
            className="input"
            style={{ width: 72, height: 36 }}
            value={periodInput}
            onChange={(e) => setPeriodInput(e.target.value)}
            placeholder="1"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          Actual
          <input
            className="input"
            style={{ width: 100, height: 36 }}
            value={actualInput}
            onChange={(e) => setActualInput(e.target.value)}
            placeholder="e.g. 34"
          />
        </label>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onMeasure()}>
          Record
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void onDiagnose()}>
          Diagnose
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void onPropose()}>
          Propose fixes
        </button>
      </div>

      {loop.recovery?.recommendation && loop.recovery.recommendation !== 'on_track' ? (
        <div
          style={{
            padding: 12,
            border: '1px solid rgba(154,107,0,0.35)',
            background: 'rgba(154,107,0,0.06)',
            fontSize: 13,
          }}
        >
          <strong>Recovery needed: {String(loop.recovery.recommendation).replace(/_/g, ' ')}</strong>
          <div className="text-muted" style={{ marginTop: 4 }}>
            Shortfall {loop.recovery.shortfall ?? '—'} · need ~{loop.recovery.requiredPerPeriod ?? '—'} / period.
            Choices: {(loop.recovery.choices || []).join(', ') || 'n/a'} — never silently change the target.
          </div>
        </div>
      ) : null}

      {loop.lastDiagnosis ? (
        <div style={{ padding: 12, border: '1px solid var(--color-divider)', background: 'var(--color-bg)', fontSize: 13 }}>
          <strong>Bottleneck: {loop.lastDiagnosis.bottleneck_stage || '—'}</strong>
          <div className="text-muted" style={{ marginTop: 4 }}>{loop.lastDiagnosis.summary}</div>
          {loop.lastDiagnosis.reallocation ? (
            <div className="text-muted" style={{ marginTop: 4 }}>
              Reallocate: {loop.lastDiagnosis.reallocation}
            </div>
          ) : null}
        </div>
      ) : null}

      {roster?.agents?.length ? (
        <div style={{ padding: 12, border: '1px solid var(--color-divider)', background: 'var(--color-bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <div className="card-kicker">Adaptive agent roster</div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                Archetype {roster.archetypeKey || '—'}
                {roster.bottleneck_stage ? ` · bottleneck: ${roster.bottleneck_stage}` : ''}
              </div>
            </div>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void onRefreshRoster()}>
              Refresh roster
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginTop: 10 }}>
            {roster.agents
              .filter((a) => a.status === 'high_priority' || a.status === 'activated')
              .slice(0, 8)
              .map((a) => (
                <div key={a.id} style={{ padding: 8, border: '1px solid var(--color-divider)', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <strong>{a.name}</strong>
                    <span className="tag tag-outline">{String(a.status).replace(/_/g, ' ')}</span>
                  </div>
                  {a.mission ? <div className="text-muted" style={{ marginTop: 4 }}>{a.mission}</div> : null}
                </div>
              ))}
          </div>
        </div>
      ) : null}

      {openInterventions.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="card-kicker">Interventions</div>
          {openInterventions.slice(0, 6).map((item) => (
            <div key={item.id} style={{ padding: 12, border: '1px solid var(--color-divider)', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{item.intervention || item.problem}</strong>
                <span className="tag tag-outline">{item.status}</span>
              </div>
              <div className="text-muted" style={{ marginTop: 4 }}>
                {item.affected_metric}: {item.current_value ?? '—'} → {item.target_value ?? '—'} · {item.duration} ·{' '}
                {item.owner}
              </div>
              {item.expected_impact ? (
                <div className="text-muted" style={{ marginTop: 2 }}>Impact: {item.expected_impact}</div>
              ) : null}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {item.status === 'proposed' ? (
                  <>
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onDecide(item.id, 'approved')}>
                      Approve
                    </button>
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void onDecide(item.id, 'rejected')}>
                      Reject
                    </button>
                  </>
                ) : null}
                {item.status === 'approved' ? (
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onDecide(item.id, 'executing')}>
                    Mark executing
                  </button>
                ) : null}
                {item.status === 'executing' ? (
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onDecide(item.id, 'done')}>
                    Mark done
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          No open interventions. Record an actual, diagnose, then propose fixes.
        </p>
      )}
    </div>
  );
}

export default GtmControlLoopPanel;
