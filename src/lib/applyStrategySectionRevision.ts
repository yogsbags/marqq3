/**
 * Apply an Ask Marqq section revision into the locked GTM strategy
 * and refresh agent deployments so agents run on the new copy.
 */

import { apiFetch } from "./apiFetch.js";
import { getActiveWorkspaceId } from "./brandContext.js";
import { buildAgentOs, saveAgentOs } from "./agents/persist";
import {
  formatStrategySectionForChat,
  sectionIdToAskChannel,
} from "./askMarqqContext";

const GTM_STRATEGY_SESSION_KEY = "marqq_gtm_strategy";
const GTM_WIZARD_SESSION_KEY = "marqq_gtm_wizard";

const REVISION_START = "<<<STRATEGY_REVISION>>>";
const REVISION_END = "<<<END_STRATEGY_REVISION>>>";

export type StrategySectionRevision = {
  title?: string;
  summary?: string;
  body?: string;
  bullets?: string[];
  subsections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
};

export type ParsedRevisionMessage = {
  displayText: string;
  revision: StrategySectionRevision | null;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v || "").trim()).filter(Boolean);
}

function normalizeRevision(raw: unknown): StrategySectionRevision | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const summary = String(o.summary || "").trim();
  const body = String(o.body || "").trim();
  const bullets = asStringArray(o.bullets);
  const title = String(o.title || "").trim();
  const subsections = Array.isArray(o.subsections)
    ? o.subsections
        .filter((s) => s && typeof s === "object")
        .map((s) => {
          const sub = s as Record<string, unknown>;
          return {
            title: String(sub.title || "").trim() || undefined,
            body: String(sub.body || "").trim() || undefined,
            bullets: asStringArray(sub.bullets),
          };
        })
        .filter((s) => s.title || s.body || (s.bullets && s.bullets.length))
    : undefined;

  if (!summary && !body && !bullets.length && !(subsections && subsections.length)) {
    return null;
  }
  return {
    ...(title ? { title } : {}),
    ...(summary ? { summary } : {}),
    ...(body ? { body } : {}),
    ...(bullets.length ? { bullets } : {}),
    ...(subsections?.length ? { subsections } : {}),
  };
}

/** Extract machine revision block from an assistant reply; strip it from display text. */
export function parseStrategyRevisionBlock(text: string): ParsedRevisionMessage {
  const raw = String(text || "");
  const start = raw.indexOf(REVISION_START);
  const end = raw.indexOf(REVISION_END);
  if (start < 0 || end < 0 || end <= start) {
    return { displayText: raw.trim(), revision: null };
  }

  const inner = raw.slice(start + REVISION_START.length, end).trim();
  const displayText = `${raw.slice(0, start).trim()}\n\n${raw.slice(end + REVISION_END.length).trim()}`.trim();

  let revision: StrategySectionRevision | null = null;
  try {
    revision = normalizeRevision(JSON.parse(inner));
  } catch {
    // Plain markdown / prose inside markers → treat as body
    if (inner.trim()) {
      revision = { body: inner.trim() };
    }
  }

  return {
    displayText: displayText || "Proposed strategy revision ready to apply.",
    revision,
  };
}

export function loadStrategyDocRaw(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(GTM_STRATEGY_SESSION_KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw);
    return doc && typeof doc === "object" ? doc : null;
  } catch {
    return null;
  }
}

function mergeSection(
  existing: Record<string, unknown>,
  revision: StrategySectionRevision
): Record<string, unknown> {
  return {
    ...existing,
    ...(revision.title ? { title: revision.title } : {}),
    ...(revision.summary !== undefined ? { summary: revision.summary } : {}),
    ...(revision.body !== undefined ? { body: revision.body } : {}),
    ...(revision.bullets !== undefined ? { bullets: revision.bullets } : {}),
    ...(revision.subsections !== undefined ? { subsections: revision.subsections } : {}),
    revisedAt: new Date().toISOString(),
    revisedVia: "ask_marqq",
  };
}

/**
 * Persist section revision locally, re-lock GTM module, activate Agent OS,
 * and refresh deployments for the revised section.
 */
