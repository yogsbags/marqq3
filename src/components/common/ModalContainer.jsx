import React, { useState } from 'react';

export default function ModalContainer({ activeModal, onClose, onCreateCampaign, onCreateWorkspace }) {
  const [formData, setFormData] = useState({
    name: '',
    objective: 'Generate pipeline',
    budget: '$50,000',
    email: '',
    role: 'Editor',
    target: '',
    agent: 'Neel (Strategy)'
  });

  if (!activeModal) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (activeModal === 'campaign' && onCreateCampaign) {
      onCreateCampaign(formData);
    } else if (activeModal === 'workspace' && onCreateWorkspace) {
      onCreateWorkspace(formData.name || 'New Workspace');
    } else {
      alert(`Saved ${formData.name || 'new item'} for ${activeModal} modal!`);
    }
    onClose();
  };

  const titles = {
    campaign: 'Create New Campaign',
    strategy: 'Draft Strategy Brief',
    brief: 'Create Campaign Brief',
    workspace: 'Switch or Create Workspace',
    segment: 'Create Audience Segment',
    sequence: 'Build Outreach Sequence',
    team: 'Invite Team Member',
    experiment: 'Create A/B Experiment'
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontWeight: 800, fontSize: '17px', fontFamily: 'var(--font-heading)' }}>
            {titles[activeModal] || 'Create Item'}
          </span>
          <button className="btn btn-secondary btn-icon" style={{ width: '28px', height: '28px', padding: 0 }} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {activeModal === 'strategy' && (
              <>
                <div className="field">
                  <label>Strategy Pillar Name</label>
                  <input
                    className="input"
                    placeholder="e.g. Mid-Market Healthcare Expansion"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label>Strategic Objective</label>
                  <textarea
                    className="input"
                    placeholder="Describe the objective and target ICP..."
                    value={formData.target}
                    onChange={e => setFormData({ ...formData, target: e.target.value })}
                    style={{ minHeight: '80px' }}
                    required
                  />
                </div>
                <div className="field">
                  <label>Lead AI Agent</label>
                  <select
                    className="input"
                    value={formData.agent}
                    onChange={e => setFormData({ ...formData, agent: e.target.value })}
                  >
                    <option value="Neel (Strategy)">Neel — Strategy &amp; GTM</option>
                    <option value="Veena (Intel)">Veena — Company &amp; Market Intel</option>
                    <option value="Dev (Performance)">Dev — Performance ROI</option>
                    <option value="Riya (Content)">Riya — Editorial Pipeline</option>
                  </select>
                </div>
              </>
            )}

            {activeModal === 'campaign' && (
              <>
                <div className="field">
                  <label>Campaign Name</label>
                  <input
                    className="input"
                    placeholder="e.g. Q4 Growth Sprint"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label>Objective</label>
                  <select
                    className="input"
                    value={formData.objective}
                    onChange={e => setFormData({ ...formData, objective: e.target.value })}
                  >
                    <option value="Generate pipeline">Generate Pipeline</option>
                    <option value="Account engagement">Account Engagement</option>
                    <option value="Brand awareness">Brand Awareness</option>
                    <option value="Reduce churn">Reduce Churn</option>
                  </select>
                </div>
                <div className="field">
                  <label>Initial Budget Allocation</label>
                  <input
                    className="input"
                    placeholder="$50,000"
                    value={formData.budget}
                    onChange={e => setFormData({ ...formData, budget: e.target.value })}
                  />
                </div>
              </>
            )}

            {activeModal === 'workspace' && (
              <>
                <div className="field">
                  <label>Workspace Name</label>
                  <input
                    className="input"
                    placeholder="e.g. Apex Health Systems"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
              </>
            )}

            {activeModal === 'team' && (
              <>
                <div className="field">
                  <label>Teammate Work Email</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="colleague@company.com"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label>Role</label>
                  <select className="input" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                    <option value="Approver">Approver</option>
                    <option value="Editor">Editor</option>
                    <option value="Viewer">Viewer</option>
                  </select>
                </div>
              </>
            )}

            {!['strategy', 'campaign', 'workspace', 'team'].includes(activeModal) && (
              <div className="field">
                <label>Title / Description</label>
                <input
                  className="input"
                  placeholder="Enter title or name..."
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
            )}
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Strategy Brief</button>
          </div>
        </form>
      </div>
    </div>
  );
}
