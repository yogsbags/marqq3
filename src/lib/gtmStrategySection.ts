/** Marqq2-aligned strategy section generation (Goals → financial / CS / ops, etc.). */

import { answerLabel, type GtmAnswers } from "./gtmInterview";
import {
  NORTH_STAR_PRINCIPLES,
  normalizeGoalSystem,
  normalizeSectionTargets,
  structuralGoalSystemFromAnswers,
  type GtmGoalSystemNorm,
} from "./gtmNorthStar";

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY || "";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = import.meta.env.VITE_GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_REASONING_EFFORT = import.meta.env.VITE_GROQ_REASONING_EFFORT || "medium";
const IS_QWEN_MODEL = /qwen3/i.test(GROQ_MODEL);

/** Client cache of Marqq2 skill playbooks fetched from the API. */
const skillPlaybookCache = new Map<string, string>();

async function fetchSectionSkillPlaybook(sectionId: string): Promise<{
  playbook: string;
  skillIds: string[];
  loaded: boolean;
}> {
  if (skillPlaybookCache.has(sectionId)) {
    return {
      playbook: skillPlaybookCache.get(sectionId) || "",
      skillIds: [],
      loaded: Boolean(skillPlaybookCache.get(sectionId)),
    };
  }
  try {
    const res = await fetch(
      `/api/gtm/strategy-section-skills/${encodeURIComponent(sectionId)}`
    );
    if (!res.ok) {
      console.warn("[gtm-section] skill fetch HTTP", res.status);
      return { playbook: "", skillIds: [], loaded: false };
    }
    const data = (await res.json()) as {
      playbook?: string;
      skillIds?: string[];
      loaded?: boolean;
      warning?: string;
    };
    if (data.warning) console.warn("[gtm-section] skills:", data.warning);
    const playbook = String(data.playbook || "").trim();
    if (playbook) skillPlaybookCache.set(sectionId, playbook);
    return {
      playbook,
      skillIds: Array.isArray(data.skillIds) ? data.skillIds : [],
      loaded: Boolean(data.loaded && playbook),
    };
  } catch (err) {
    console.warn("[gtm-section] skill fetch failed:", err);
    return { playbook: "", skillIds: [], loaded: false };
  }
}


export interface GtmStrategySubsection {
  title: string;
  body: string;
  bullets?: string[];
}

export interface GtmSectionTarget {
  metric: string;
  contribution: string;
  owner: string;
  targetType?: string;
  byWhen: string;
}

export interface GtmGoalSystem {
  business_archetype?: string | null;
  north_star_metric?: string | null;
  metric_definition?: string | null;
  ultimate_outcome_metric?: string | null;
  quantified_target?: string | null;
  timeline_target?: string | null;
  metric_tree?: string[];
  guardrails?: string[];
  primary_loop?: string[];
  rejects_as_nsm?: string[];
}

export type { GtmGoalSystemNorm };

export interface GtmStrategySectionDraft {
  id: string;
  title: string;
  summary: string;
  bullets: string[];
  body: string;
  subsections?: GtmStrategySubsection[];
  sectionTarget?: GtmSectionTarget;
  proposedNorthStar?: string;
  proposedGoalSystem?: GtmGoalSystem | null;
  approvedAt?: string;
}

export interface StrategySectionGenContext {
  companyName: string;
  website?: string;
  niche?: string;
  icp?: string;
  outcome?: string;
  target?: string;
  baseline?: string;
  timeWindow?: string;
}

