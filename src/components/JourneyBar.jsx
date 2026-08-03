import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  consumeJourneyHandoff,
  getNextBestAction,
  northStarLabel,
  openSectionScreen,
  sectionBriefForScreen,
  suggestNextScreen,
} from '../lib/journeyHandoff';
import { AGENT_CATALOG_BY_ID } from '../lib/agents/catalog';

/**
 * Strategy breadcrumb + Next Best Action + handoff banner for journey screens.
 */
export default function JourneyBar({ screenId, setActiveScreen, title }) {
  const [handoff, setHandoff] = useState(null);
  const [nba, setNba] = useState(null);
  const brief = sectionBriefForScreen(screenId);
  const agent = brief.agentId ? AGENT_CATALOG_BY_ID.get(brief.agentId) : null;

  useEffect(() => {
    setHandoff(consumeJourneyHandoff());
    setNba(getNextBestAction());
  }, [screenId]);

  const next = suggestNextScreen(screenId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '8px' }}>
      <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
        <strong style={{ color: 'var(--color-text)' }}>North Star:</strong> {northStarLabel()}
        {brief.title ? (
          <>
            {' · '}
            <strong style={{ color: 'var(--color-text)' }}>Section:</strong> {brief.title}
          </>
        ) : null}
        {agent ? (
          <>
            {' · '}
            <strong style={{ color: 'var(--color-text)' }}>Agent:</strong> {agent.name}
          </>
        ) : null}
        {brief.metric ? (
          <>
            {' · '}
            <strong style={{ color: 'var(--color-text)' }}>Metric:</strong> {brief.metric}
          </>
        ) : null}
      </div>

      {handoff && handoff.toScreen === screenId && (
        <div className="card" style={{ padding: '12px 14px', borderLeft: '3px solid var(--color-accent)' }}>
          <div className="card-kicker">Journey handoff</div>
          <div style={{ fontSize: '13px', marginTop: '4px' }}>
            From <strong>{handoff.from}</strong>
            {handoff.sectionTitle ? <> · {handoff.sectionTitle}</> : null}
            {handoff.mission ? <> — {handoff.mission}</> : null}
          </div>
          {handoff.summary ? (
            <p className="card-body" style={{ margin: '8px 0 0', fontSize: '12px' }}>
              {handoff.summary.slice(0, 280)}
              {handoff.summary.length > 280 ? '…' : ''}
            </p>
          ) : null}
        </div>
      )}

      {nba && (
        <div
          className="card"
          style={{
            padding: '12px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="card-kicker">Next best action</div>
            <div style={{ fontWeight: 700, fontSize: '14px' }}>{nba.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>{nba.detail}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flex: 'none' }}>
            {nba.sectionId && setActiveScreen && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => openSectionScreen(nba.sectionId, setActiveScreen)}
              >
                Open section
              </button>
            )}
            {setActiveScreen && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setActiveScreen(nba.screen)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                Go <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {(title || next) && setActiveScreen && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          {title ? <h1 style={{ margin: 0 }}>{title}</h1> : <span />}
          {next && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setActiveScreen(next)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              Continue → {next}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
