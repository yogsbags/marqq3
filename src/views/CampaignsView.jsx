import React, { useState } from 'react';
import { Plus, AlertOctagon, TrendingUp, DollarSign, Layers } from 'lucide-react';

export default function CampaignsView({ campaigns, onOpenModal }) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>Campaigns</h1>
          <p className="text-muted">Manage multi-channel campaigns, monitor pacing, and reallocate spend.</p>
        </div>
        <button className="btn btn-primary" onClick={() => onOpenModal('campaign')}>
          <Plus size={14} /> New Campaign
        </button>
      </div>

      {selectedCampaign ? (
        /* Detailed Campaign View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <button className="btn btn-secondary" onClick={() => setSelectedCampaignId(null)} style={{ width: 'fit-content' }}>
            ← Back to all campaigns
          </button>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <h2>{selectedCampaign.name}</h2>
                <p className="text-muted">{selectedCampaign.objective} · Managed by {selectedCampaign.owner}</p>
              </div>
              <span className={selectedCampaign.status === 'Live' ? 'tag tag-accent' : 'tag tag-accent-2'}>
                {selectedCampaign.status}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', margin: '16px 0' }}>
              <div style={{ padding: '10px', background: 'var(--color-bg)', borderRadius: '4px' }}>
                <div style={{ fontSize: '11px', opacity: 0.6 }}>Budget</div>
                <div style={{ fontWeight: 800, fontSize: '18px' }}>{selectedCampaign.budget}</div>
              </div>
              <div style={{ padding: '10px', background: 'var(--color-bg)', borderRadius: '4px' }}>
                <div style={{ fontSize: '11px', opacity: 0.6 }}>Spend</div>
                <div style={{ fontWeight: 800, fontSize: '18px' }}>{selectedCampaign.spend}</div>
              </div>
              <div style={{ padding: '10px', background: 'var(--color-bg)', borderRadius: '4px' }}>
                <div style={{ fontSize: '11px', opacity: 0.6 }}>ROAS</div>
                <div style={{ fontWeight: 800, fontSize: '18px', color: 'var(--color-accent)' }}>{selectedCampaign.roas}</div>
              </div>
              <div style={{ padding: '10px', background: 'var(--color-bg)', borderRadius: '4px' }}>
                <div style={{ fontSize: '11px', opacity: 0.6 }}>Pacing</div>
                <div style={{ fontWeight: 800, fontSize: '18px' }}>{selectedCampaign.pacing}</div>
              </div>
            </div>

            <div style={{ padding: '14px', background: 'rgba(242,121,10,0.1)', border: '1px solid rgba(242,121,10,0.3)', borderRadius: '6px', marginBottom: '16px' }}>
              <div style={{ fontWeight: 700, color: 'var(--color-accent-2)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <AlertOctagon size={14} /> AI Risk Assessment
              </div>
              <div style={{ fontSize: '13px' }}>{selectedCampaign.risk}</div>
            </div>

            <h4>Channel Share &amp; Breakdown</h4>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              {selectedCampaign.channelList.map((ch, i) => (
                <div key={i} style={{ flex: 1, padding: '12px', background: 'var(--color-bg)', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>{ch.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-accent)' }}>{ch.share} budget share</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Campaigns Summary Table */
        <div className="card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Channels</th>
                  <th>Status</th>
                  <th>Budget</th>
                  <th>Spend</th>
                  <th>ROAS</th>
                  <th>Pacing</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} onClick={() => setSelectedCampaignId(c.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{c.name}</div>
                      <div style={{ fontSize: '11px', opacity: 0.6 }}>{c.objective}</div>
                    </td>
                    <td>{c.channels}</td>
                    <td>
                      <span className={c.status === 'Live' ? 'tag tag-accent' : c.status === 'On track' ? 'tag tag-accent' : 'tag tag-accent-2'}>
                        {c.status}
                      </span>
                    </td>
                    <td>{c.budget}</td>
                    <td>{c.spend}</td>
                    <td><strong style={{ color: 'var(--color-accent)' }}>{c.roas}</strong></td>
                    <td>{c.pacing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
