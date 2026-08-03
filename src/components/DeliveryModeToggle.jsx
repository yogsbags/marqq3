import React from 'react';

/**
 * Draft-by-default / Publish-live segmented toggle shared across studios.
 * value: 'draft' | 'live'
 */
export default function DeliveryModeToggle({
  value = 'draft',
  onChange,
  draftLabel = 'Draft (safe)',
  liveLabel = 'Publish live',
  draftHint = 'Prepares assets without activating or sending.',
  liveHint = 'Will activate, send, or push to the live destination.',
  disabled = false,
  style,
}) {
  const isLive = value === 'live';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <div
        role="group"
        aria-label="Delivery mode"
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
          { id: 'draft', label: draftLabel },
          { id: 'live', label: liveLabel },
        ].map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
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
                  ? opt.id === 'live'
                    ? 'var(--color-accent)'
                    : 'var(--color-surface)'
                  : 'transparent',
                color: active
                  ? opt.id === 'live'
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
          color: isLive ? 'var(--color-accent-2, var(--color-accent))' : undefined,
        }}
      >
        {isLive ? liveHint : draftHint}
      </p>
    </div>
  );
}
