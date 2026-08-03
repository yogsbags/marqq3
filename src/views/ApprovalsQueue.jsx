import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function ApprovalsQueue({ approvals, approvedActions, onDecideAction, onUndoAction }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h1 style={{ marginBottom: '4px' }}>Approvals Queue</h1>
        <p className="text-muted">Human-in-the-loop decision gate for autonomous agent budget, content, and sequence executions.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {approvals.map((ap) => {
          const decision = approvedActions[ap.id];

          return (
            <div key={ap.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span className="tag tag-accent">{ap.type}</span>
                    <span className={ap.riskClass}>{ap.risk}</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>Deadline: {ap.deadline}</span>
                  </div>
                  <h2>{ap.title}</h2>
                  <div className="text-muted" style={{ fontSize: '12px', marginTop: '2px' }}>Requested by {ap.owner}</div>
                </div>

                <div>
                  {decision === 'approved' ? (
                    <span className="tag tag-accent" style={{ padding: '6px 12px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={14} /> Approved &amp; Executing
                      <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '11px', marginLeft: '8px' }} onClick={() => onUndoAction(ap.id)}>
                        Undo
                      </button>
                    </span>
                  ) : decision === 'rejected' ? (
                    <span className="tag tag-neutral" style={{ padding: '6px 12px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <XCircle size={14} /> Dismissed
                      <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '11px', marginLeft: '8px' }} onClick={() => onUndoAction(ap.id)}>
                        Undo
                      </button>
                    </span>
                  ) : (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn btn-primary" onClick={() => onDecideAction(ap.id, 'approved')}>
                        Approve Action
                      </button>
                      <button className="btn btn-secondary" onClick={() => onDecideAction(ap.id, 'rejected')}>
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ padding: '12px', background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: '4px', fontSize: '13px' }}>
                <strong>Impact Preview &amp; Safety Checks:</strong> {ap.preview}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
