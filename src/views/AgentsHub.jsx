import React, { useEffect, useState } from 'react';
import { Send, CheckCircle2, XCircle, MessageSquare, ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { openAgentScreen } from '../lib/journeyHandoff';
import { AGENT_CATALOG_BY_ID } from '../lib/agents/catalog';
import { fetchWorkspaceReportCards } from '../lib/agentReportCard.js';

const fallbackAgent = {
  id: 'dev',
  name: 'Dev',
  role: 'Performance',
  type: 'Paid media ROI',
  avatarColor: '#ff6a00',
  status: 'Running',
  lastAction: 'Measure North Star and metric-tree leading indicators.',
  successRate: '—',
  owner: 'Marqq',
  purpose: 'Measures North Star and metric-tree leading indicators; optimizes spend.',
  tools: ['Budget planner', 'Ad platform connectors'],
  dataAccess: ['Campaign data', 'Budget ledger'],
  rosterStatus: 'activated',
  mission: null,
  metric: null,
};

export default function AgentsHub({ agents = [], agentLogs = {}, approvedActions = {}, onDecideAction, onUndoAction, setActiveScreen, workspaceId = null }) {
  const [selectedAgentId, setSelectedAgentId] = useState(null); // null = Grid view, string = Detail view
  const [chatThreads, setChatThreads] = useState({});
  const [chatDraft, setChatDraft] = useState('');
  const [reportCards, setReportCards] = useState({});

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    fetchWorkspaceReportCards(workspaceId).then((result) => {
      if (!cancelled && result.ok) setReportCards(result.cards);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const safeAgents = Array.isArray(agents) && agents.length > 0 ? agents : [fallbackAgent];
  const selectedAgent = safeAgents.find(a => a.id === selectedAgentId);
  const selectedCard = selectedAgent ? reportCards[selectedAgent.id] : null;

  const logs = (selectedAgent && agentLogs && agentLogs[selectedAgent.id]) || [
    { id: 'l1', time: 'Today, 9:14 AM', observed: 'Paid Search CAC up 18% w/w, concentrated in 2 keyword groups; conversion rate flat.', action: 'Shift $12K budget from those groups into the LinkedIn ABM audience.', confidence: '87% confidence' },
    { id: 'l2', time: 'Yesterday, 4:02 PM', observed: 'LinkedIn ABM audience efficiency at 71%, above the 60% target for 6 straight days.', action: 'Recommend increasing LinkedIn daily budget cap by $500.', confidence: '91% confidence' }
  ];

  const currentThread = (selectedAgent && chatThreads[selectedAgent.id]) || [
    { sender: 'agent', text: selectedAgent ? `Hi, I'm ${selectedAgent.name}, your ${selectedAgent.role} agent. Ask me anything about ${selectedAgent.type}.` : '', time: '' }
  ];

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatDraft.trim() || !selectedAgent) return;

    const userText = chatDraft;
    setChatDraft('');
    const newMsg = { sender: 'You', text: userText, time: 'Just now' };

    setChatThreads(prev => {
      const existing = prev[selectedAgent.id] || [];
      return { ...prev, [selectedAgent.id]: [...existing, newMsg] };
    });

    setTimeout(() => {
      setChatThreads(prev => {
        const existing = prev[selectedAgent.id] || [];
        return {
          ...prev,
          [selectedAgent.id]: [
            ...existing,
            { sender: 'agent', text: `Got it! I’ll factor "${userText}" into my next run cycle and update the workspace recommendations.`, time: 'Just now' }
          ]
        };
      });
    }, 800);
  };

  // 1. Separate Screen: Agent Detail View
  if (selectedAgent) {
    const isEchoAgent = selectedAgent.id === 'arjun';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Back Button */}
        <button
          type="button"
          className="btn btn-ghost"
          style={{ paddingInline: 0, width: 'fit-content', display: 'flex', alignItems: 'center', gap: '6px' }}
          onClick={() => setSelectedAgentId(null)}
        >
          <ArrowLeft size={14} /> Back to Agents
        </button>

        {/* Detail Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            flex: 'none',
            borderRadius: '0px',
            background: selectedAgent.avatarColor || 'var(--color-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-heading)',
            fontWeight: 800,
            color: '#fff',
            fontSize: '17px'
          }}>
            {selectedAgent.name ? selectedAgent.name[0] : 'A'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ margin: 0 }}>{selectedAgent.name}</h1>
              <span className={selectedAgent.status === 'Running' || selectedAgent.status === 'Completed' ? 'tag tag-accent' : 'tag tag-accent-2'}>
                {selectedAgent.status}
              </span>
            </div>
            <p className="text-muted" style={{ margin: 0, fontSize: '13px' }}>
              {selectedAgent.role} · {selectedAgent.type} · Managed by {selectedAgent.owner}
            </p>
          </div>
        </div>

        {/* 2-Column Detail Console */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '28px' }}>
          {/* Left Column: Purpose, Stats & Recent Activity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="card">
              <h4>Purpose</h4>
              <p className="card-body" style={{ margin: 0 }}>{selectedAgent.purpose}</p>
              {(selectedAgent.mission || selectedAgent.metric || selectedAgent.rosterStatus) && (
                <div style={{ marginTop: '12px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {selectedAgent.rosterStatus && (
                    <div><strong>Roster:</strong> {selectedAgent.rosterStatus}{selectedAgent.tier ? ` · ${selectedAgent.tier}` : ''}</div>
                  )}
                  {selectedAgent.mission && (
                    <div><strong>Mission:</strong> {selectedAgent.mission}</div>
                  )}
                  {selectedAgent.metric && (
                    <div><strong>Owns metric:</strong> {selectedAgent.metric}</div>
                  )}
                  {selectedAgent.target && (
                    <div><strong>Target:</strong> {selectedAgent.target}</div>
                  )}
                </div>
              )}

              {/* Stats Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '16px' }}>
                <div className="card" style={{ padding: '12px' }}>
                  <div className="card-kicker">Success Rate</div>
                  <div className="card-title" style={{ fontSize: '21px' }}>{selectedAgent.successRate || '—'}</div>
                </div>
                <div className="card" style={{ padding: '12px' }}>
                  <div className="card-kicker">Review</div>
                  <div className="card-title" style={{ fontSize: '21px' }}>{selectedAgent.review_date || '—'}</div>
                </div>
                <div className="card" style={{ padding: '12px' }}>
                  <div className="card-kicker">Tier</div>
                  <div className="card-title" style={{ fontSize: '21px' }}>{selectedAgent.tier || '—'}</div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="card">
              <h4>Recent Activity &amp; Action Queue</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                {logs.map((l, idx) => {
                  const key = `${selectedAgent.id}-${idx}`;
                  const decision = approvedActions ? approvedActions[key] : null;

                  return (
                    <div key={idx} className="card" style={{ padding: '14px', background: 'var(--color-bg)' }}>
                      <div className="card-meta" style={{ justifyContent: 'space-between', width: '100%' }}>
                        <span>{l.time}</span>
                        <span className="tag tag-outline">{l.confidence}</span>
                      </div>
                      <div style={{ fontSize: '13px', margin: '8px 0' }}>
                        <strong style={{ color: 'var(--color-accent)' }}>Observed:</strong> {l.observed}
                      </div>
                      <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                        <strong style={{ color: 'var(--color-text)' }}>Proposed action:</strong> {l.action}
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {decision === 'approved' ? (
                          <span className="tag tag-accent" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={12} /> Approved
                            {onUndoAction && (
                              <button className="btn btn-ghost" style={{ paddingInline: '4px', fontSize: '10px' }} onClick={() => onUndoAction(key)}>
                                Undo
                              </button>
                            )}
                          </span>
                        ) : decision === 'rejected' ? (
                          <span className="tag tag-neutral" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <XCircle size={12} /> Dismissed
                            {onUndoAction && (
                              <button className="btn btn-ghost" style={{ paddingInline: '4px', fontSize: '10px' }} onClick={() => onUndoAction(key)}>
                                Undo
                              </button>
                            )}
                          </span>
                        ) : (
                          <>
                            {onDecideAction && (
                              <>
                                <button className="btn btn-primary" onClick={() => onDecideAction(key, 'approved')}>
                                  Approve
                                </button>
                                <button className="btn btn-ghost" onClick={() => onDecideAction(key, 'rejected')}>
                                  Reject
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Tools, Data Access, Cost & Chat */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {(selectedAgent.openScreen || AGENT_CATALOG_BY_ID.get(selectedAgent.id)?.openScreen || isEchoAgent) && (
              <div>
                <h4 style={{ marginBottom: '8px' }}>Workspace Integration</h4>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => {
                    if (!openAgentScreen(selectedAgent.id, setActiveScreen) && isEchoAgent) {
                      setActiveScreen && setActiveScreen('outreach');
                    }
                  }}
                >
                  Open {selectedAgent.openScreen || AGENT_CATALOG_BY_ID.get(selectedAgent.id)?.openScreen || 'outreach'} workspace
                </button>
              </div>
            )}

            <div>
              <h4 style={{ marginBottom: '8px' }}>Tools</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(selectedAgent.tools || ['Web crawler']).map((t, i) => (
                  <span key={i} className="tag tag-neutral">{t}</span>
                ))}
              </div>
            </div>

            <div>
              <h4 style={{ marginBottom: '8px' }}>Data Access</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(selectedAgent.dataAccess || ['Public web']).map((d, i) => (
                  <span key={i} className="tag tag-outline">{d}</span>
                ))}
              </div>
            </div>

            <div>
              <h4 style={{ marginBottom: '8px' }}>Cost (7 days)</h4>
              <div className="card">
                <div className="card-title" style={{ fontSize: '20px' }}>$412</div>
                <div className="card-meta">avg $59/day · under $80 budget cap</div>
              </div>
            </div>

            <div>
              <h4 style={{ marginBottom: '8px' }}>Report Card (7 days)</h4>
              {selectedCard ? (
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    <div>
                      <div className="card-kicker">Runs</div>
                      <div className="card-title" style={{ fontSize: '18px' }}>{selectedCard.runs}</div>
                    </div>
                    <div>
                      <div className="card-kicker">Edit rate</div>
                      <div className="card-title" style={{ fontSize: '18px' }}>{selectedCard.editRate}%</div>
                    </div>
                    <div>
                      <div className="card-kicker">Escalation rate</div>
                      <div className="card-title" style={{ fontSize: '18px' }}>{selectedCard.escalationRate}%</div>
                    </div>
                  </div>
                  <div className="card-meta">
                    {selectedCard.grade}
                    {selectedCard.ruleCount != null ? ` · ${selectedCard.ruleCount} rules · v${selectedCard.instructionsVersion}` : ' · instructions not initialized yet'}
                  </div>
                  {selectedCard.topPattern ? (
                    <div className="card-meta">
                      Most common correction: <strong>{selectedCard.topPattern.editType.replace(/_/g, ' ')}</strong> ({selectedCard.topPattern.count}×) — this is what the next weekly review will act on.
                    </div>
                  ) : null}
                  {selectedCard.recentReviews?.length ? (
                    <div>
                      <div className="card-kicker" style={{ marginBottom: '4px' }}>Recent self-review changes</div>
                      {selectedCard.recentReviews.map((r) => (
                        <div key={r.id} className="card-meta" style={{ marginBottom: '4px' }}>
                          {new Date(r.created_at).toLocaleDateString()} — {r.what_changed}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="card-meta">No weekly review has run for this agent yet.</div>
                  )}
                </div>
              ) : (
                <div className="card text-muted" style={{ fontSize: '12px' }}>
                  No report card data yet — dismiss or flag edits on drafts in Approvals to start building signal.
                </div>
              )}
            </div>

            {/* Chat Box */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-divider)', fontWeight: 700 }}>
                Chat with {selectedAgent.name}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', maxHeight: '220px', overflowY: 'auto' }}>
                {currentThread.map((m, i) => (
                  <div key={i} style={{ alignSelf: m.sender === 'You' ? 'flex-end' : 'flex-start', maxWidth: '100%' }}>
                    <div className="card-kicker" style={{ marginBottom: '2px' }}>{m.sender === 'You' ? 'You' : selectedAgent.name}</div>
                    <div className="card-body" style={{ margin: 0, fontSize: '12px' }}>{m.text}</div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '6px', padding: '10px', borderTop: '1px solid var(--color-divider)' }}>
                <input
                  className="input"
                  style={{ flex: 1, fontSize: '12px' }}
                  placeholder={`Message ${selectedAgent.name}…`}
                  value={chatDraft}
                  onChange={e => setChatDraft(e.target.value)}
                />
                <button type="submit" className="btn btn-primary" style={{ padding: '6px 10px' }}>
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Main Screen: Agents Library Grid View
  const activeCount = safeAgents.filter(
    (a) => a.rosterStatus === 'high_priority' || a.rosterStatus === 'activated' || a.status === 'Running'
  ).length;
  const highPriorityCount = safeAgents.filter((a) => a.rosterStatus === 'high_priority').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>Agents</h1>
          <p className="text-muted">
            {safeAgents.length} agents · {activeCount} active
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen && setActiveScreen('orchestration')}>
          Execution settings
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        <div className="card">
          <div className="card-kicker">Active Now</div>
          <div className="card-title" style={{ fontSize: '21px' }}>{activeCount}</div>
        </div>
        <div className="card">
          <div className="card-kicker">High Priority</div>
          <div className="card-title" style={{ fontSize: '21px' }}>{highPriorityCount}</div>
        </div>
        <div className="card">
          <div className="card-kicker">Catalog</div>
          <div className="card-title" style={{ fontSize: '21px' }}>{safeAgents.length}</div>
        </div>
      </div>

      {/* Agents Library Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        {safeAgents.map((agent) => {
          const card = reportCards[agent.id];
          return (
          <div
            key={agent.id}
            onClick={() => setSelectedAgentId(agent.id)}
            className="card elev-sm"
            style={{ cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                flex: 'none',
                borderRadius: '0px',
                background: agent.avatarColor || 'var(--color-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-heading)',
                fontWeight: 800,
                color: '#fff',
                fontSize: '14px'
              }}>
                {agent.name ? agent.name[0] : 'A'}
              </div>
              <div>
                <div className="card-title" style={{ margin: 0 }}>{agent.name}</div>
                <div className="card-kicker" style={{ margin: 0 }}>{agent.role}{agent.tier ? ` · ${agent.tier}` : ''}</div>
              </div>
            </div>

            <p className="card-body" style={{ fontSize: '13px' }}>{agent.mission || agent.lastAction}</p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
              <span className={agent.status === 'Running' || agent.status === 'Completed' ? 'tag tag-accent' : 'tag tag-accent-2'}>
                {agent.rosterStatus || agent.status}
              </span>
              <span className="card-meta">
                {agent.metric ? `owns: ${String(agent.metric).slice(0, 28)}` : (card ? card.grade : (agent.successRate || '—'))}
              </span>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
