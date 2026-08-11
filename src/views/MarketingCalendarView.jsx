/**
 * Marketing Calendar — Marqq2 parity (week / month / today + platforms + schedule).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Linkedin,
  Twitter,
  Instagram,
  Facebook,
  MessageCircle,
  Youtube,
  Mail,
  X,
  Clock,
} from 'lucide-react';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import { getCompanyName } from '../lib/liveWorkspace.js';
import JourneyBar from '../components/JourneyBar.jsx';
import { apiFetch } from '../lib/apiFetch.js';

const CALENDARIFIC_KEY = import.meta.env.VITE_CALENDARIFIC_API_KEY;

const PLATFORMS = [
  { id: 'blog', label: 'WordPress', Icon: FileText, color: '#64748b' },
  { id: 'linkedin', label: 'LinkedIn', Icon: Linkedin, color: '#3b82f6' },
  { id: 'twitter', label: 'X', Icon: Twitter, color: '#64748b' },
  { id: 'instagram', label: 'Instagram', Icon: Instagram, color: '#ec4899' },
  { id: 'facebook', label: 'Meta', Icon: Facebook, color: '#2563eb' },
  { id: 'reddit', label: 'Reddit', Icon: MessageCircle, color: '#f97316' },
  { id: 'youtube', label: 'YouTube', Icon: Youtube, color: '#ef4444' },
  { id: 'email', label: 'Email', Icon: Mail, color: '#f43f5e' },
];

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getWeekDays(anchor) {
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function getMonthWeeks(anchor) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const weeks = [];
  const cur = new Date(start);
  while (cur <= last || weeks.length < 4) {
    const week = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
    if (cur > last && weeks.length >= 4) break;
  }
  return weeks;
}

function isSameDay(a, b) {
  return a.toDateString() === b.toDateString();
}

function formatRangeLabel(days) {
  const first = days[0];
  const last = days[days.length - 1];
  return `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function NewPostModal({ modal, companyId, onClose, onSaved }) {
  const { platformId, platformLabel, day } = modal;
  const [calTitle, setCalTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [time, setTime] = useState('09:00');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const submitPost = async (action) => {
    if (!companyId) {
      setError('Workspace UUID required to schedule content');
      return;
    }
    if (action === 'publish' && !window.confirm(`Publish this ${platformLabel} post live now?`)) return;
    setBusy(action);
    setError('');
    try {
      const publishAt =
        action === 'schedule'
          ? new Date(`${day.toISOString().slice(0, 10)}T${time}:00`).toISOString()
          : undefined;
      const response = await fetch('/api/content-studio/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          action,
          live: action === 'publish',
          platform: platformId,
          publishAt,
          payload: {
            title: calTitle.trim() || `${platformLabel} post`,
            post: bodyText.trim(),
            body: bodyText.trim(),
            platform: platformId,
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not save content');
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', borderRadius: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>
            New {platformLabel} · {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </h3>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <label className="text-muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Calendar title</label>
        <input
          className="input"
          value={calTitle}
          onChange={(e) => setCalTitle(e.target.value)}
          placeholder={`Title for ${platformLabel}`}
          style={{ marginBottom: 12 }}
        />
        <textarea
          className="input"
          rows={6}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          placeholder="Write your post…"
          style={{ marginBottom: 12, resize: 'vertical' }}
        />
        {error ? <p style={{ color: 'var(--color-accent-2)', fontSize: 12 }}>{error}</p> : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--color-divider)', padding: '6px 10px' }}>
            <Clock size={14} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ border: 0, background: 'transparent' }} />
          </label>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => submitPost('draft')}>
              {busy === 'draft' ? 'Saving…' : 'Save draft'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => submitPost('schedule')}>
              {busy === 'schedule' ? 'Scheduling…' : 'Schedule'}
            </button>
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => submitPost('publish')}>
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketingCalendarView({ setActiveScreen }) {
  const company = getCompanyName();
  const workspaceId = getActiveWorkspaceId();
  const today = useMemo(() => new Date(), []);

  const [view, setView] = useState('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [deployments, setDeployments] = useState([]);
  const [festivals, setFestivals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [newPostModal, setNewPostModal] = useState(null);
  const [rescheduleEntry, setRescheduleEntry] = useState(null);
  const [rescheduleValue, setRescheduleValue] = useState('');
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [depRes, schedRes, autoRes] = await Promise.all([
        apiFetch(`/api/agents/deployments?workspaceId=${encodeURIComponent(workspaceId)}`).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/content-studio/scheduled?companyId=${encodeURIComponent(workspaceId)}`).then((r) => r.json()).catch(() => ({ items: [] })),
        fetch(`/api/automations/scheduled?companyId=${encodeURIComponent(workspaceId)}`).then((r) => r.json()).catch(() => ({})),
      ]);
      const deps = (Array.isArray(depRes.deployments) ? depRes.deployments : []).map((d) => ({
        id: d.id,
        kind: 'deployment',
        agentName: d.agentName,
        sectionTitle: d.sectionTitle || d.sectionId || 'Agent run',
        status: d.status,
        scheduledFor: d.scheduledFor || d.nextRun || null,
        openScreen: d.openScreen || 'orchestration',
        agentTarget: d.agentTarget || 'agent',
      }));
      const organic = (schedRes.items || []).map((item) => ({
        id: item.id,
        kind: 'content',
        agentName: item.agentName || 'riya',
        sectionTitle: item.title || item.sectionTitle || 'Organic post',
        status: item.status || 'scheduled',
        scheduledFor: item.scheduledFor || item.publish_at,
        openScreen: 'social',
        agentTarget: item.platformId || item.platform || 'social',
      }));
      const autos = (Array.isArray(autoRes.automations) ? autoRes.automations : [])
        .filter((a) => a.next_run)
        .map((a) => ({
          id: `auto-${a.automation_id || a.id}`,
          kind: 'automation',
          agentName: a.params?.agent || 'neel',
          sectionTitle: `${a.automation_id || 'Automation'} · ${a.params?.sectionId || a.cron || 'scheduled'}`,
          status: a.active === false ? 'paused' : 'active',
          scheduledFor: a.next_run,
          openScreen: 'workflows',
          agentTarget: 'automation',
        }));
      setDeployments([...deps, ...organic, ...autos]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load, refresh]);

  useEffect(() => {
    if (!CALENDARIFIC_KEY) return;
    const year = new Date().getFullYear();
    fetch(`https://calendarific.com/api/v2/holidays?api_key=${CALENDARIFIC_KEY}&country=IN&year=${year}`)
      .then((r) => r.json())
      .then((data) => {
        const holidays = data?.response?.holidays || [];
        setFestivals(
          holidays.map((h) => ({
            name: h.name,
            date: new Date(h.date.iso),
            description: h.description,
          }))
        );
      })
      .catch(() => {});
  }, []);

  const weekDays = useMemo(() => getWeekDays(anchor), [anchor]);
  const monthWeeks = useMemo(() => getMonthWeeks(anchor), [anchor]);
  const rangeLabel =
    view === 'month'
      ? `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`
      : formatRangeLabel(weekDays);

  const deploymentDaySet = useMemo(() => {
    const s = new Set();
    deployments.forEach((d) => {
      if (d.scheduledFor) s.add(new Date(d.scheduledFor).toDateString());
    });
    return s;
  }, [deployments]);

  const festivalDaySet = useMemo(() => {
    const s = new Set();
    festivals.forEach((f) => s.add(f.date.toDateString()));
    return s;
  }, [festivals]);

  const selectedDayItems = useMemo(
    () => deployments.filter((d) => d.scheduledFor && isSameDay(new Date(d.scheduledFor), selectedDay)),
    [deployments, selectedDay]
  );
  const selectedDayFestivals = useMemo(
    () => festivals.filter((f) => isSameDay(f.date, selectedDay)),
    [festivals, selectedDay]
  );

  const navigate = (dir) => {
    setAnchor((prev) => {
      const d = new Date(prev);
      if (view === 'week' || view === 'today') d.setDate(d.getDate() + dir * 7);
      else d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const openReschedule = (entry) => {
    const current = entry.scheduledFor ? new Date(entry.scheduledFor) : new Date();
    const local = new Date(current.getTime() - current.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setRescheduleEntry(entry);
    setRescheduleValue(local);
  };

  const saveReschedule = async () => {
    if (!rescheduleEntry || !rescheduleValue) return;
    setScheduleBusy(true);
    setMsg('');
    try {
      const publishAt = new Date(rescheduleValue).toISOString();
      const isContent = rescheduleEntry.kind === 'content';
      const response = await fetch(
        isContent
          ? `/api/content-studio/scheduled/${encodeURIComponent(rescheduleEntry.id)}`
          : `/api/agents/deployments/${encodeURIComponent(rescheduleEntry.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isContent
              ? { companyId: workspaceId, publishAt }
              : { action: 'reschedule', scheduledFor: publishAt }
          ),
        }
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Could not reschedule');
      setMsg('Schedule updated');
      setRescheduleEntry(null);
      setRefresh((n) => n + 1);
    } catch (err) {
      setMsg(err.message || 'Reschedule failed');
    } finally {
      setScheduleBusy(false);
    }
  };

  const cancelScheduled = async (entry) => {
    try {
      const isContent = entry.kind === 'content';
      const response = await fetch(
        isContent
          ? `/api/content-studio/scheduled/${encodeURIComponent(entry.id)}?companyId=${encodeURIComponent(workspaceId)}`
          : `/api/agents/deployments/${encodeURIComponent(entry.id)}`,
        {
          method: isContent ? 'DELETE' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: isContent ? undefined : JSON.stringify({ action: 'stop' }),
        }
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Could not cancel');
      setMsg('Cancelled');
      setRefresh((n) => n + 1);
    } catch (err) {
      setMsg(err.message || 'Cancel failed');
    }
  };

  const cellStyle = (day) => {
    const isToday = isSameDay(day, today);
    const isSelected = isSameDay(day, selectedDay);
    return {
      minHeight: 56,
      border: `1px ${isToday || isSelected ? 'solid' : 'dashed'} ${isToday ? 'var(--color-accent)' : 'var(--color-divider)'}`,
      background: isToday ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)' : 'var(--color-surface)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      position: 'relative',
    };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <JourneyBar screenId="calendar" setActiveScreen={setActiveScreen} title="Marketing Calendar" />
      <p className="text-muted" style={{ margin: 0 }}>
        Agent deployments, scheduled content, automations{CALENDARIFIC_KEY ? ', and festivals' : ''} for {company}.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {['today', 'week', 'month'].map((v) => (
          <button
            key={v}
            type="button"
            className={view === v ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ padding: '6px 12px', fontSize: 12, textTransform: 'capitalize' }}
            onClick={() => {
              setView(v);
              if (v === 'today') {
                setAnchor(new Date());
                setSelectedDay(new Date());
              }
            }}
          >
            {v}
          </button>
        ))}
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => navigate(-1)}><ChevronLeft size={16} /></button>
        <span style={{ fontWeight: 800, fontSize: 14, minWidth: 180, textAlign: 'center' }}>{rangeLabel}</span>
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => navigate(1)}><ChevronRight size={16} /></button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginLeft: 'auto' }}
          onClick={() => { setAnchor(new Date()); setSelectedDay(new Date()); setView('today'); }}
        >
          Today
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setRefresh((n) => n + 1)}>Refresh</button>
      </div>

      {msg ? <p className="text-muted" style={{ margin: 0, fontSize: 12 }}>{msg}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ padding: 12, overflow: 'auto' }}>
          {loading ? (
            <p className="text-muted">Loading calendar…</p>
          ) : view === 'month' ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                {DAY_NAMES.map((d) => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--color-muted)' }}>{d}</div>
                ))}
              </div>
              {monthWeeks.map((week, wi) => (
                <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                  {week.map((day, di) => {
                    const inMonth = day.getMonth() === anchor.getMonth();
                    const has = deploymentDaySet.has(day.toDateString());
                    const fest = festivalDaySet.has(day.toDateString());
                    return (
                      <button
                        key={di}
                        type="button"
                        style={{
                          ...cellStyle(day),
                          opacity: inMonth ? 1 : 0.4,
                          minHeight: 64,
                          flexDirection: 'column',
                          gap: 4,
                        }}
                        onClick={() => setSelectedDay(day)}
                      >
                        <span style={{ fontWeight: 800, fontSize: 13 }}>{day.getDate()}</span>
                        {(has || fest) && (
                          <span style={{ width: 6, height: 6, background: 'var(--color-accent)', display: 'inline-block' }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
                <div />
                {(view === 'today' ? [selectedDay] : weekDays).map((day, i) => {
                  const days = view === 'today' ? [selectedDay] : weekDays;
                  const d = days[i] || day;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedDay(d)}
                      style={{
                        border: 0,
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: 8,
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: isSameDay(d, today) ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                        {DAY_NAMES[d.getDay()]}
                      </div>
                      <div style={{
                        fontWeight: 800,
                        fontSize: 14,
                        marginTop: 4,
                        width: 28,
                        height: 28,
                        lineHeight: '28px',
                        margin: '4px auto 0',
                        background: isSameDay(d, today) ? 'var(--color-accent)' : 'transparent',
                        color: isSameDay(d, today) ? 'var(--color-bg)' : 'var(--color-text)',
                      }}>
                        {d.getDate()}
                      </div>
                    </button>
                  );
                })}
              </div>

              {PLATFORMS.map((platform) => {
                const days = view === 'today' ? [selectedDay] : weekDays;
                return (
                  <div
                    key={platform.id}
                    style={{ display: 'grid', gridTemplateColumns: view === 'today' ? '52px 1fr' : '52px repeat(7, 1fr)', gap: 4, marginBottom: 4 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>
                      <platform.Icon size={14} style={{ color: platform.color, opacity: 0.7 }} />
                    </div>
                    {days.map((day, i) => {
                      const has =
                        deploymentDaySet.has(day.toDateString()) &&
                        (platform.id === 'blog' ||
                          deployments.some(
                            (d) =>
                              d.scheduledFor &&
                              isSameDay(new Date(d.scheduledFor), day) &&
                              String(d.agentTarget || '').includes(platform.id)
                          ));
                      const fest = festivalDaySet.has(day.toDateString()) && platform.id === 'blog';
                      return (
                        <button
                          key={i}
                          type="button"
                          style={cellStyle(day)}
                          onClick={() => {
                            setSelectedDay(day);
                            setNewPostModal({ platformId: platform.id, platformLabel: platform.label, day });
                          }}
                          title={`New ${platform.label} post`}
                        >
                          {(has || fest) ? (
                            <platform.Icon size={14} style={{ color: 'var(--color-accent)' }} />
                          ) : (
                            <platform.Icon size={14} style={{ color: platform.color, opacity: 0.25 }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>
            {selectedDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </h3>
          {selectedDayFestivals.map((f) => (
            <div key={f.name} style={{ marginBottom: 8, padding: 8, border: '1px solid var(--color-divider)', fontSize: 12 }}>
              <strong>{f.name}</strong>
              <div className="text-muted">{f.description?.slice(0, 120)}</div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: 6, fontSize: 11 }}
                onClick={() => {
                  try {
                    sessionStorage.setItem(
                      'marqq_festival_campaign',
                      JSON.stringify({ name: f.name, date: f.date.toISOString() })
                    );
                  } catch { /* ignore */ }
                  setActiveScreen && setActiveScreen('social');
                }}
              >
                Run campaign
              </button>
            </div>
          ))}
          {!selectedDayItems.length && !selectedDayFestivals.length ? (
            <p className="text-muted" style={{ fontSize: 13 }}>Nothing scheduled. Click a platform cell to compose.</p>
          ) : (
            selectedDayItems.map((entry) => (
              <div key={entry.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--color-divider)' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{entry.sectionTitle}</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                  {entry.kind} · {entry.agentName} · {entry.status}
                  {entry.scheduledFor ? ` · ${new Date(entry.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {setActiveScreen && entry.openScreen ? (
                    <button type="button" className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setActiveScreen(entry.openScreen)}>
                      Open
                    </button>
                  ) : null}
                  {(entry.kind === 'content' || entry.kind === 'deployment') && (
                    <>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => openReschedule(entry)}>
                        Reschedule
                      </button>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => cancelScheduled(entry)}>
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {rescheduleEntry && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setRescheduleEntry(null)}
        >
          <div className="card" style={{ width: 360 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Reschedule</h3>
            <input
              className="input"
              type="datetime-local"
              value={rescheduleValue}
              onChange={(e) => setRescheduleValue(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setRescheduleEntry(null)}>Close</button>
              <button type="button" className="btn btn-primary" disabled={scheduleBusy} onClick={saveReschedule}>
                {scheduleBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {newPostModal && (
        <NewPostModal
          modal={newPostModal}
          companyId={workspaceId}
          onClose={() => setNewPostModal(null)}
          onSaved={() => setRefresh((n) => n + 1)}
        />
      )}
    </div>
  );
}
