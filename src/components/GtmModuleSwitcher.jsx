import React, { useCallback, useEffect, useState } from 'react';
import { getActiveWorkspaceId } from '../lib/brandContext';
import { getCompanyName } from '../lib/liveWorkspace';
import { apiFetch } from '../lib/apiFetch.js';

export const GTM_MODULE_TYPES = [
  { value: 'service', label: 'Service' },
  { value: 'product', label: 'Product' },
  { value: 'app', label: 'App' },
  { value: 'business_line', label: 'Business line' },
];

const ACTIVE_MODULE_KEY = 'marqq_active_gtm_module_id';

export function getStoredActiveModuleId() {
  try {
    return localStorage.getItem(ACTIVE_MODULE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredActiveModuleId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_MODULE_KEY, id);
    else localStorage.removeItem(ACTIVE_MODULE_KEY);
  } catch {
    /* ignore */
  }
}

function typeLabel(type) {
  return GTM_MODULE_TYPES.find((t) => t.value === type)?.label || type || 'Module';
}

/**
 * List / switch / create GTM modules (product, service, app, business line)
 * inside the current workspace.
 */
export default function GtmModuleSwitcher({
  setActiveScreen,
  onSwitched,
  compact = false,
}) {
  const workspaceId = getActiveWorkspaceId();
  const companyName = getCompanyName() || 'Workspace';
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [moduleType, setModuleType] = useState('service');

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setModules([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/gtm/modules?workspaceId=${encodeURIComponent(workspaceId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
      const list = Array.isArray(data.modules) ? data.modules : [];
      setModules(list);
      const active = list.find((m) => m.active) || list[0];
      if (active?.id) setStoredActiveModuleId(active.id);
    } catch (err) {
      setError(err.message || 'Failed to load modules');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hydrateModuleIntoSession = (mod) => {
    if (!mod) return;
    setStoredActiveModuleId(mod.id);
    const strategy = mod.section_state?.strategy || null;
    const answers = mod.profile?.answers || {};
    try {
      if (strategy) {
        sessionStorage.setItem('marqq_gtm_strategy', JSON.stringify(strategy));
        sessionStorage.setItem(
          'marqq_gtm_wizard',
          JSON.stringify({
            stage: 'document',
            phase: 'document',
            answers,
            strategy,
            briefsComplete: true,
            drafts: mod.section_state?.drafts || {},
            moduleId: mod.id,
          })
        );
      } else {
        sessionStorage.removeItem('marqq_gtm_strategy');
        sessionStorage.setItem(
          'marqq_gtm_wizard',
          JSON.stringify({
            stage: mod.section_state?.phase || 'module',
            answers,
            drafts: mod.section_state?.drafts || {},
            briefsComplete: Boolean(mod.section_state?.autoSections?.length),
            moduleId: mod.id,
          })
        );
      }
    } catch {
      /* ignore */
    }
  };

  const switchTo = async (mod) => {
    if (!mod?.id || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch(`/api/gtm/modules/${encodeURIComponent(mod.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, active: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
      hydrateModuleIntoSession(data.module || mod);
      await refresh();
      onSwitched?.(data.module || mod);
    } catch (err) {
      setError(err.message || 'Switch failed');
    } finally {
      setBusy(false);
    }
  };

  const createModule = async () => {
    if (busy) return;
    const title = String(name || '').trim() || `${companyName} — ${typeLabel(moduleType)}`;
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/gtm/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          name: title,
          moduleType,
          active: true,
          sourceContext: { createdFrom: 'gtm_module_switcher', companyName },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);

      // Fresh wizard for the new line — do not keep previous strategy in session
      try {
        sessionStorage.removeItem('marqq_gtm_strategy');
        sessionStorage.removeItem('marqq_gtm_wizard');
        sessionStorage.setItem('marqq_gtm_force_new_module', '1');
        sessionStorage.setItem(
          'marqq_gtm_wizard',
          JSON.stringify({
            stage: 'module',
            answers: {},
            drafts: {},
            moduleId: data.module?.id,
            moduleSeed: { name: title, type: moduleType },
          })
        );
      } catch {
        /* ignore */
      }
      setStoredActiveModuleId(data.module?.id);
      setShowCreate(false);
      setName('');
      await refresh();
      onSwitched?.(data.module);
      if (setActiveScreen) setActiveScreen('gtmwizard');
    } catch (err) {
      setError(err.message || 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const active = modules.find((m) => m.active) || modules[0];

  return (
    <div
      className="card"
      style={{
        padding: compact ? '12px 14px' : '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="card-kicker" style={{ marginBottom: 2 }}>
            GTM modules
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
            One module per product, service, app, or business line in this workspace.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !workspaceId}
          onClick={() => {
            setModuleType('service');
            setName(`${companyName} — `);
            setShowCreate(true);
          }}
        >
          Add module
        </button>
      </div>

      {loading ? (
        <div className="text-muted" style={{ fontSize: 13 }}>
          Loading modules…
        </div>
      ) : modules.length === 0 ? (
        <div className="text-muted" style={{ fontSize: 13 }}>
          No modules yet — finish GTM Wizard or add one for a new line.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {modules.map((m) => {
            const isActive = Boolean(m.active) || m.id === active?.id;
            return (
              <button
                key={m.id}
                type="button"
                className={isActive ? 'btn btn-primary' : 'btn btn-secondary'}
                disabled={busy || isActive}
                onClick={() => switchTo(m)}
                title={`${typeLabel(m.module_type)} · ${m.status}`}
                style={{ fontSize: 12 }}
              >
                {m.name || 'Untitled'}
                <span style={{ opacity: 0.75, marginLeft: 6 }}>
                  · {typeLabel(m.module_type)}
                  {isActive ? ' · active' : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <div style={{ color: 'var(--color-danger, #f87171)', fontSize: 12 }}>{error}</div>
      ) : null}

      {showCreate ? (
        <div
          style={{
            border: '1px solid var(--color-divider)',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: 'var(--color-bg)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14 }}>New GTM module</div>
          <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Name
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${companyName} — Growth product`}
            />
          </label>
          <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Type
            <select
              className="input"
              value={moduleType}
              onChange={(e) => setModuleType(e.target.value)}
            >
              {GTM_MODULE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={createModule}>
              {busy ? 'Creating…' : 'Create & open wizard'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
