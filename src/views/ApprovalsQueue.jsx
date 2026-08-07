import React, { useState } from 'react';
import { CheckCircle2, XCircle, MessageSquareWarning } from 'lucide-react';

const EDIT_TYPE_LABELS = {
  missing_rule: 'Missing rule — it didn’t know to do this',
  wrong_field: 'Wrong field — output shape/contract was off',
  should_have_escalated: 'Should have escalated instead of guessing',
  stylistic: 'Stylistic — tone/voice only',
  out_of_scope: 'Out of scope — should not have attempted this',
  other: 'Other',
};

/**
 * Inline correction form. Rejecting always requires an edit_type + note;
 * approving with an optional "I changed something first" flag also does.
 * This is the capture point for draft_corrections (the self-improvement
 * loop's "runlog") — see server/services/draftCorrections.js.
 */
function CorrectionForm({ mode, onCancel, onSubmit, suggestedEditType = '' }) {
  const [editType, setEditType] = useState(suggestedEditType);
  const [note, setNote] = useState('');
  const requireReason = mode === 'reject';

  return (
    <div
      style={{
        padding: '12px',
        border: '1px solid var(--color-divider)',
        borderRadius: '4px',
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 700 }}>
        {mode === 'reject' ? 'Why is this being dismissed?' : 'What did you change before approving?'}
      </div>
      {suggestedEditType ? (
        <div className="text-muted" style={{ fontSize: '11px' }}>
          This draft was flagged low-confidence when it was created — "should have escalated" is pre-selected, change it if that's not why you're correcting it.
        </div>
      ) : null}
      <select
        className="input"
        style={{ fontSize: '12px' }}
        value={editType}
        onChange={(e) => setEditType(e.target.value)}
      >
        <option value="">{requireReason ? 'Select a reason…' : 'Select a reason (optional)…'}</option>
        {Object.entries(EDIT_TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <textarea
        className="input"
        style={{ fontSize: '12px', minHeight: '52px', resize: 'vertical' }}
        placeholder="One sentence on what was wrong — this is what the weekly self-review reads."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ fontSize: '12px' }}
          disabled={requireReason && !editType}
          onClick={() => onSubmit({ editType: editType || null, note: note.trim() || null })}
        >
          {mode === 'reject' ? 'Confirm dismiss' : 'Confirm approve'}
        </button>
        <button type="button" className="btn btn-ghost" style={{ fontSize: '12px' }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ApprovalsQueue({ approvals, approvedActions, onDecideAction, onUndoAction, setActiveScreen }) {
  // Tracks which approval is mid-correction-capture: { [id]: 'approve' | 'reject' }
  const [activeForm, setActiveForm] = useState({});

  const openForm = (id, mode) => setActiveForm((prev) => ({ ...prev, [id]: mode }));
  const closeForm = (id) =>
    setActiveForm((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const submitDecision = (id, decision, correction) => {
    onDecideAction(id, decision, correction);
    closeForm(id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ marginBottom: '4px' }}>Approvals Queue</h1>
        <p className="text-muted">
          Human-in-the-loop gate for agent drafts. Switch to Autonomous on Orchestration to skip this queue (still no live spend/publish).
          <br />
          <MessageSquareWarning size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
          Every dismiss (and any approval you flag as edited) feeds the weekly agent self-review — it's the only way an agent's instructions get better.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {!approvals?.length ? (
          <div className="card text-muted">No pending approvals. Run Orchestration / Workflows to generate drafts.</div>
        ) : null}
        {(approvals || []).map((ap) => {
          const decision = approvedActions[ap.id];
          const formMode = activeForm[ap.id];

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
                      <CheckCircle2 size={14} /> Approved
                      {ap.openScreen && setActiveScreen ? (
                        <button type="button" className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '11px', marginLeft: '8px' }} onClick={() => setActiveScreen(ap.openScreen)}>
                          Open studio
                        </button>
                      ) : null}
                      <button type="button" className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '11px', marginLeft: '8px' }} onClick={() => onUndoAction(ap.id)}>
                        Undo
                      </button>
                    </span>
                  ) : decision === 'rejected' ? (
                    <span className="tag tag-neutral" style={{ padding: '6px 12px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <XCircle size={14} /> Dismissed
                      <button type="button" className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '11px', marginLeft: '8px' }} onClick={() => onUndoAction(ap.id)}>
                        Undo
                      </button>
                    </span>
                  ) : formMode ? null : (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button type="button" className="btn btn-primary" onClick={() => submitDecision(ap.id, 'approved', null)}>
                        Approve Action
                      </button>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => openForm(ap.id, 'approve')}>
                        Approve with edits
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => openForm(ap.id, 'reject')}>
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ padding: '12px', background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: '4px', fontSize: '13px' }}>
                <strong>Impact Preview &amp; Safety Checks:</strong> {ap.preview}
              </div>

              {formMode ? (
                <CorrectionForm
                  mode={formMode}
                  suggestedEditType={ap.confidence === 'low' ? 'should_have_escalated' : ''}
                  onCancel={() => closeForm(ap.id)}
                  onSubmit={(correction) =>
                    submitDecision(ap.id, formMode === 'reject' ? 'rejected' : 'approved', {
                      ...correction,
                      edited: formMode === 'approve',
                    })
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
