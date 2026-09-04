import React from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw } from 'lucide-react';

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="card async-state" role="status" aria-live="polite">
      <Loader2 size={16} className="spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, description, actionLabel, onAction, icon = <Info size={16} aria-hidden="true" /> }) {
  return (
    <div className="card async-state" role="status">
      {icon}
      <div style={{ minWidth: 0 }}>
        <strong>{title}</strong>
        {description ? <div className="text-muted" style={{ fontSize: 13, marginTop: 3 }}>{description}</div> : null}
      </div>
      {actionLabel && onAction ? <button type="button" className="btn btn-secondary" onClick={onAction}>{actionLabel}</button> : null}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', description, onRetry }) {
  return (
    <div className="card async-state" role="alert" style={{ borderColor: 'rgba(242,121,10,0.55)' }}>
      <AlertTriangle size={16} style={{ color: 'var(--color-accent-2)' }} aria-hidden="true" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <strong>{title}</strong>
        {description ? <div className="text-muted" style={{ fontSize: 13, marginTop: 3 }}>{description}</div> : null}
      </div>
      {onRetry ? <button type="button" className="btn btn-secondary" onClick={onRetry}><RefreshCw size={14} /> Retry</button> : null}
    </div>
  );
}

export function SuccessState({ children }) {
  return <div className="card async-state" role="status"><CheckCircle2 size={16} style={{ color: '#67d391' }} aria-hidden="true" />{children}</div>;
}
