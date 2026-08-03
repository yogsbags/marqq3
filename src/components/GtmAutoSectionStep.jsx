import {  useEffect, useRef, useState  } from "react";
import {  Pencil, Plus, X  } from "lucide-react";
import {  BrandStyleLoader  } from "./BrandStyleLoader";
import { 
  GTM_AUTO_STRATEGY_SECTIONS,
  saveGtmAutoSections,
 } from "../lib/gtmAutoSections";
import {   getActiveWorkspaceId  } from "../lib/brandContext";

async function generateSection(input) {
  const res = await fetch("/api/gtm/auto-sections/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sectionId: input.sectionId,
      companyName: input.companyName,
      websiteUrl: input.websiteUrl,
      industry: input.niche,
      icp: input.icp,
      brandDna: input.brandDna,
      onboarding: {
        company: input.companyName,
        websiteUrl: input.websiteUrl,
        industry: input.niche,
        icp: input.icp,
        primaryGoal: input.outcome,
        goals: input.outcome,
        timelineTarget: input.timeWindow,
        quantifiedTarget: input.target,
        successBaseline: input.baseline,
      },
      priorSections: input.priorSections,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Failed to generate section (${res.status})`);
  const s = json.section || {};
  return {
    id: String(s.id || input.sectionId),
    title: String(s.title || input.sectionId),
    channel: String(s.channel || ""),
    summary: String(s.summary || "").trim(),
    bullets: Array.isArray(s.bullets)
      ? s.bullets.map((b) => String(b || "").trim()).filter(Boolean)
      : [],
    body: String(s.body || "").trim(),
    subsections: Array.isArray(s.subsections) ? s.subsections : [],
  };
}

/**
 * GTM Wizard briefs queue — market analysis → timeline (before Goals interview).
 */
export function GtmAutoSectionStep({
  companyName,
  websiteUrl,
  niche,
  icp,
  outcome,
  timeWindow,
  target,
  baseline,
  brandDna,
  approvedSections,
  onApprovedChange,
  onSectionIndexChange,
  jumpToIndex,
  onConfirmAll,
  onBack,
  onSkipRemaining,
}) {
  const startIndex = Math.min(
    approvedSections.length,
    GTM_AUTO_STRATEGY_SECTIONS.length - 1
  );
  const [index, setIndex] = useState(startIndex);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingBullets, setEditingBullets] = useState(false);
  const [newBullet, setNewBullet] = useState("");
  const genKeyRef = useRef(null);

  useEffect(() => {
    if (typeof onSectionIndexChange === "function") onSectionIndexChange(index);
  }, [index, onSectionIndexChange]);

  // External navigation from progress chips
  useEffect(() => {
    if (typeof jumpToIndex !== "number") return;
    const next = Math.min(Math.max(jumpToIndex, 0), GTM_AUTO_STRATEGY_SECTIONS.length - 1);
    if (next !== index) setIndex(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to external jumps
  }, [jumpToIndex]);

  const meta = GTM_AUTO_STRATEGY_SECTIONS[index];
  const total = GTM_AUTO_STRATEGY_SECTIONS.length;
  const isLast = index >= total - 1;

  useEffect(() => {
    if (!meta) return;
    const existing = approvedSections.find((s) => s.id === meta.id);
    const key = `${meta.id}|${approvedSections.length}`;
    if (genKeyRef.current === key && draft?.id === meta.id) return;

    if (existing?.summary) {
      genKeyRef.current = key;
      setDraft(existing);
      setLoading(false);
      setError(null);
      setEditingBullets(false);
      return;
    }

    let cancelled = false;
    genKeyRef.current = key;
    setLoading(true);
    setError(null);
    setEditingBullets(false);
    setDraft(null);

    void generateSection({
      sectionId: meta.id,
      companyName,
      websiteUrl,
      niche,
      icp,
      outcome,
      timeWindow,
      target,
      baseline,
      brandDna,
      priorSections: approvedSections.filter((s) => s.id !== meta.id),
    })
      .then((section) => {
        if (cancelled) return;
        setDraft(section);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Generation failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, meta?.id]);

  function patchDraft(partial) {
    setDraft((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  function persistOrdered(nextApproved) {
    const ordered = GTM_AUTO_STRATEGY_SECTIONS.map(
      (def) => nextApproved.find((s) => s.id === def.id) || null
    ).filter(Boolean);
    onApprovedChange(ordered);
    try {
      saveGtmAutoSections(getActiveWorkspaceId(), ordered);
    } catch {
      /* ignore */
    }
    return ordered;
  }

  function looksGood() {
    if (!draft || !meta) return;
    const approved = {
      ...draft,
      id: meta.id,
      title: draft.title || meta.title,
      channel: draft.channel || "",
      approvedAt: new Date().toISOString(),
    };
    const without = approvedSections.filter((s) => s.id !== meta.id);
    persistOrdered([...without, approved]);

    if (isLast) {
      onConfirmAll();
      return;
    }
    setIndex((i) => i + 1);
  }

  function goBack() {
    if (index > 0) {
      setIndex((i) => i - 1);
      return;
    }
    if (typeof onBack === "function") onBack();
  }

  if (!meta) return null;

  if (loading || !draft) {
    return (
      <div>
        <BrandStyleLoader
          title={`Drafting ${meta.title}`}
          website={websiteUrl}
          steps={[
            { icon: "✦", label: `Section ${index + 1} of ${total}`, detail: meta.title },
            { icon: "📚", label: "Loading skill playbook", detail: "Marqq2 marketing skills" },
            { icon: "🤖", label: "Generating draft", detail: "Groq + Brand DNA" },
            { icon: "✏️", label: "Ready for review", detail: "Edit before Looks good" },
          ]}
          messages={[
            `Drafting ${meta.title}…`,
            "Loading Marqq2 skill playbook…",
            "Grounding in Brand DNA and ICP…",
            "Staying in this section's lane…",
            "Almost ready for your review…",
          ]}
        />
        {error ? (
          <div
            style={{
              marginTop: 16,
              padding: "12px 14px",
              border: "1px solid rgba(242,121,10,0.35)",
              background: "rgba(242,121,10,0.1)",
              fontSize: 13,
            }}
          >
            {error}{" "}
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 12, padding: "2px 8px" }}
              onClick={() => {
                genKeyRef.current = null;
                setIndex((i) => i);
              }}
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: 1100 }}>
      <p
        className="text-muted"
        style={{
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 800,
          marginBottom: 8,
        }}
      >
        Section {index + 1} of {total}
      </p>
      <h4 style={{ marginBottom: 6 }}>{meta.title}</h4>
      <p className="text-muted" style={{ marginBottom: 20, fontSize: 13 }}>
        {meta.blurb}
      </p>

      {error ? (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            border: "1px solid rgba(242,121,10,0.35)",
            background: "rgba(242,121,10,0.1)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div className="card" style={{ padding: "14px 16px" }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "rgba(255,255,255,0.35)",
              marginBottom: 8,
            }}
          >
            Recommendation
          </div>
          <textarea
            className="input"
            value={draft.summary}
            onChange={(e) => patchDraft({ summary: e.target.value })}
            rows={meta.id === "market_analysis" ? 3 : 2}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              fontWeight: 700,
              fontSize: 16,
              lineHeight: 1.4,
              resize: "vertical",
              minHeight: 56,
            }}
            placeholder="One-line recommendation"
          />
        </div>

        <div className="card" style={{ padding: "14px 16px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "rgba(255,255,255,0.35)",
              }}
            >
              {meta.bulletsLabel || "Plays"}
            </div>
            <button
              type="button"
              onClick={() => setEditingBullets((v) => !v)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: editingBullets ? "var(--color-accent)" : "rgba(255,255,255,0.4)",
                padding: 4,
              }}
              aria-label="Edit plays"
            >
              <Pencil size={14} />
            </button>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {draft.bullets.map((b, idx) =>
              editingBullets ? (
                <li key={`edit-${idx}`} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ marginTop: 8, width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
                  <input
                    className="input"
                    value={b}
                    onChange={(e) => {
                      const next = [...draft.bullets];
                      next[idx] = e.target.value;
                      patchDraft({ bullets: next });
                    }}
                    style={{ flex: 1, fontSize: 13, padding: "6px 8px" }}
                  />
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() =>
                      patchDraft({ bullets: draft.bullets.filter((_, i) => i !== idx) })
                    }
                    style={{
                      background: "none",
                      border: "none",
                      color: "rgba(255,255,255,0.35)",
                      cursor: "pointer",
                      padding: 4,
                    }}
                  >
                    <X size={14} />
                  </button>
                </li>
              ) : (
                <li
                  key={`b-${idx}`}
                  style={{
                    display: "flex",
                    gap: 10,
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: "rgba(255,255,255,0.75)",
                  }}
                >
                  <span style={{ marginTop: 8, width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
                  <span>{b}</span>
                </li>
              )
            )}
          </ul>
          {editingBullets ? (
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid var(--color-divider)",
                display: "flex",
                gap: 8,
              }}
            >
              <input
                className="input"
                value={newBullet}
                onChange={(e) => setNewBullet(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = newBullet.trim();
                    if (!v) return;
                    patchDraft({ bullets: [...draft.bullets, v] });
                    setNewBullet("");
                  }
                }}
                placeholder={
                  meta.id === "market_analysis" ? "Add a decision…" : "Add a play…"
                }
                style={{ flex: 1, fontSize: 13 }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!newBullet.trim()}
                onClick={() => {
                  const v = newBullet.trim();
                  if (!v) return;
                  patchDraft({ bullets: [...draft.bullets, v] });
                  setNewBullet("");
                }}
                style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Plus size={12} /> Add
              </button>
            </div>
          ) : null}
        </div>

        <div className="card" style={{ padding: "14px 16px" }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "rgba(255,255,255,0.35)",
              marginBottom: 8,
            }}
          >
            Detail
          </div>
          <textarea
            className="input"
            value={draft.body}
            onChange={(e) => patchDraft({ body: e.target.value })}
            rows={6}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              fontSize: 13,
              lineHeight: 1.55,
              resize: "vertical",
              color: "rgba(255,255,255,0.75)",
            }}
            placeholder="Actionable guidance for this section"
          />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={goBack}>
          Back
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}
            onClick={onSkipRemaining}
          >
            Skip remaining drafts
          </button>
          <button type="button" className="btn btn-primary" onClick={looksGood}>
            {isLast ? "Looks good →" : "Looks good →"}
          </button>
        </div>
      </div>
    </div>
  );
}
