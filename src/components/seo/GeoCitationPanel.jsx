import React, { useEffect, useState } from 'react';
import { getActiveWorkspaceId } from '../../lib/brandContext';
import { getCompanyName } from '../../lib/liveWorkspace';

/**
 * Maya GEO citation scanner panel — AI Overview / Perplexity / organic cite check.
 */
export default function GeoCitationPanel({
  domain: domainProp = '',
  companyName: companyProp = '',
  keywords = [],
  niche = '',
  compact = false,
  initialScan = null,
}) {
  const workspaceId = getActiveWorkspaceId();
  const companyName = companyProp || getCompanyName() || '';
  const domain = String(domainProp || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0];

  const [scan, setScan] = useState(initialScan || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [extraKw, setExtraKw] = useState('');

  useEffect(() => {
    if (initialScan) setScan(initialScan);
  }, [initialScan]);

  useEffect(() => {
    if (scan || !workspaceId) return;
    let cancelled = false;
    fetch(`/api/geo/scans/latest?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json?.scan) setScan(json.scan);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const runScan = async () => {
    setBusy(true);
    setError('');
    try {
      const kws = [
        ...keywords,
        ...String(extraKw || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ].slice(0, 6);
      const res = await fetch('/api/geo/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          companyName,
          domain,
          keywords: kws,
          niche: niche || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || `Scan failed (${res.status})`);
      setScan(json.scan);
    } catch (err) {
      setError(err.message || 'GEO scan failed');
    } finally {
      setBusy(false);
    }
  };

  const summary = scan?.summary;
  const bandColor =
    summary?.band === 'cited' ? '#1a7f37' : summary?.band === 'emerging' ? '#9a6700' : '#cf222e';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h4 style={{ margin: 0 }}>Maya · GEO citation scanner</h4>
          <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            Live AI Overview + Perplexity + organic cite check for {domain || companyName || 'this brand'}.
          </p>
        </div>
        <button type="button" className="btn btn-primary" disabled={busy || (!domain && !companyName)} onClick={() => void runScan()}>
          {busy ? 'Scanning…' : scan ? 'Re-run GEO scan' : 'Run GEO scan'}
        </button>
      </div>

      {!compact ? (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          <span className="text-muted">Extra keywords (comma-separated, optional)</span>
          <input
            type="text"
            value={extraKw}
            onChange={(e) => setExtraKw(e.target.value)}
            placeholder="digital transformation, AI consulting"
            style={{ padding: '8px 10px', border: '1px solid var(--color-divider)', borderRadius: 6 }}
          />
        </label>
      ) : null}

      {error ? (
        <div style={{ fontSize: 13, color: '#cf222e' }}>{error}</div>
      ) : null}

      {summary ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
            <Metric label="Visibility" value={`${summary.visibilityScore}/100`} />
            <Metric label="Band" value={summary.band} color={bandColor} />
            <Metric label="AI Overview cites" value={`${summary.aiOverviewHits}/${summary.queries}`} />
            <Metric label="Perplexity cites" value={`${summary.perplexityHits}/${summary.queries}`} />
          </div>

          {(scan.recommendations || scan.llmo_notes || []).length ? (
            <div>
              <div className="card-kicker">GEO / LLMO gaps</div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
                {(scan.recommendations || scan.llmo_notes || []).slice(0, 5).map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Query</th>
                  <th>Organic</th>
                  <th>AI Overview</th>
                  <th>Cites brand?</th>
                  <th>Perplexity</th>
                </tr>
              </thead>
              <tbody>
                {(scan.perQuery || []).map((q, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700 }}>{q.query}</td>
                    <td>{q.organicCitesBrand ? 'yes' : 'no'}</td>
                    <td>{q.hasAiOverview ? 'yes' : '—'}</td>
                    <td>{q.aiOverviewCitesBrand ? 'yes' : 'no'}</td>
                    <td>{q.perplexityCitesBrand ? 'yes' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>
            Scan {scan.id} · Apify {scan.apifyRunId || '—'} · {scan.createdAt}
          </p>
        </>
      ) : (
        <p className="card-body" style={{ margin: 0 }}>
          No GEO scan yet. Run a scan to see whether AI answers and Perplexity cite {domain || 'your domain'}.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div style={{ padding: 10, border: '1px solid var(--color-divider)', background: 'var(--color-bg)', borderRadius: 8 }}>
      <div className="text-muted" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 16, color: color || 'inherit', textTransform: 'capitalize' }}>{value}</div>
    </div>
  );
}