const SECTION_LANE_PROMPTS: Record<string, string> = {
  financial_plan: `SECTION LANE — financial_plan ONLY:
- Cover: budget allocation, CAC/CLTV ceilings, payback, spend scenarios, kill/scale rules for money.
- Do NOT cover: activation, retention, onboarding, health scores, RACI, CRM hygiene, standup cadence.
- Subsection titles should be finance-flavored (e.g. Budget allocation, CAC ceiling, Scenarios).`,
  customer_success: `SECTION LANE — customer_success ONLY:
- If services/consulting: engagement kickoff → first value milestone → retainer/expansion. Avoid SaaS "activation/health score" unless a product is explicit.
- If SaaS/product: activation, time-to-value, retention, expansion, health scores.
- Do NOT cover: budget bands, CAC ceilings, RACI, stack connectors, weekly ops standups, channel spend.
- Subsection titles should match the motion (e.g. Kickoff & first value, Expansion, Retention loop — or Activation for SaaS).`,
  operations_execution: `SECTION LANE — operations_execution ONLY:
- Cover: owners / RACI, workflows, tool stack readiness, weekly scorecard cadence, instrumentation before scale.
- Do NOT cover: activation events, retention/expansion plays, health scores, CAC ceilings, budget % splits.
- Do NOT reuse customer_success content. This is ops execution, not CS.
- Subsection titles MUST be ops-flavored (e.g. RACI & cadence, Stack readiness, Weekly scorecard) — never Activation / Expansion / Retention.`,
  product_strategy: `SECTION LANE — product_strategy ONLY: packaging, time-to-value of the offer, product shape. Not CS or ops.`,
  pricing_monetization: `SECTION LANE — pricing_monetization ONLY: price points, packaging, monetization path. Not CS or ops.`,
  target_customer: `SECTION LANE — target_customer ONLY: ICP, personas, triggers, disqualifiers. Buyers of THIS company — not peer firms. Not CS or ops.`,
};

const SECTION_TITLES: Record<string, string> = {
  financial_plan: "Financial plan",
  customer_success: "Customer success",
  operations_execution: "Operations & execution",
  product_strategy: "Product strategy",
  pricing_monetization: "Pricing & monetization",
  target_customer: "Target customer",
};

function sectionLooksLikeCustomerSuccess(draft: GtmStrategySectionDraft): boolean {
  const blob = [
    draft.summary,
    ...(draft.bullets || []),
    ...(draft.subsections || []).flatMap((s) => [s.title, ...(s.bullets || []), s.body || ""]),
  ]
    .join(" ")
    .toLowerCase();
  const csHits = [
    "activation",
    "time-to-value",
    "time to value",
    "retention",
    "expansion play",
    "health score",
    "onboarding path",
    "first value",
  ].filter((k) => blob.includes(k)).length;
  const opsHits = [
    "raci",
    "scorecard",
    "stack",
    "crm hygiene",
    "standup",
    "connector",
    "owner",
    "instrument",
  ].filter((k) => blob.includes(k)).length;
  return csHits >= 3 && opsHits < 2;
}

const NORTH_STAR_SECTION_VOICE = `You write strategy that Marqq agents will execute toward a North Star for the customer company.

Voice (critical):
- Write as Marqq acting for the company — never as advice TO the company.
- Summary and body MUST use "Marqq will…" (or "Marqq agents will…") as the acting subject.
- NEVER write "{Company} should…", "Elevate should…", "We recommend…", or "The company should…".
- The company name is the CLIENT Marqq serves; Marqq is the subject doing the work.

${NORTH_STAR_PRINCIPLES}`;

/** Rewrite advisory company-voice into Marqq agent voice. */
function rewriteToMarqqVoice(text: string, companyName?: string): string {
  let out = String(text || "").trim();
  if (!out) return out;
  const company = String(companyName || "").trim();
  if (company) {
    const esc = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`^${esc}\\s+should\\b`, "i"), "Marqq will");
    out = out.replace(new RegExp(`\\b${esc}\\s+should\\b`, "gi"), "Marqq will");
    out = out.replace(new RegExp(`^${esc}\\s+needs?\\s+to\\b`, "i"), "Marqq will");
  }
  out = out.replace(/\bThe company should\b/gi, "Marqq will");
  out = out.replace(/\bWe recommend that\b/gi, "Marqq will");
  out = out.replace(/\bWe recommend\b/gi, "Marqq will");
  out = out.replace(/\bIt is recommended that\b/gi, "Marqq will");
  return out;
}

