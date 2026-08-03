import React from 'react';
import { FileText, AlertCircle, Plus } from 'lucide-react';

export default function ContentPipeline({ contentItems, onOpenModal }) {
  const contentGaps = [
    { cluster: 'Patient scheduling', note: 'No content targets "no-show reduction" despite rising search volume — competitors rank 2 of top 3.' },
    { cluster: 'AI answer visibility', note: 'Marqq is not cited when AI assistants answer "best clinical scheduling software" — 3 competitors are.' },
    { cluster: 'Onboarding', note: 'High-intent visitors to /pricing have no matching nurture email in the current sequence.' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>Content &amp; Editorial Pipeline</h1>
          <p className="text-muted">Manage ongoing editorial assets and review AI-flagged content opportunities.</p>
        </div>
        <button className="btn btn-primary" onClick={() => onOpenModal('brief')}>
          <Plus size={14} /> New Content Brief
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Content Table */}
        <div className="card">
          <h3>Editorial Queue</h3>
          <div className="table-container" style={{ marginTop: '12px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {contentItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{item.title}</div>
                      <div style={{ fontSize: '11px', opacity: 0.6 }}>{item.date}</div>
                    </td>
                    <td>{item.type}</td>
                    <td>{item.channel}</td>
                    <td>
                      <span className={item.status === 'Live' ? 'tag tag-accent' : 'tag tag-accent-2'}>
                        {item.status}
                      </span>
                    </td>
                    <td>{item.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Content Gap Analysis */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} color="var(--color-accent)" />
            <h3 style={{ margin: 0 }}>AI Content Gap Analysis</h3>
          </div>
          <p className="text-muted" style={{ fontSize: '12px' }}>Identified by Maya &amp; Riya Agents.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {contentGaps.map((gap, i) => (
              <div key={i} style={{ padding: '12px', background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: '4px' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-accent)', marginBottom: '4px' }}>
                  {gap.cluster}
                </div>
                <div style={{ fontSize: '12px' }}>{gap.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
