import React from 'react';

const MODES = [
  { id: 'draft_safe', label: 'Draft-safe', description: 'No external writes' },
  { id: 'live_drafts', label: 'Live drafts', description: 'Create drafts in connected tools' },
  { id: 'live_publish', label: 'Live publish', description: 'Publish or send externally' },
];

export default function AgentActionModeToggle({ value = 'draft_safe', onChange, disabled = false }) {
  const mode = MODES.some((item) => item.id === value) ? value : 'draft_safe';
  const active = MODES.find((item) => item.id === mode) || MODES[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="agent-action-mode-toggle">
      <div role="group" aria-label="Agent action mode" style={{ display: 'inline-flex', alignSelf: 'flex-start', flexWrap: 'wrap', padding: 3, borderRadius: 10, background: 'var(--color-bg)', border: '1px solid var(--color-divider)', gap: 2 }}>
        {MODES.map((option) => {
          const selected = option.id === mode;
          return (
            <button key={option.id} type="button" disabled={disabled} aria-pressed={selected} data-testid={`agent-action-mode-${option.id}`} onClick={() => onChange?.(option.id)} style={{ border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 650, fontFamily: 'inherit', background: selected ? (option.id === 'live_publish' ? 'var(--color-accent)' : option.id === 'live_drafts' ? 'var(--color-accent-2, var(--color-accent))' : 'var(--color-surface)') : 'transparent', color: selected && option.id !== 'draft_safe' ? '#fff' : 'var(--color-text)', opacity: disabled ? 0.6 : 1 }}>
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-muted" style={{ margin: 0, fontSize: 12 }}>{active.description}. Live publish still requires connector permissions and action-level safeguards.</p>
    </div>
  );
}