function a(answers: GtmAnswers, id: string): string {
  return answerLabel(answers[id]) || "";
}

function structuralGoalSystem(
  ctx: StrategySectionGenContext,
  answers: GtmAnswers
): GtmGoalSystemNorm {
  return structuralGoalSystemFromAnswers({
    outcome: a(answers, "priority_90d") || ctx.outcome,
    target: a(answers, "quantified_target") || ctx.target,
    timeline: a(answers, "timeline_target") || ctx.timeWindow,
    baseline: a(answers, "success_baseline") || ctx.baseline,
    channel: a(answers, "channel_bet"),
    companyName: ctx.companyName,
    niche: ctx.niche,
  });
}

function fallbackSection(
  sectionId: string,
  ctx: StrategySectionGenContext,
  answers: GtmAnswers,
  goalSystem: GtmGoalSystem
): GtmStrategySectionDraft {
  const title = SECTION_TITLES[sectionId] || sectionId.replace(/_/g, " ");
  const budget = a(answers, "budget_band");
  const channel = a(answers, "channel_bet");
  const quantified = goalSystem.quantified_target || a(answers, "quantified_target") || ctx.target;
  const timeline = goalSystem.timeline_target || a(answers, "timeline_target") || ctx.timeWindow;
  const baseline = a(answers, "success_baseline") || ctx.baseline;

  if (sectionId === "financial_plan") {
    const zeroBudget =
      /zero|organic|₹0|\$0/i.test(budget || "") || a(answers, "budget_band") === "zero";
    return {
      id: sectionId,
      title,
      summary: zeroBudget
        ? `Marqq will run a zero-cash GTM plan for ${ctx.companyName} toward ${quantified}, converting owned capacity into pipeline.`
        : `Marqq will keep spend within ${budget || "the budget band"} under a CAC/CLTV ceiling toward ${quantified}.`,
      bullets: zeroBudget
        ? [
            "Zero paid media — capacity on owned/organic and warm intros only",
            `Primary bet: ${channel || "organic / content-led"} with a weekly output SLA`,
            "Capacity ceiling: treat team hours/week as the budget",
            "Kill rule: drop plays with no qualified conversations in 2 cycles",
            `Everything maps to ${quantified} by ${timeline}`,
          ]
        : [
            budget ? `Budget band: ${budget}` : "Set an explicit budget band before scaling paid",
            "Allocate 60–70% to primary channel, 20% tests, 10–20% creative/ops",
            "Set max CAC from assumed CLTV / payback before scaling paid",
            "Scenario plan: base / stretch / cut if CAC breaches ceiling",
            `Everything maps to ${quantified} by ${timeline}`,
          ],
      body: zeroBudget
        ? `Marqq will treat cash spend as $0 for ${ctx.companyName}. The constraint is team hours. Marqq will instrument leading indicators weekly and kill low-yield plays within two cycles.`
        : `Marqq will treat ${budget || "budget"} as a hard constraint for ${ctx.companyName}. Agents will not fund secondary channels until ${channel || "the primary channel"} shows a repeatable path to ${quantified}. Marqq will instrument CAC/CPL weekly and kill tests that breach the ceiling within two cycles.`,
      subsections: [
        {
          title: "North-star system (proposed)",
          body: [
            goalSystem.north_star_metric && `Metric: ${goalSystem.north_star_metric}`,
            goalSystem.metric_definition && `Definition: ${goalSystem.metric_definition}`,
            quantified && `Target: ${quantified}`,
          ]
            .filter(Boolean)
            .join("\n"),
          bullets: [
            ...(goalSystem.metric_tree || []).slice(0, 4),
            ...(goalSystem.guardrails || []).slice(0, 3).map((g) => `Guardrail: ${g}`),
          ],
        },
        {
          title: zeroBudget ? "Capacity allocation" : "Budget allocation",
          body: zeroBudget
            ? `Marqq will protect weekly hours for ${channel || "organic"} plus a small test slate.`
            : `Primary bet on ${channel || "the locked channel"} with a protected test budget and creative/ops reserve.`,
          bullets: zeroBudget
            ? ["70% primary organic motion", "20% experiments", "10% enablement/ops"]
            : ["60–70% primary", "20% tests", "10–20% creative/ops"],
        },
      ],
      sectionTarget: {
        metric: zeroBudget
          ? "Qualified conversations per week vs capacity"
          : "Blended CAC / CPL vs ceiling",
        contribution: "Keeps growth efficient enough to hit the North Star without burning cash",
        owner: "Growth / performance lead",
        targetType: "leading_indicator",
        byWhen: timeline || "90 days",
      },
      proposedNorthStar: quantified,
      proposedGoalSystem: goalSystem,
    };
  }

  if (sectionId === "customer_success") {
    const services = /\b(consult|strateg|advisory|services|transformation)\b/i.test(
      `${ctx.niche || ""} ${ctx.icp || ""} ${ctx.outcome || ""}`
    );
    if (services) {
      return {
        id: sectionId,
        title,
        summary: `Marqq will run post-sale success for ${ctx.companyName} as kickoff → first value → expansion toward ${quantified}.`,
        bullets: [
          "Marqq will define first-value as a delivered milestone within 14–30 days of kickoff",
          "Marqq will assign a success owner for every closed engagement",
          "Marqq will gate expansion/retainer talks on first-value proof",
          "Marqq will capture references for messaging after successful milestones",
          "Marqq will run a weekly at-risk review for in-flight engagements",
          baseline ? `Baseline: ${baseline}` : "Marqq will establish a rough baseline in week 1",
        ],
        body: "",
        subsections: [
          {
            title: "Kickoff & first value",
            body: "",
            bullets: [
              "Kickoff checklist within 5 business days of close",
              "First-value milestone named + dated",
              "Buyer success criteria written into the SOW",
            ],
          },
          {
            title: "Expansion",
            body: "",
            bullets: [
              "Expansion only after first-value proof",
              "Retainer / phase-2 offer as a one-pager",
              "Proof captured for GTM messaging",
            ],
          },
          {
            title: "Retention loop",
            body: "",
            bullets: [
              "Weekly at-risk scan on active engagements",
              "Save play within SLA when delivery slips",
              "One insight fed back to sales/marketing weekly",
            ],
          },
        ],
        sectionTarget: {
          metric: "Time-to-first-value / engagement health",
          contribution: "Turns closed deals into retained revenue and references",
          owner: "Delivery / CS lead",
          targetType: "leading_indicator",
          byWhen: "First 30–60 days of engagements in this GTM window",
        },
        proposedNorthStar: quantified,
        proposedGoalSystem: goalSystem,
      };
    }
    return {
      id: sectionId,
      title,
      summary: `Marqq will prioritize customer success for ${ctx.companyName} toward ${quantified}.`,
      bullets: [
        `Marqq will drive activation to first value in under 14 days for ${ctx.companyName}`,
        "Marqq will treat onboarding as part of acquisition economics (poor activation = inflated CAC)",
        `Marqq will size CS motions to outcome “${a(answers, "priority_90d") || ctx.outcome}”`,
        "Marqq will define a health score from usage + support + billing risk",
        "Marqq will run expansion plays only after activation is stable",
        "Marqq will feed wins back into proof/messaging weekly",
        baseline ? `Baseline: ${baseline}` : "Marqq will establish a rough baseline in week 1",
      ],
      body: "",
      subsections: [
        {
          title: "Activation",
          body: "",
          bullets: [
            "Marqq will define the first-value / activation event",
            "Marqq will ship a 14-day onboarding path with owner + checklist",
            "Time-to-value target: under 14 days",
            "One activation metric on the weekly scorecard",
          ],
        },
        {
          title: "Expansion",
          body: "",
          bullets: [
            "Marqq will gate expansion on a health-score threshold",
            "Marqq will avoid expansion talks before activation is stable",
            "Marqq will capture proof for messaging from successful activations",
          ],
        },
        {
          title: "Retention loop",
          body: "",
          bullets: [
            "Marqq will monitor churn / at-risk signals weekly",
            "Marqq will route at-risk accounts to a save play within SLA",
            "Marqq will publish one retention insight back to GTM each week",
          ],
        },
      ],
      sectionTarget: {
        metric: "Activation rate / time-to-value",
        contribution: "Improves conversion of acquired demand into retained revenue",
        owner: "Customer success lead",
        targetType: "leading_indicator",
        byWhen: "First 30–60 days of customers acquired in this GTM window",
      },
      proposedNorthStar: quantified,
      proposedGoalSystem: goalSystem,
    };
  }

  if (sectionId === "operations_execution") {
    return {
      id: sectionId,
      title,
      summary: `Marqq will run operations & execution for ${ctx.companyName} with clear owners, stack readiness, and a weekly scorecard toward ${quantified}.`,
      bullets: [
        `Marqq will assign one accountable owner per motion on ${channel || "the lead channel"}`,
        "Marqq will publish a RACI for content, ads/outreach, and CRM hygiene",
        "Marqq will require analytics + CRM + channel connectors live before scale",
        "Marqq will run a weekly GTM standup against a single scorecard",
        "Marqq will instrument leading metrics before increasing spend or capacity",
        `Execution depth: ${a(answers, "strategy_depth") || "Practical 90-day execution"}`,
        a(answers, "budget_band")?.includes("0") || a(answers, "budget_band")?.toLowerCase().includes("organic")
          ? "Zero-budget mode: prioritize owned/organic workflows and manual ops hygiene"
          : "Marqq will keep ops capacity aligned to the locked budget band",
      ],
      body: `Marqq will not leave orphaned channels for ${ctx.companyName}. Agents will instrument first, then scale. Weekly review against the North Star (${quantified}) uses one scorecard — not ad-hoc updates.`,
      subsections: [
        {
          title: "RACI & cadence",
          body: "Marqq will name owners for content, paid/outreach, CRM hygiene, and the weekly review.",
          bullets: [
            "Single accountable owner per motion",
            "Weekly GTM standup (fixed agenda)",
            "CRM hygiene SLA on every stage",
          ],
        },
        {
          title: "Stack readiness",
          body: "Marqq will require analytics, CRM, and channel tools connected before scaling.",
          bullets: [
            "Tracking / attribution live",
            "CRM stages mapped to the funnel",
            "Connector health green before spend or outreach scale",
          ],
        },
        {
          title: "Weekly scorecard",
          body: "Marqq will review one scorecard weekly tied to the North Star and channel leading indicators.",
          bullets: [
            "North Star progress vs plan",
            "Primary channel leading KPI",
            "Kill / keep / scale decision each week",
          ],
        },
      ],
      sectionTarget: {
        metric: "Weekly scorecard completion + owner coverage",
        contribution: "Ensures the GTM plan is executable, not orphaned",
        owner: "GTM ops / CMO",
        targetType: "alignment",
        byWhen: "Within 2 weeks of Goals lock",
      },
      proposedNorthStar: quantified,
      proposedGoalSystem: goalSystem,
    };
  }

  // Generic fallback for offer / audience sections
  return {
    id: sectionId,
    title,
    summary: `Marqq will execute ${title.toLowerCase()} for ${ctx.companyName} from the locked interview answers.`,
    bullets: [
      "Translate answers into concrete next plays",
      "Name owners (roles) and a measurement loop",
      "Call out one hard trade-off",
      "Tie actions to the North Star Metric",
    ],
    body: `Marqq will operationalize ${title.toLowerCase()} into an executable plan with clear prioritization for ${ctx.companyName}.`,
    subsections: [
      {
        title: "Priorities",
        body: "Marqq will focus on the highest-leverage motions first and defer secondary work until the primary path works.",
        bullets: [],
      },
    ],
    sectionTarget: {
      metric: `Leading indicator for ${title}`,
      contribution: `Moves ${quantified || "the North Star"} through this section's lane`,
      owner: "Functional lead",
      targetType: "leading_indicator",
      byWhen: timeline || "90 days",
    },
    proposedNorthStar: quantified,
    proposedGoalSystem: goalSystem,
  };
}