export async function applyStrategySectionRevision(input: {
  sectionId: string;
  revision: StrategySectionRevision;
}): Promise<{
  ok: boolean;
  error?: string;
  strategy?: Record<string, unknown>;
  channelText?: string;
  deploymentsUpdated?: number;
}> {
  const sectionId = String(input.sectionId || "").trim();
  const revision = normalizeRevision(input.revision);
  if (!sectionId) return { ok: false, error: "sectionId required" };
  if (!revision) return { ok: false, error: "Empty revision" };

  const doc = loadStrategyDocRaw();
  if (!doc) return { ok: false, error: "No locked strategy document found" };

  const sections = Array.isArray(doc.sections) ? [...(doc.sections as Record<string, unknown>[])] : [];
  const idx = sections.findIndex((s) => String(s?.id || "") === sectionId);
  if (idx < 0) {
    return { ok: false, error: `Section ${sectionId} not found in strategy` };
  }

  const nextSection = mergeSection(sections[idx] || { id: sectionId }, revision);
  sections[idx] = nextSection;

  const nextDoc: Record<string, unknown> = {
    ...doc,
    sections,
    updatedAt: new Date().toISOString(),
    lastRevisedSectionId: sectionId,
  };

  if (sectionId === "executive_summary") {
    const exec = String(revision.summary || revision.body || "").trim();
    if (exec) nextDoc.executiveSummary = exec;
  }

  try {
    sessionStorage.setItem(GTM_STRATEGY_SESSION_KEY, JSON.stringify(nextDoc));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save strategy" };
  }

  // Keep wizard cache in sync so Strategy screen / rehydrate see the same doc
  try {
    const wizRaw = sessionStorage.getItem(GTM_WIZARD_SESSION_KEY);
    if (wizRaw) {
      const wizard = JSON.parse(wizRaw);
      if (wizard && typeof wizard === "object") {
        wizard.strategy = nextDoc;
        wizard.phase = wizard.phase || "complete";
        sessionStorage.setItem(GTM_WIZARD_SESSION_KEY, JSON.stringify(wizard));
      }
    }
  } catch {
    /* non-fatal */
  }

  const workspaceId = getActiveWorkspaceId();
  let wizardState: Record<string, unknown> = {
    strategy: nextDoc,
    phase: "complete",
    companyName: localStorage.getItem("marqq_ob_companyName") || "",
    website: localStorage.getItem("marqq_ob_website") || "",
  };
  try {
    const wizRaw = sessionStorage.getItem(GTM_WIZARD_SESSION_KEY);
    if (wizRaw) {
      const wizard = JSON.parse(wizRaw);
      if (wizard && typeof wizard === "object") {
        wizardState = {
          ...wizard,
          strategy: nextDoc,
          companyName: wizard.companyName || wizardState.companyName,
          website: wizard.website || wizardState.website,
        };
      }
    }
  } catch {
    /* use defaults */
  }

  let os;
  try {
    os = buildAgentOs({
      goalSystem: (nextDoc.goalAlignment as Record<string, unknown>) || null,
      strategyDocument: {
        title: String(nextDoc.title || ""),
        executiveSummary: String(nextDoc.executiveSummary || ""),
        sectionIds: sections.map((s) => String(s.id || "")).filter(Boolean),
      },
    });
    saveAgentOs(os);
  } catch {
    os = null;
  }

  const moduleId =
    (typeof localStorage !== "undefined" && localStorage.getItem("marqq_active_gtm_module_id")) ||
    null;

  const lockRes = await apiFetch("/api/gtm/modules/lock", {
    method: "POST",
    body: JSON.stringify({ workspaceId, moduleId: moduleId || undefined, wizardState }),
  }).catch(() => null);
  const lockJson = lockRes ? await lockRes.json().catch(() => ({})) : {};
  if (lockRes && !lockRes.ok && lockJson?.error) {
    console.warn("[strategy-revise] lock failed:", lockJson.error);
  }

  const activateRes = await apiFetch("/api/strategy/activate", {
    method: "POST",
    body: JSON.stringify({
      workspaceId,
      strategy: nextDoc,
      agentOs: os,
      revisedSectionId: sectionId,
    }),
  }).catch(() => null);
  const activateJson = activateRes ? await activateRes.json().catch(() => ({})) : {};
  if (activateRes && !activateRes.ok) {
    return {
      ok: false,
      error: activateJson?.error || "Failed to re-activate strategy for agents",
      strategy: nextDoc,
    };
  }

  const channelText = formatStrategySectionForChat({
    id: sectionId,
    title: String(nextSection.title || sectionId),
    summary: String(nextSection.summary || ""),
    body: String(nextSection.body || ""),
    bullets: Array.isArray(nextSection.bullets) ? (nextSection.bullets as string[]) : [],
    subsections: Array.isArray(nextSection.subsections)
      ? (nextSection.subsections as Array<{ title?: string; body?: string; bullets?: string[] }>)
      : [],
  });

  return {
    ok: true,
    strategy: nextDoc,
    channelText,
    deploymentsUpdated:
      Number(activateJson?.deploymentsUpdated ?? activateJson?.deploymentsCreated ?? 0) || 0,
  };
}

export function revisionPromptHint(channel: string): string {
  const sectionLabel = channel.replace(/-/g, " ");
  return `When the user asks to change, rewrite, update, or revise this #${channel} (${sectionLabel}) section, you MUST:
1) Show a short human-readable preview of the new section (markdown).
2) Then emit a machine block EXACTLY in this form (JSON only inside):

${REVISION_START}
{"summary":"1-2 sentence Marqq-will summary","body":"revised section body","bullets":["action 1","action 2"],"subsections":[{"title":"Optional","body":"...","bullets":[]}]}
${REVISION_END}

Rules for the JSON:
- Stay in this section's lane only.
- Voice: "Marqq will…" — never "{Company} should…".
- Preserve useful content the user did not ask to change.
- Keep bullets concrete and executable for agents.
- Do NOT invent a different section id.

After the block, tell the user they can click **Apply to strategy & re-lock** so agents use the revision.`;
}

export { REVISION_START, REVISION_END, sectionIdToAskChannel };
