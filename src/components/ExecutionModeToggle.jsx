import React from 'react';

/**
 * Human-gated vs autonomous agent execution.
 * value: 'human_gated' | 'autonomous'
 */
export default function ExecutionModeToggle({
  value = 'human_gated',
  onChange,
  disabled = false,
  style,
}) {
  const mode = value === 'autonomous' ? 'autonomous' : 'human_gated';
  const isAuto = mode === 'autonomous';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }} data-testid="execution-mode-toggle">
      <div
        role="group"
        aria-label="Agent execution mode"
        style={{
          display: 'inline-flex',
          alignSelf: 'flex-start',
          padding: 3,
          borderRadius: 10,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-divider)',
          gap: 2,
        }}
      >
        {[
          { id: 'human_gated', label: 'Human-gated' },
          { id: 'autonomous', label: 'Autonomous' },
        ].map((opt) => {
          const active = mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              data-testid={`execution-mode-${opt.id}`}
              onClick={() => onChange?.(opt.id)}
              style={{
                border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 650,
                fontFamily: 'inherit',
                background: active
                  ? opt.id === 'autonomous'
                    ? 'var(--color-accent)'
                    : 'var(--color-surface)'
                  : 'transparent',
                color: active
                  ? opt.id === 'autonomous'
                    ? '#fff'
                    : 'var(--color-text)'
                  : 'var(--color-text-muted, var(--color-text))',
                boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                opacity: disabled ? 0.6 : 1,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p
        className="text-muted"
        style={{
          margin: 0,
          fontSize: 12,
          color: isAuto ? 'var(--color-accent-2, var(--color-accent))' : undefined,
        }}
      >
        {isAuto
          ? 'Scheduler runs continue without Approvals. Still draft-safe — no live spend/publish.'
          : 'Scheduler queues drafts in Approvals until you approve.'}
      </p>
    </div>
  );
}