async function groqSectionJson(
  system: string,
  user: string
): Promise<Record<string, unknown> | null> {
  if (!GROQ_KEY) return null;
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.4,
      max_tokens: 2400,
      // Qwen3.6: none|default; gpt-oss: low|medium|high
      reasoning_effort: IS_QWEN_MODEL
        ? GROQ_REASONING_EFFORT === "none"
          ? "none"
          : "default"
        : GROQ_REASONING_EFFORT,
      ...(IS_QWEN_MODEL ? { reasoning_format: "parsed" as const } : {}),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function paragraphToBullets(text: string): string[] {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter((s) => s.length > 3)
    .slice(0, 10);
}

/** Customer success drafts are bullet-only (no paragraph bodies). */
function forceCustomerSuccessBullets(draft: GtmStrategySectionDraft, companyName?: string): GtmStrategySectionDraft {
  const topBullets = [...(draft.bullets || [])];
  if (draft.body?.trim()) {
    for (const b of paragraphToBullets(rewriteToMarqqVoice(draft.body, companyName))) {
      if (!topBullets.includes(b)) topBullets.push(b);
    }
  }
  const subsections = (draft.subsections || []).map((sub) => {
    const bullets = [...(sub.bullets || [])];
    if (sub.body?.trim()) {
      for (const b of paragraphToBullets(rewriteToMarqqVoice(sub.body, companyName))) {
        if (!bullets.includes(b)) bullets.push(b);
      }
    }
    return {
      title: sub.title,
      body: "",
      bullets: bullets.slice(0, 8),
    };
  });
  return {
    ...draft,
    summary: rewriteToMarqqVoice(draft.summary, companyName),
    bullets: topBullets.slice(0, 10),
    body: "",
    subsections,
  };
}

function normalizeDraft(
  parsed: Record<string, unknown> | null,
  fallback: GtmStrategySectionDraft,
  companyName?: string
): GtmStrategySectionDraft {
  if (!parsed) {
    return fallback.id === "customer_success"
      ? forceCustomerSuccessBullets(fallback, companyName)
      : fallback;
  }
  const subsections = Array.isArray(parsed.subsections)
    ? (parsed.subsections as GtmStrategySubsection[])
        .map((s) => ({
          title: String(s?.title || "").trim(),
          body: rewriteToMarqqVoice(String(s?.body || "").trim(), companyName),
          bullets: Array.isArray(s?.bullets)
            ? s.bullets.map((b) => String(b || "").trim()).filter(Boolean).slice(0, 8)
            : [],
        }))
        .filter((s) => s.title || s.body || (s.bullets && s.bullets.length))
    : fallback.subsections;

  const st = parsed.sectionTarget as GtmSectionTarget | undefined;
  const pgsRaw = (parsed.proposedGoalSystem as GtmGoalSystem) || fallback.proposedGoalSystem;
  const pgs = pgsRaw ? normalizeGoalSystem(pgsRaw) : fallback.proposedGoalSystem;

  const draft: GtmStrategySectionDraft = {
    id: String(parsed.id || fallback.id),
    title: String(parsed.title || fallback.title),
    summary:
      rewriteToMarqqVoice(String(parsed.summary || fallback.summary).trim(), companyName) ||
      fallback.summary,
    bullets:
      Array.isArray(parsed.bullets) && parsed.bullets.length
        ? parsed.bullets.map((b) => String(b || "").trim()).filter(Boolean).slice(0, 10)
        : fallback.bullets,
    body:
      rewriteToMarqqVoice(String(parsed.body || fallback.body).trim(), companyName) ||
      fallback.body,
    subsections: subsections?.length ? subsections : fallback.subsections,
    sectionTarget: (() => {
      if (st?.metric || fallback.sectionTarget) {
        const [norm] = normalizeSectionTargets(
          [
            {
              sectionId: String(parsed.id || fallback.id),
              metric: st?.metric || fallback.sectionTarget?.metric,
              contribution: st?.contribution || fallback.sectionTarget?.contribution,
              owner: st?.owner || fallback.sectionTarget?.owner,
              targetType: st?.targetType || fallback.sectionTarget?.targetType,
              byWhen: st?.byWhen || fallback.sectionTarget?.byWhen,
            },
          ],
          [String(parsed.id || fallback.id)],
          st?.byWhen || fallback.sectionTarget?.byWhen || ""
        );
        return {
          metric: norm.metric,
          contribution: norm.contribution,
          owner: norm.owner,
          targetType: norm.targetType,
          byWhen: norm.byWhen,
        };
      }
      return fallback.sectionTarget;
    })(),
    proposedNorthStar:
      String(parsed.proposedNorthStar || "").trim() ||
      (pgs ? String(pgs.quantified_target || "") : "") ||
      fallback.proposedNorthStar,
    proposedGoalSystem: pgs || fallback.proposedGoalSystem,
  };

  if (draft.id === "customer_success") {
    return forceCustomerSuccessBullets(draft, companyName);
  }
  return draft;
}

/**
 * Generate one strategy section (Marqq2 generateOneStrategySection equivalent).
 */
export async function generateStrategySection(input: {
  strategySectionId: string;
  interviewSectionId: string;
  answers: GtmAnswers;
  ctx: StrategySectionGenContext;
  priorSections?: GtmStrategySectionDraft[];
  revisionPrompt?: string;
  currentDraft?: GtmStrategySectionDraft | null;
}): Promise<GtmStrategySectionDraft> {
  const {
    strategySectionId,
    interviewSectionId,
    answers,
    ctx,
    priorSections = [],
    revisionPrompt,
    currentDraft,
  } = input;

  const goalSystem = structuralGoalSystem(ctx, answers);
  const fallback = fallbackSection(strategySectionId, ctx, answers, goalSystem);
  const title = SECTION_TITLES[strategySectionId] || fallback.title;
  const revision = String(revisionPrompt || "").trim();

  const needsGoalSystem =
    interviewSectionId === "goals" ||
    ["financial_plan", "measurement_optimization", "timeline_roadmap"].includes(strategySectionId);

  const bulletsOnlyRule =
    strategySectionId === "customer_success"
      ? `
BULLET-ONLY FORMAT (customer_success):
- "body" MUST be an empty string "".
- Put ALL guidance in "bullets" (6-10 items) and each subsection's "bullets" (3-6 items).
- Subsection "body" MUST be "".
- Do not write paragraph prose anywhere except a short one-line "summary".
`
      : "";

  const laneRule = SECTION_LANE_PROMPTS[strategySectionId] || "";
  const skillPack = await fetchSectionSkillPlaybook(strategySectionId);
  const skillBlock = skillPack.playbook
    ? `\n${skillPack.playbook}\n`
    : "\n(No marketing skill playbook loaded — use SECTION LANE rules and North Star principles.)\n";

  try {
    const parsed = await groqSectionJson(
      `You are a senior GTM strategist. Generate ONE comprehensive strategy section for user review.

${NORTH_STAR_SECTION_VOICE}

${laneRule}
${bulletsOnlyRule}
${skillBlock}

CRITICAL: Output id must be exactly "${strategySectionId}". Do not copy content from other strategy sections. Prior approved sections are context only — stay in THIS lane.
CRITICAL: Apply the skill playbook WITHIN this section's lane only. Lane rules beat skill examples when they conflict.

Return STRICT JSON:
{
  "id": "${strategySectionId}",
  "title": "${title}",
  "summary": "1-2 sentences starting with 'Marqq will…' (never '{Company} should…')",
  "bullets": ["4-10 action bullets"],
  "body": "${strategySectionId === "customer_success" ? "" : "5-10 sentences of actionable guidance in Marqq-will voice"}",
  "subsections": [{ "title": string, "body": "${strategySectionId === "customer_success" ? "" : "string"}", "bullets": string[] }],
  "sectionTarget": { "metric": string, "contribution": string, "owner": string, "targetType": "leading_indicator|alignment", "byWhen": string },
  "proposedNorthStar": "concrete quantified target string",
  "proposedGoalSystem": {
    "business_archetype": string,
    "north_star_metric": string,
    "metric_definition": string,
    "ultimate_outcome_metric": string|null,
    "quantified_target": string,
    "timeline_target": string,
    "metric_tree": string[],
    "guardrails": string[],
    "primary_loop": string[],
    "rejects_as_nsm": string[]
  }
}

Rules:
- Include 2-4 named subsections (not Slack channels).
- Always include a sectionTarget tied to a leading metric (by-when, owner role).
- The sectionTarget must be specific to this business — never placeholders.
- If a proposedGoalSystem is provided, echo/refine it — do not replace with vanity lead metrics.
- Voice: "Marqq will…" — never "${ctx.companyName} should…".
- Recommendations, not interview recap.
- Stay consistent with prior approved sections.
${revision ? `- This is a user-requested revision. Apply the revision instruction precisely to the current draft, preserve useful content that was not asked to change. Keep Marqq-will voice.` : ""}`,
      JSON.stringify(
        {
          strategySectionId,
          interviewSectionId,
          companyName: ctx.companyName,
          clientNote: `${ctx.companyName} is the client. Marqq is the operating system writing and executing this section.`,
          voiceExample: `Marqq will prioritize customer success by allocating resources to support growth of qualified leads for ${ctx.companyName}…`,
          website: ctx.website,
          niche: ctx.niche,
          icp: ctx.icp,
          needsGoalSystem,
          proposedGoalSystem: goalSystem,
          northStar: {
            quantified_target: a(answers, "quantified_target") || ctx.target,
            timeline_target: a(answers, "timeline_target") || ctx.timeWindow,
            priority_90d: a(answers, "priority_90d") || ctx.outcome,
            channel_bet: a(answers, "channel_bet"),
            budget_band: a(answers, "budget_band"),
            baseline: a(answers, "success_baseline") || ctx.baseline,
          },
          answers,
          revisionPrompt: revision || null,
          currentDraft: revision ? currentDraft : null,
          priorApprovedSections: priorSections.map((s) => ({
            id: s.id,
            title: s.title,
            summary: s.summary,
            // summaries only — omit bullets/body so the model does not copy prior lanes
          })),
          skillIds: skillPack.skillIds,
          skillPlaybookLoaded: skillPack.loaded,
          forbiddenIfOps:
            strategySectionId === "operations_execution"
              ? ["Activation", "Expansion", "Retention loop", "health score", "time-to-value onboarding"]
              : undefined,
        },
        null,
        2
      ).slice(0, 16000)
    );

    let draft = normalizeDraft(
      parsed,
      currentDraft && revision ? { ...fallback, ...currentDraft } : fallback,
      ctx.companyName
    );

    // If ops accidentally clones CS, replace with ops fallback
    if (
      strategySectionId === "operations_execution" &&
      sectionLooksLikeCustomerSuccess(draft) &&
      !revision
    ) {
      console.warn("[gtm-section] operations looked like customer_success — using ops fallback");
      draft = fallback;
    }

    return draft;
  } catch (err) {
    console.warn("[gtm-section] generation failed, using fallback:", err);
    if (revision && currentDraft) {
      return {
        ...currentDraft,
        summary: `${currentDraft.summary} (Revision noted: ${revision})`,
        body: `${currentDraft.body}\n\nRevision request: ${revision}`,
      };
    }
    return fallback;
  }
}
