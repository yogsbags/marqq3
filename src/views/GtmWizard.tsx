import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import {
  GTM_FULL_STRATEGY_SECTION_ORDER,
  GTM_INTERVIEW_SECTIONS,
  GTM_WIZARD_INTERVIEW_SECTION_IDS,
  ONBOARDING_SEEDED_ANSWER_IDS,
  answerLabel,
  applyOnboardingAnswers,
  getInterviewSection,
  sectionAnswersComplete,
  firstUnansweredIndex,
  firstIncompleteInterviewSection,
  type GtmAnswers,
  type GtmInterviewQuestion,
  type GtmInterviewSectionId,
  type GtmOption,
  type GtmSectionAnswer,
} from "../lib/gtmInterview";
import {
  type GtmStrategySectionDraft,
} from "../lib/gtmStrategySection";
import {
  alignSectionsToLeadingMetrics,
  assembleGoalAlignment,
  countPlaceholderSectionTargets,
  goalAlignmentToMarkdown,
  goalSystemToQuantifiedLabel,
  isPlaceholderSectionTarget,
  isWeakGoalSystem,
  NORTH_STAR_PRINCIPLES,
  sectionTargetsFromDrafts,
  type GtmGoalSystemNorm,
} from "../lib/gtmNorthStar";
import {
  loadGtmAutoSections,
  saveGtmAutoSections,
  GTM_AUTO_STRATEGY_SECTIONS,
  type GtmAutoSectionDraft,
} from "../lib/gtmAutoSections";
import {
  buildAgentOs,
  clearAgentOs,
  saveAgentOs,
} from "../lib/agents";
import { WORKSPACE_ID, loadLocalBrandContext } from "../lib/brandContext";
import { formatStrategySectionForChat, stashAskMarqqContext } from "../lib/askMarqqContext";

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY || "";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Bump: LLM options fix + full strategy section headers. */
const GTM_WIZARD_SESSION_VERSION = "wizard-llm-options-headers-v1";
const GTM_WIZARD_SESSION_KEY = "marqq_gtm_wizard";
const GTM_WIZARD_VERSION_KEY = "marqq_gtm_wizard_version";

function clearStaleWizardSession(): void {
  try {
    if (sessionStorage.getItem(GTM_WIZARD_VERSION_KEY) === GTM_WIZARD_SESSION_VERSION) return;
    sessionStorage.removeItem(GTM_WIZARD_SESSION_KEY);
    sessionStorage.removeItem("marqq_gtm_strategy");
    sessionStorage.removeItem("marqq_agent_os");
    sessionStorage.setItem(GTM_WIZARD_VERSION_KEY, GTM_WIZARD_SESSION_VERSION);
  } catch {
    /* ignore */
  }
}

type WizardStage =
  | "briefs"
  | GtmInterviewSectionId
  | `${GtmInterviewSectionId}-drafts`
  | "generating"
  | "document";

interface OnboardingCtx {
  companyName: string;
  website: string;
  niche: string;
  icp: string;
  outcome: string;
  timeWindow: string;
  target: string;
  baseline: string;
  brandTagline: string;
  businessSummary: string;
  marketBullets: string[];
  toneOfVoice: string;
  colors?: string[];
  fonts?: string;
}

interface StrategySection {
  id: string;
  title: string;
  channel?: string;
  summary?: string;
  body?: string;
  bullets?: string[];
  subsections?: Array<{ title: string; body: string; bullets?: string[] }>;
}

interface StrategyDoc {
  title: string;
  executiveSummary: string;
  nextSteps: string[];
  generatedAt?: string;
  goalAlignment: GtmGoalSystemNorm;
  sections: StrategySection[];
}

interface WizardState {
  stage: WizardStage;
  answers: GtmAnswers;
  questionIndex: number;
  /** Market→timeline briefs reviewed inside the wizard (not onboarding). */
  briefsComplete: boolean;
  /** Approved AI strategy sections keyed by interview stage */
  drafts: Partial<Record<GtmInterviewSectionId, GtmStrategySectionDraft[]>>;
  /** In-progress review queue (Marqq2 Brand DNA-style) */
  review: {
    interviewSectionId: GtmInterviewSectionId;
    queue: Array<{ id: string; title: string; blurb: string }>;
    index: number;
    draft: GtmStrategySectionDraft | null;
    loading: boolean;
    error: string | null;
  } | null;
  strategy: StrategyDoc | null;
}

interface GtmWizardProps {
  setActiveScreen: (screen: string) => void;
}

function getCtx(): OnboardingCtx {
  const brand = loadLocalBrandContext() as Record<string, unknown> | null;
  const auto = loadGtmAutoSections(WORKSPACE_ID);
  const market = auto.find((s) => s.id === "market_analysis");
  return {
    companyName: localStorage.getItem("marqq_ob_companyName") || String(brand?.companyName || "Elevate"),
    website: localStorage.getItem("marqq_ob_website") || String(brand?.website || "theelevate.co.in"),
    niche:
      localStorage.getItem("marqq_ob_niche") ||
      String(brand?.niche || "Management strategy, AI solutions & digital transformation consulting"),
    icp:
      localStorage.getItem("marqq_ob_icp") ||
      String(brand?.icp || "Growth-stage companies and mid-market leaders seeking strategy-to-execution partners"),
    outcome:
      localStorage.getItem("marqq_ob_outcome") ||
      String(brand?.outcome || "Grow qualified leads from strategy and AI transformation buyers"),
    timeWindow: localStorage.getItem("marqq_ob_timeWindow") || String(brand?.timeWindow || "90 days"),
    target: localStorage.getItem("marqq_ob_target") || String(brand?.target || "5 qualified leads per month"),
    baseline: localStorage.getItem("marqq_ob_baseline") || String(brand?.baseline || "1 qualified lead per month"),
    brandTagline:
      localStorage.getItem("marqq_ob_tagline") ||
      String(brand?.brandTagline || brand?.tagline || "Strategy Meets Execution"),
    businessSummary: String(
      brand?.businessSummary || brand?.brandSummary || brand?.summary || ""
    ),
    toneOfVoice:
      localStorage.getItem("marqq_ob_tone") ||
      String(brand?.toneOfVoice || brand?.tone || "Clear, senior, execution-focused"),
    colors: Array.isArray(brand?.colors) ? (brand!.colors as string[]) : undefined,
    fonts: brand?.fonts ? String(brand.fonts) : undefined,
    marketBullets: Array.isArray(market?.bullets) ? market!.bullets.map(String) : [],
  };
}


/** All Goals → Audience interview questions answered (no mid-flow draft reviews). */
function interviewComplete(answers: GtmAnswers): boolean {
  return firstIncompleteInterviewSection(answers) == null;
}

function clearSectionAnswers(answers: GtmAnswers, sectionId: GtmInterviewSectionId): GtmAnswers {
  const section = getInterviewSection(sectionId);
  if (!section) return answers;
  const next = { ...answers };
  for (const q of section.questions) {
    delete next[q.id];
  }
  return next;
}

/** Clear this section and every interview section after it (for redo-from-here). */
function clearFromSection(answers: GtmAnswers, sectionId: GtmInterviewSectionId): GtmAnswers {
  const order = GTM_WIZARD_INTERVIEW_SECTION_IDS;
  const start = order.indexOf(sectionId);
  if (start < 0) return clearSectionAnswers(answers, sectionId);
  let next = { ...answers };
  for (let i = start; i < order.length; i++) {
    next = clearSectionAnswers(next, order[i]);
  }
  return next;
}

function clearDraftsFromSection(
  drafts: WizardState["drafts"],
  sectionId: GtmInterviewSectionId
): WizardState["drafts"] {
  const order = GTM_WIZARD_INTERVIEW_SECTION_IDS;
  const start = order.indexOf(sectionId);
  if (start < 0) {
    const next = { ...drafts };
    delete next[sectionId];
    return next;
  }
  const next = { ...drafts };
  for (let i = start; i < order.length; i++) {
    delete next[order[i]];
  }
  return next;
}

function defaultState(ctx: OnboardingCtx): WizardState {
  // Only lock onboarding-owned fields; wizard questions are answered section-by-section.
  const answers = applyOnboardingAnswers({}, ctx);
  const incomplete = firstIncompleteInterviewSection(answers);
  const stage: WizardStage = incomplete || "goals";
  return {
    stage,
    answers,
    questionIndex: incomplete ? startIndexForSection(incomplete, answers) : 0,
    briefsComplete: true, // mid-wizard briefs retired — strategy sections generate with the doc
    drafts: {},
    review: null,
    strategy: null,
  };
}

function startIndexForSection(sectionId: GtmInterviewSectionId, answers: GtmAnswers): number {
  const section = getInterviewSection(sectionId);
  if (!section) return 0;
  const maxIdx = Math.max(section.questions.length - 1, 0);
  const firstOpen = firstUnansweredIndex(section.questions, answers);
  if (firstOpen > maxIdx) return maxIdx;
  return Math.max(firstOpen, 0);
}

function isInterviewStage(stage: WizardStage): stage is GtmInterviewSectionId {
  return (GTM_WIZARD_INTERVIEW_SECTION_IDS as readonly string[]).includes(stage);
}

function interviewIdFromDraft(stage: WizardStage): GtmInterviewSectionId | null {
  if (!stage.endsWith("-drafts")) return null;
  const id = stage.replace(/-drafts$/, "") as GtmInterviewSectionId;
  return (GTM_WIZARD_INTERVIEW_SECTION_IDS as readonly string[]).includes(id) ? id : null;
}

function normalizeWizardState(parsed: Partial<WizardState> | null | undefined, ctx: OnboardingCtx): WizardState {
  const base = defaultState(ctx);
  if (!parsed || typeof parsed !== "object") return base;

  // Prefer the live session answers as-is so clears/resets stick.
  // Only fall back to onboarding seeds when the session has no answers object yet.
  let answers: GtmAnswers;
  if (parsed.answers && typeof parsed.answers === "object") {
    answers = {};
    for (const [key, val] of Object.entries(parsed.answers)) {
      if (!val || typeof val !== "object") continue;
      const next: GtmSectionAnswer = {
        value: String((val as GtmSectionAnswer).value || ""),
        label: String((val as GtmSectionAnswer).label || ""),
        values: Array.isArray((val as GtmSectionAnswer).values)
          ? (val as GtmSectionAnswer).values!.map(String)
          : undefined,
      };
      const filled =
        (Array.isArray(next.values) && next.values.length > 0) ||
        Boolean(next.value.trim() || next.label.trim());
      if (!filled) continue;
      answers[key] = next;
    }
  } else {
    answers = { ...base.answers };
  }

  const drafts: WizardState["drafts"] = {};
  if (parsed.drafts && typeof parsed.drafts === "object") {
    for (const id of GTM_WIZARD_INTERVIEW_SECTION_IDS) {
      const list = parsed.drafts[id];
      if (Array.isArray(list) && list.length && list[0] && "summary" in (list[0] as object)) {
        drafts[id] = list.map((d) => ({
          id: String(d?.id || ""),
          title: String(d?.title || ""),
          summary: String(d?.summary || ""),
          bullets: Array.isArray(d?.bullets) ? d.bullets.map(String) : [],
          body: String(d?.body || ""),
          subsections: Array.isArray(d?.subsections) ? d.subsections : [],
          sectionTarget: d?.sectionTarget,
          proposedNorthStar: d?.proposedNorthStar ? String(d.proposedNorthStar) : undefined,
          proposedGoalSystem: d?.proposedGoalSystem || null,
          approvedAt: d?.approvedAt ? String(d.approvedAt) : undefined,
        })) as GtmStrategySectionDraft[];
      }
    }
  }

  let review: WizardState["review"] = null;
  if (parsed.review && typeof parsed.review === "object" && parsed.review.interviewSectionId) {
    review = {
      interviewSectionId: parsed.review.interviewSectionId as GtmInterviewSectionId,
      queue: Array.isArray(parsed.review.queue) ? parsed.review.queue : [],
      index: Number(parsed.review.index) || 0,
      draft: parsed.review.draft && typeof parsed.review.draft === "object" ? (parsed.review.draft as GtmStrategySectionDraft) : null,
      loading: Boolean(parsed.review.loading),
      error: parsed.review.error ? String(parsed.review.error) : null,
    };
  }

  let stage = (parsed.stage as WizardStage) || "goals";
  const draftId = interviewIdFromDraft(stage);
  // Mid-flow draft / briefs stages retired → bounce back to interview questions
  if (draftId) {
    stage = draftId;
    review = null;
  }
  if (stage === "briefs") {
    stage = firstIncompleteInterviewSection(answers) || "audience";
  }
  if (stage === "document" && !(parsed.strategy && typeof parsed.strategy === "object")) {
    stage = firstIncompleteInterviewSection(answers) || "goals";
  }
  if (isInterviewStage(stage)) {
    // ok
  } else if (stage === "generating" || stage === "document") {
    // ok
  } else {
    stage = "goals";
  }

  const briefsComplete = true;

  const section = isInterviewStage(stage) ? getInterviewSection(stage) : null;
  const maxIdx = section ? Math.max(section.questions.length - 1, 0) : 0;
  let questionIndex = Math.min(Math.max(Number(parsed.questionIndex) || 0, 0), maxIdx);

  // Always land on the first unanswered interview question (skip onboarding-prefilled)
  if (section) {
    const firstOpen = firstUnansweredIndex(section.questions, answers);
    if (firstOpen <= maxIdx) {
      const currentId = section.questions[questionIndex]?.id;
      const currentFilled =
        currentId &&
        answers[currentId] &&
        ((Array.isArray(answers[currentId].values) && answers[currentId].values!.length > 0) ||
          Boolean(String(answers[currentId].value || "").trim() || String(answers[currentId].label || "").trim()));
      if (questionIndex === 0 || currentFilled || firstOpen > questionIndex) {
        questionIndex = firstOpen;
      }
    }
  }

  return {
    stage,
    answers,
    questionIndex,
    briefsComplete,
    drafts,
    review,
    strategy: parsed.strategy && typeof parsed.strategy === "object" ? (parsed.strategy as StrategyDoc) : null,
  };
}

function loadWizardState(ctx: OnboardingCtx): WizardState {
  clearStaleWizardSession();
  try {
    const raw = sessionStorage.getItem(GTM_WIZARD_SESSION_KEY);
    if (raw) return normalizeWizardState(JSON.parse(raw) as Partial<WizardState>, ctx);
  } catch {
    /* ignore */
  }
  try {
    const s = sessionStorage.getItem("marqq_gtm_strategy");
    if (s) {
      const strategy = JSON.parse(s) as StrategyDoc;
      return normalizeWizardState({ ...defaultState(ctx), stage: "document", strategy }, ctx);
    }
  } catch {
    /* ignore */
  }
  return defaultState(ctx);
}

async function groqJson(prompt: string): Promise<Record<string, unknown>> {
  if (!GROQ_KEY) throw new Error("Missing VITE_GROQ_API_KEY");
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are a GTM strategy generator. Return valid JSON only, no markdown, no code fences.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.38,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return JSON.parse(data.choices?.[0]?.message?.content || "{}") as Record<string, unknown>;
}

function answersPromptBlock(answers: GtmAnswers): string {
  return Object.entries(answers)
    .map(([id, a]) => `- ${id}: ${answerLabel(a)}`)
    .join("\n");
}

function toStrategySection(
  id: string,
  title: string,
  src:
    | {
        summary?: string;
        body?: string;
        bullets?: string[];
        subsections?: Array<{ title: string; body: string; bullets?: string[] }>;
      }
    | null
    | undefined
): StrategySection {
  return {
    id,
    title,
    channel: id.replace(/_/g, "-"),
    summary: String(src?.summary || "").trim(),
    body: String(src?.body || "").trim(),
    bullets: Array.isArray(src?.bullets) ? src!.bullets!.map(String).filter(Boolean) : [],
    subsections: Array.isArray(src?.subsections)
      ? src!.subsections!.map((sub) => ({
          title: String(sub.title || "").trim(),
          body: String(sub.body || "").trim(),
          bullets: Array.isArray(sub.bullets) ? sub.bullets.map(String).filter(Boolean) : [],
        }))
      : undefined,
  };
}

/** Prefer wizard auto-briefs + interview-approved drafts; only invent thin stubs for gaps. */
function assembleStrategyFromBriefs(
  ctx: OnboardingCtx,
  answers: GtmAnswers,
  approvedDrafts: GtmStrategySectionDraft[],
  autoSections: GtmAutoSectionDraft[]
): StrategyDoc {
  const quantifiedAnswer = answerLabel(answers.quantified_target) || ctx.target;
  const outcome = answerLabel(answers.priority_90d) || ctx.outcome;
  const timeline = answerLabel(answers.timeline_target) || ctx.timeWindow;
  const icp = answerLabel(answers.icp) || ctx.icp;
  const byId = new Map<string, StrategySection>();

  for (const s of autoSections) {
    byId.set(s.id, toStrategySection(s.id, s.title || s.id, s));
  }
  for (const d of approvedDrafts) {
    byId.set(d.id, toStrategySection(d.id, d.title || d.id, d));
  }

  let sections = GTM_FULL_STRATEGY_SECTION_ORDER.map((s) => {
    const existing = byId.get(s.id);
    if (existing && (existing.summary || existing.body || (existing.bullets || []).length)) {
      return existing;
    }
    return {
      id: s.id,
      title: s.title,
      channel: s.id.replace(/_/g, "-"),
      summary: `${s.title} for ${ctx.companyName}, aligned to ${quantifiedAnswer || outcome}.`,
      body: `Marqq will execute ${s.title.toLowerCase()} for ${ctx.companyName} against ${icp}, toward ${quantifiedAnswer || outcome} within ${timeline}.`,
      bullets: [`Outcome: ${outcome}`, `Audience: ${icp}`, `Window: ${timeline}`],
    };
  });

  const goalsDraft = approvedDrafts.find((d) => d.proposedGoalSystem || d.proposedNorthStar);
  const goalAlignment = assembleGoalAlignment({
    proposed: goalsDraft?.proposedGoalSystem || null,
    sectionIds: GTM_FULL_STRATEGY_SECTION_ORDER.map((s) => s.id),
    draftTargets: sectionTargetsFromDrafts(approvedDrafts),
    answers: {
      priority_90d: outcome,
      quantified_target: quantifiedAnswer,
      timeline_target: timeline,
      channel_bet: answerLabel(answers.channel_bet),
      success_baseline: answerLabel(answers.success_baseline) || ctx.baseline,
    },
    ctx: {
      outcome,
      target: quantifiedAnswer,
      timeline,
      baseline: ctx.baseline,
      channel: answerLabel(answers.channel_bet),
      companyName: ctx.companyName,
      niche: ctx.niche,
    },
  });

  sections = alignSectionsToLeadingMetrics(sections, goalAlignment.sectionTargets);

  const market = byId.get("market_analysis");
  const execFromMarket = market?.summary || "";
  const northLabel = goalAlignment.north_star_metric || outcome;
  const quantifiedLabel =
    goalSystemToQuantifiedLabel(goalAlignment) || quantifiedAnswer || northLabel;

  return {
    title: `${ctx.companyName} GTM Strategy`,
    generatedAt: new Date().toISOString(),
    executiveSummary:
      execFromMarket ||
      `Marqq will help ${ctx.companyName} pursue ${icp}, targeting ${quantifiedLabel} (${northLabel}) over ${timeline}, using wizard-approved GTM briefs as the operating plan.`,
    nextSteps: [
      "Run the first-focus plays from Market analysis and Distribution this week",
      "Keep Measurement scorecard weekly with kill rules from Risks",
      "Open agent workstreams only for sections already approved in onboarding",
    ],
    goalAlignment,
    sections,
  };
}

/**
 * Marqq2-style enrichment: fill full goalAlignment (definition, tree, 16 sectionTargets)
 * when drafts left placeholders.
 */
async function enrichGoalAlignment(
  ctx: OnboardingCtx,
  answers: GtmAnswers,
  doc: StrategyDoc
): Promise<StrategyDoc> {
  if (!GROQ_KEY) return doc;
  const placeholders = countPlaceholderSectionTargets(doc.goalAlignment.sectionTargets || []);
  const weakCore =
    isWeakGoalSystem(doc.goalAlignment) ||
    !doc.goalAlignment.metric_definition ||
    !(doc.goalAlignment.metric_tree || []).length ||
    !(doc.goalAlignment.guardrails || []).length ||
    placeholders >= 8;
  if (!weakCore && placeholders === 0) return doc;

  try {
    const sectionCatalog = GTM_FULL_STRATEGY_SECTION_ORDER.map((s) => {
      const section = doc.sections.find((x) => x.id === s.id);
      return {
        id: s.id,
        title: s.title,
        summary: String(section?.summary || "").slice(0, 220),
      };
    });
    const raw = await groqJson(
      `You are locking the North Star goal system for a GTM strategy document Marqq agents will execute.

${NORTH_STAR_PRINCIPLES}

Company: ${ctx.companyName}
Industry: ${ctx.niche}
ICP: ${answerLabel(answers.icp) || ctx.icp}
Locked answers:
${answersPromptBlock(answers)}

Existing goalAlignment (refine, do not invent a conflicting target if quantified_target is already concrete):
${JSON.stringify(doc.goalAlignment, null, 2).slice(0, 6000)}

Section catalog (write one leading-indicator sectionTarget per id — never a fractional share of the North Star):
${JSON.stringify(sectionCatalog, null, 2)}

Return STRICT JSON only:
{
  "goalAlignment": {
    "business_archetype": "b2b_services|consumer_product|marketplace|platform_os|custom_delivery|hybrid|other",
    "north_star_metric": "operational metric name",
    "metric_definition": "exact qualifying definition of one unit",
    "ultimate_outcome_metric": "longer-horizon outcome or null",
    "quantified_target": "number + unit + by-when",
    "timeline_target": "echo timeline",
    "priority_90d": "primary outcome",
    "channel_bet": "primary channel bet",
    "baseline": null,
    "measurement_period": "weekly|monthly|90 days",
    "metric_tree": ["north star", "driver", "..."],
    "guardrails": ["..."],
    "primary_loop": ["step1", "step2", "..."],
    "rejects_as_nsm": ["vanity metrics to avoid"],
    "sectionTargets": [
      {
        "sectionId": "executive_summary",
        "metric": "...",
        "contribution": "...",
        "owner": "role",
        "targetType": "leading_indicator|alignment",
        "byWhen": "Day N or checkpoint"
      }
    ]
  }
}
Require exactly ${GTM_FULL_STRATEGY_SECTION_ORDER.length} sectionTargets covering every sectionId.`
    );

    const enriched = assembleGoalAlignment({
      proposed: raw.goalAlignment || raw,
      sectionIds: GTM_FULL_STRATEGY_SECTION_ORDER.map((s) => s.id),
      draftTargets: doc.goalAlignment.sectionTargets,
      llmTargets:
        (raw.goalAlignment as { sectionTargets?: unknown } | undefined)?.sectionTargets ||
        (raw as { sectionTargets?: unknown }).sectionTargets,
      answers: {
        priority_90d: answerLabel(answers.priority_90d) || ctx.outcome,
        quantified_target: answerLabel(answers.quantified_target) || ctx.target,
        timeline_target: answerLabel(answers.timeline_target) || ctx.timeWindow,
        channel_bet: answerLabel(answers.channel_bet),
        success_baseline: answerLabel(answers.success_baseline) || ctx.baseline,
      },
      ctx: {
        outcome: answerLabel(answers.priority_90d) || ctx.outcome,
        target: answerLabel(answers.quantified_target) || ctx.target,
        timeline: answerLabel(answers.timeline_target) || ctx.timeWindow,
        baseline: ctx.baseline,
        channel: answerLabel(answers.channel_bet),
        companyName: ctx.companyName,
        niche: ctx.niche,
      },
    });

    // Prefer concrete locked quantified target from interview when strong
    const lockedQuant = answerLabel(answers.quantified_target) || ctx.target;
    if (lockedQuant && lockedQuant.length > 8 && !/ai_recommend|let marqq|tbd|unset/i.test(lockedQuant)) {
      enriched.quantified_target = lockedQuant;
    }

    return {
      ...doc,
      goalAlignment: enriched,
      sections: alignSectionsToLeadingMetrics(doc.sections, enriched.sectionTargets),
    };
  } catch (err) {
    console.warn("[gtm] goalAlignment enrich failed:", err);
    return doc;
  }
}

async function polishExecutiveSummary(
  ctx: OnboardingCtx,
  answers: GtmAnswers,
  doc: StrategyDoc
): Promise<StrategyDoc> {
  let next = doc;
  if (GROQ_KEY) {
    try {
      const raw = await groqJson(
        `Write a tight GTM executive summary (3-4 sentences) and 3 next steps for ${ctx.companyName}.
Voice: use "Marqq will…" as the acting subject — never "${ctx.companyName} should…".
North Star: ${doc.goalAlignment.north_star_metric || ""} → ${doc.goalAlignment.quantified_target || ""}
Locked answers:
${answersPromptBlock(answers)}
Existing section titles: ${(doc.sections || []).map((s) => s.title).join(", ")}
Return JSON only: {"executiveSummary":"...","nextSteps":["...","...","..."]}`
      );
      const summary = String(raw.executiveSummary || "").trim();
      const steps = Array.isArray(raw.nextSteps)
        ? raw.nextSteps.map(String).filter(Boolean).slice(0, 5)
        : [];
      next = {
        ...next,
        executiveSummary: summary || next.executiveSummary,
        nextSteps: steps.length ? steps : next.nextSteps,
      };
    } catch {
      /* keep assembled */
    }
  }
  return enrichGoalAlignment(ctx, answers, next);
}

async function generateGtmStrategy(
  ctx: OnboardingCtx,
  answers: GtmAnswers,
  approvedDrafts: GtmStrategySectionDraft[] = []
): Promise<StrategyDoc> {
  const auto = loadGtmAutoSections(WORKSPACE_ID);
  const assembled = assembleStrategyFromBriefs(ctx, answers, approvedDrafts, auto);
  const covered = assembled.sections.filter(
    (s) => auto.some((a) => a.id === s.id) || approvedDrafts.some((d) => d.id === s.id)
  ).length;

  // When wizard briefs exist, polish summary + deepen goalAlignment — don't regenerate all 16 sections.
  if (auto.length >= 5 || covered >= 8) {
    return polishExecutiveSummary(ctx, answers, assembled);
  }

  const sectionSchema = GTM_FULL_STRATEGY_SECTION_ORDER.map(
    (s) =>
      `{"id":"${s.id}","title":"${s.title}","channel":"${s.id.replace(/_/g, "-")}","summary":"...","body":"...","bullets":["...","...","..."]}`
  ).join(",");

  const prompt = `You are a senior B2B GTM strategist. Generate a complete 16-section GTM Strategy Document.
${NORTH_STAR_PRINCIPLES}
Company:
- Company: ${ctx.companyName}
- Website: ${ctx.website || "not provided"}
- Industry: ${ctx.niche}
Locked interview answers:
${answersPromptBlock(answers)}
Return EXACTLY this JSON (no extra keys). Be specific — real numbers, named tactics, no filler.
Voice: "Marqq will…" as acting subject.
{"title":"...","executiveSummary":"3-4 sentences","nextSteps":["s1","s2","s3"],"goalAlignment":{"business_archetype":"...","north_star_metric":"...","metric_definition":"...","ultimate_outcome_metric":null,"quantified_target":"...","timeline_target":"...","priority_90d":"...","channel_bet":"...","metric_tree":["..."],"guardrails":["..."],"primary_loop":["..."],"rejects_as_nsm":["..."],"sectionTargets":[{"sectionId":"market_analysis","metric":"...","contribution":"...","owner":"...","targetType":"leading_indicator","byWhen":"..."}]},"sections":[${sectionSchema}]}`;

  const raw = await groqJson(prompt);
  const base = assembleStrategyFromBriefs(
    ctx,
    answers,
    approvedDrafts,
    auto.length
      ? auto
      : ((raw.sections as StrategySection[]) || []).map((s) => ({
          id: s.id,
          title: s.title,
          summary: s.summary || "",
          body: s.body || "",
          bullets: s.bullets || [],
        }))
  );
  const withLlmGoals = assembleGoalAlignment({
    proposed: raw.goalAlignment || base.goalAlignment,
    sectionIds: GTM_FULL_STRATEGY_SECTION_ORDER.map((s) => s.id),
    draftTargets: sectionTargetsFromDrafts(approvedDrafts),
    llmTargets: (raw.goalAlignment as { sectionTargets?: unknown } | undefined)?.sectionTargets,
    answers: {
      priority_90d: answerLabel(answers.priority_90d) || ctx.outcome,
      quantified_target: answerLabel(answers.quantified_target) || ctx.target,
      timeline_target: answerLabel(answers.timeline_target) || ctx.timeWindow,
      channel_bet: answerLabel(answers.channel_bet),
      success_baseline: answerLabel(answers.success_baseline) || ctx.baseline,
    },
    ctx: {
      outcome: answerLabel(answers.priority_90d) || ctx.outcome,
      target: answerLabel(answers.quantified_target) || ctx.target,
      timeline: answerLabel(answers.timeline_target) || ctx.timeWindow,
      baseline: ctx.baseline,
      channel: answerLabel(answers.channel_bet),
      companyName: ctx.companyName,
      niche: ctx.niche,
    },
  });
  return enrichGoalAlignment(ctx, answers, {
    ...base,
    title: String(raw.title || base.title),
    executiveSummary: String(raw.executiveSummary || base.executiveSummary),
    nextSteps: Array.isArray(raw.nextSteps)
      ? (raw.nextSteps as unknown[]).map(String).filter(Boolean).slice(0, 8)
      : base.nextSteps,
    goalAlignment: withLlmGoals,
    sections: alignSectionsToLeadingMetrics(base.sections, withLlmGoals.sectionTargets),
  });
}

function fallbackStrategy(
  ctx: OnboardingCtx,
  answers: GtmAnswers,
  approvedDrafts: GtmStrategySectionDraft[] = []
): StrategyDoc {
  return assembleStrategyFromBriefs(
    ctx,
    answers,
    approvedDrafts,
    loadGtmAutoSections(WORKSPACE_ID)
  );
}

function downloadBlob(name: string, content: string, mime: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
}

function strategyToHtml(doc: StrategyDoc): string {
  const esc = (s: string) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const ga = doc.goalAlignment || ({} as GtmGoalSystemNorm);
  const nsmBits = [
    ga.business_archetype ? `<p><strong>Archetype:</strong> ${esc(ga.business_archetype)}</p>` : "",
    ga.north_star_metric ? `<p><strong>North Star Metric:</strong> ${esc(ga.north_star_metric)}</p>` : "",
    ga.metric_definition ? `<p><strong>Definition:</strong> ${esc(ga.metric_definition)}</p>` : "",
    ga.ultimate_outcome_metric
      ? `<p><strong>Ultimate outcome:</strong> ${esc(ga.ultimate_outcome_metric)}</p>`
      : "",
    ga.quantified_target ? `<p><strong>Target:</strong> ${esc(ga.quantified_target)}</p>` : "",
    ga.timeline_target ? `<p><strong>Timeline:</strong> ${esc(ga.timeline_target)}</p>` : "",
    ga.priority_90d ? `<p><strong>Primary outcome:</strong> ${esc(ga.priority_90d)}</p>` : "",
    ga.channel_bet ? `<p><strong>Channel bet:</strong> ${esc(ga.channel_bet)}</p>` : "",
    (ga.metric_tree || []).length
      ? `<h3>Metric tree</h3><ul>${ga.metric_tree!.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>`
      : "",
    (ga.primary_loop || []).length
      ? `<h3>Primary loop</h3><p>${esc(ga.primary_loop!.join(" → "))}</p>`
      : "",
    (ga.guardrails || []).length
      ? `<h3>Guardrails</h3><ul>${ga.guardrails!.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>`
      : "",
    (ga.rejects_as_nsm || []).length
      ? `<h3>Do not optimize as NSM</h3><ul>${ga.rejects_as_nsm!.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`
      : "",
    (ga.sectionTargets || []).length
      ? `<h3>Section contributing metrics</h3><ul>${ga
          .sectionTargets!.map(
            (t) =>
              `<li><strong>${esc(t.sectionId)}</strong>: ${esc(t.metric || "")} — ${esc(t.contribution || "")}${
                t.byWhen ? ` (by ${esc(t.byWhen)})` : ""
              }</li>`
          )
          .join("")}</ul>`
      : "",
  ]
    .filter(Boolean)
    .join("");
  const nsmBlock = nsmBits
    ? `<section style="margin:32px 0"><h2>North-star goal system</h2>${nsmBits}</section>`
    : "";
  const sH = (doc.sections || [])
    .map((s) => {
      const sum = s.summary ? `<p style="color:#555">${esc(s.summary)}</p>` : "";
      const body = s.body ? `<p style="white-space:pre-wrap;line-height:1.7">${esc(s.body)}</p>` : "";
      const bullets = (s.bullets || []).length
        ? `<ul>${s.bullets!.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
        : "";
      const subs = (s.subsections || [])
        .map(
          (sub) =>
            `<h3>${esc(sub.title)}</h3>${sub.body ? `<p>${esc(sub.body)}</p>` : ""}${
              (sub.bullets || []).length
                ? `<ul>${sub.bullets!.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
                : ""
            }`
        )
        .join("");
      return `<section style="margin:32px 0"><h2>${esc(s.title)}</h2>${sum}${body}${bullets}${subs}</section>`;
    })
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(doc.title)}</title><style>body{font-family:Archivo,system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 24px;color:#111;line-height:1.6}h1{font-size:28px}h2{font-size:20px;margin-top:28px}h3{font-size:15px;margin-top:16px}ul{padding-left:20px}</style></head><body><h1>${esc(doc.title)}</h1><p style="color:#666;font-size:12px">Generated by Marqq${doc.generatedAt ? ` · ${esc(doc.generatedAt)}` : ""}</p>${nsmBlock}<h2>Executive summary</h2><p>${esc(doc.executiveSummary)}</p>${sH}</body></html>`;
}

function strategyToMarkdown(doc: StrategyDoc): string {
  const nsm = goalAlignmentToMarkdown(doc.goalAlignment);
  const sections = (doc.sections || [])
    .map((s) => {
      const bits = [
        `## ${s.title}`,
        "",
        s.summary || "",
        s.body || "",
        ...(s.bullets || []).map((b) => `- ${b}`),
        "",
        ...(s.subsections || []).flatMap((sub) => [
          `### ${sub.title}`,
          "",
          sub.body || "",
          ...(sub.bullets || []).map((b) => `- ${b}`),
          "",
        ]),
      ];
      return bits.filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n");
    })
    .join("\n");
  return [
    `# ${doc.title}`,
    "",
    doc.generatedAt ? `_Generated ${doc.generatedAt}_` : "",
    "",
    nsm,
    "## Executive summary",
    "",
    doc.executiveSummary || "",
    "",
    sections,
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");
}

function LockedAnswersCard({ answers }: { answers: GtmAnswers }) {
  const rows: Array<{
    id: string;
    section: string;
    label: string;
    value: string;
    fromOnboarding: boolean;
  }> = [];

  const shortLabel = (id: string, question: string) => {
    const map: Record<string, string> = {
      priority_90d: "Outcome",
      timeline_target: "Timeline",
      quantified_target: "North Star",
      channel_bet: "Lead channel",
      budget_band: "Budget",
      success_baseline: "Baseline",
      strategy_depth: "Strategy depth",
      module_type: "Module type",
      module_name: "Module name",
      one_sentence_desc: "Module description",
      category: "Market shelf",
      business_model: "Business model",
      pricing_strategy: "Pricing",
      validation_evidence: "Validation",
      icp: "ICP",
      persona: "Persona",
      jtbd: "Jobs to be done",
      buying_triggers: "Triggers",
      not_a_fit: "Not a fit",
    };
    if (map[id]) return map[id];
    return question.replace(/\?$/, "").slice(0, 42);
  };

  for (const section of GTM_INTERVIEW_SECTIONS) {
    for (const q of section.questions) {
      const value = answerLabel(answers[q.id]);
      if (!value) continue;
      rows.push({
        id: q.id,
        section: section.title,
        label: shortLabel(q.id, q.question),
        value,
        fromOnboarding: (ONBOARDING_SEEDED_ANSWER_IDS as readonly string[]).includes(q.id),
      });
    }
  }

  if (!rows.length) {
    return (
      <div className="card" style={{ fontSize: 13, lineHeight: 1.55, position: "sticky", top: 12 }}>
        <div className="card-kicker" style={{ marginBottom: 10 }}>
          Locked answers
        </div>
        <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
          Answers lock here as you complete each question. Onboarding fields stay locked.
        </p>
      </div>
    );
  }

  let lastSection = "";
  return (
    <div className="card" style={{ fontSize: 13, lineHeight: 1.55, position: "sticky", top: 12, maxHeight: "calc(100vh - 48px)", overflow: "auto" }}>
      <div className="card-kicker" style={{ marginBottom: 10 }}>
        Locked from onboarding
      </div>
      {rows.map((row) => {
        const showSection = row.section !== lastSection;
        lastSection = row.section;
        return (
          <div key={row.id} style={{ marginBottom: 10 }}>
            {showSection ? (
              <div
                className="text-muted"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                  marginTop: row.id === rows[0].id ? 0 : 8,
                }}
              >
                {row.section}
              </div>
            ) : null}
            <div className="text-muted" style={{ fontSize: 11, display: "flex", gap: 6, alignItems: "baseline" }}>
              <span>{row.label}</span>
              {row.fromOnboarding ? (
                <span style={{ fontSize: 10, opacity: 0.75 }}>· onboarding</span>
              ) : null}
            </div>
            <div>{row.value}</div>
          </div>
        );
      })}
    </div>
  );
}

function StageChips({
  stage,
  hasStrategy = false,
  interviewDone = false,
  activeStrategySectionId = null,
  onNavigate,
}: {
  stage: WizardStage;
  hasStrategy?: boolean;
  interviewDone?: boolean;
  activeStrategySectionId?: string | null;
  onNavigate?: (target: {
    kind: "interview" | "auto" | "end";
    interviewId?: GtmInterviewSectionId;
    strategySectionId?: string;
  }) => void;
}) {
  const interviewChips = [
    { id: "goals", label: "Goals", kind: "interview" as const },
    { id: "module", label: "Module", kind: "interview" as const },
    { id: "offer", label: "Offer", kind: "interview" as const },
    { id: "audience", label: "Audience", kind: "interview" as const },
  ];
  const autoChips = GTM_AUTO_STRATEGY_SECTIONS.map((s) => ({
    id: s.id,
    label: s.title,
    kind: "auto" as const,
  }));
  const endChips = [{ id: "strategy", label: "Strategy", kind: "end" as const }];
  const chips = [...interviewChips, ...autoChips, ...endChips];

  const draftId = interviewIdFromDraft(stage);
  const interviewId = isInterviewStage(stage) ? stage : draftId;

  let currentIdx = 0;
  if (interviewId) {
    const i = interviewChips.findIndex((c) => c.id === interviewId);
    currentIdx = i >= 0 ? i : 0;
  } else if ((stage === "document" || stage === "generating") && activeStrategySectionId) {
    const autoIdx = autoChips.findIndex((c) => c.id === activeStrategySectionId);
    currentIdx = autoIdx >= 0 ? interviewChips.length + autoIdx : chips.length - 1;
  } else if (stage === "generating" || stage === "document") {
    currentIdx = chips.length - 1;
  }

  let furthestIdx = currentIdx;
  if (interviewDone) furthestIdx = Math.max(furthestIdx, interviewChips.length - 1);
  if (hasStrategy || stage === "document" || stage === "generating") {
    furthestIdx = chips.length - 1;
  }

  const canClick = (i: number, kind: "interview" | "auto" | "end") => {
    if (!onNavigate) return false;
    if (kind === "auto") {
      // Open that strategy section in the doc, or generate strategy once interview is done
      return hasStrategy || interviewDone;
    }
    if (i === currentIdx) return false;
    if (i <= furthestIdx) {
      if (kind === "end" && !(hasStrategy || interviewDone || stage === "document")) return false;
      return true;
    }
    if (i === currentIdx + 1) {
      if (kind === "end" && !interviewDone && !hasStrategy) return false;
      return true;
    }
    return false;
  };

  const chipStyle = (isCurrent: boolean, isDone: boolean, clickable: boolean): React.CSSProperties => ({
    borderRadius: 0,
    border: "none",
    padding: "10px 10px",
    fontFamily: "var(--font-heading, Archivo, system-ui, sans-serif)",
    fontSize: 12,
    fontWeight: 650,
    letterSpacing: "0.01em",
    textAlign: "center",
    whiteSpace: "normal",
    lineHeight: 1.25,
    overflow: "visible",
    wordBreak: "break-word",
    hyphens: "auto",
    minHeight: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: isCurrent ? "var(--color-accent-100)" : isDone ? "#eceae6" : "#d8d5cf",
    color: isCurrent ? "var(--color-accent-800)" : "#1c1916",
    opacity: isCurrent || isDone || clickable ? 1 : 0.55,
    cursor: clickable ? "pointer" : isCurrent ? "default" : "not-allowed",
    transition: "background 0.15s ease, color 0.15s ease, opacity 0.15s ease",
  });

  return (
    <div style={{ marginBottom: 28, width: "100%", maxWidth: 1100 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(152px, 1fr))",
          gap: 8,
          alignItems: "stretch",
        }}
      >
        {chips.map((c, i) => {
          const isCurrent = i === currentIdx;
          const isDone = i < furthestIdx || (stage === "document" && i < chips.length - 1);
          const clickable = canClick(i, c.kind);
          return (
            <button
              key={c.id}
              type="button"
              disabled={!clickable && !isCurrent}
              onClick={() => {
                if (!clickable || !onNavigate) return;
                if (c.kind === "interview") {
                  onNavigate({ kind: "interview", interviewId: c.id as GtmInterviewSectionId });
                } else if (c.kind === "auto") {
                  onNavigate({ kind: "auto", strategySectionId: c.id });
                } else {
                  onNavigate({ kind: "end" });
                }
              }}
              style={chipStyle(isCurrent, isDone, clickable)}
              title={
                clickable
                  ? c.kind === "auto"
                    ? hasStrategy
                      ? `Open ${c.label}`
                      : `Generate strategy · open ${c.label}`
                    : `Go to ${c.label}`
                  : isCurrent
                    ? c.label
                    : c.kind === "auto"
                      ? `${c.label} (finish interview first)`
                      : `${c.label} (locked)`
              }
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GeneratingView() {
  const [width, setWidth] = useState(18);
  useEffect(() => {
    const t = setInterval(() => setWidth((w) => Math.min(w + 4, 92)), 180);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ maxWidth: 480, textAlign: "center", padding: "40px 0" }}>
      <div className="card-kicker" style={{ marginBottom: 10 }}>
        Assembling document
      </div>
      <p className="card-body" style={{ marginBottom: 16 }}>
        Generating GTM strategy document from your locked interview answers — all strategy
        sections assemble here with a quantified north-star.
      </p>
      <div
        style={{
          height: 8,
          background: "var(--color-surface)",
          position: "relative",
          border: "1px solid var(--color-divider)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            background: "var(--color-accent)",
            width: `${width}%`,
            transition: "width .2s ease",
          }}
        />
      </div>
    </div>
  );
}

function clientFallbackOptions(
  question: GtmInterviewQuestion,
  ctx: OnboardingCtx,
  answers: GtmAnswers
): GtmOption[] {
  const company = ctx.companyName || "Your company";
  const niche = ctx.niche || "your market";
  const icp = answerLabel(answers.icp) || ctx.icp || "your ideal customer";
  const outcome = answerLabel(answers.priority_90d) || ctx.outcome || "the core outcome";
  const timeline = answerLabel(answers.timeline_target) || ctx.timeWindow || "90 days";
  const banks: Record<string, GtmOption[]> = {
    priority_90d: [
      { value: "custom_outcome", label: outcome, recommended: true },
      { value: "pipeline", label: `Grow qualified demand from ${icp}` },
      { value: "revenue", label: "Increase revenue from the core offer" },
      { value: "ai_recommend", label: "Let Marqq recommend the right outcome" },
    ],
    quantified_target: [
      {
        value: "custom_target",
        label: ctx.target || `Measurable outcome for ${icp} within ${timeline}`,
        recommended: true,
      },
      { value: "ai_recommend", label: "Let Marqq recommend a realistic North Star" },
      { value: "value_loop", label: `Repeatable client progress within ${timeline}` },
      { value: "qualified_wins", label: `Qualified engagements with ${icp} by end of ${timeline}` },
    ],
    module_name: [
      { value: "company", label: company, recommended: true },
      { value: "core", label: `${company} — Core` },
      { value: "niche", label: `${company} — ${niche}` },
      { value: "growth", label: `${company} — Growth offer` },
    ],
    one_sentence_desc: [
      {
        value: "tagline",
        label: (ctx.brandTagline || ctx.businessSummary || `${company} helps ${icp}`).slice(0, 160),
        recommended: true,
      },
      { value: "helps", label: `${company} helps ${icp} achieve ${outcome}.` },
      { value: "execute", label: `${company} turns strategy into executable work for ${icp}.` },
      { value: "niche_desc", label: `AI-assisted ${niche} for ${icp}.` },
    ],
    category: [
      { value: "niche", label: niche, recommended: true },
      { value: "services", label: "Professional services" },
      { value: "b2b", label: "B2B SaaS" },
      { value: "advisory", label: "Strategy / transformation advisory" },
    ],
    icp: [
      { value: "onboarding", label: icp, recommended: true },
      { value: "mid", label: `Mid-market leaders in ${niche}` },
      { value: "growth", label: "Growth-stage / scaling leadership teams" },
      { value: "enterprise", label: "Enterprise transformation sponsors" },
    ],
    persona: [
      { value: "founder_ceo", label: "Founder / CEO", recommended: true },
      { value: "vp_strategy", label: "VP Strategy / Transformation" },
      { value: "coo", label: "COO / Head of Ops" },
      { value: "cmo", label: "CMO / Head of Growth" },
    ],
    jtbd: [
      { value: "execute", label: `Turn ${niche} strategy into an executable plan`, recommended: true },
      { value: "pipeline", label: `Build a predictable pipeline of ${icp}` },
      { value: "transform", label: "Accelerate transformation without stalled pilots" },
      { value: "scale", label: "Scale outcomes without adding headcount" },
    ],
    buying_triggers: [
      { value: "mandate", label: "New leadership / transformation mandate", recommended: true },
      { value: "budget", label: "Budget / planning cycle" },
      { value: "pain", label: "Missed targets / stalled roadmap" },
      { value: "competitor", label: "Competitor move / market shift" },
    ],
    not_a_fit: [
      { value: "too_small", label: "Too small / no budget", recommended: true },
      { value: "no_owner", label: "No clear owner / champion" },
      { value: "wrong_geo", label: "Outside priority geographies" },
      { value: "diy", label: "Wants DIY with no change management" },
    ],
  };
  return (
    banks[question.id] || [
      { value: "opt_1", label: `Best fit for ${company}`, recommended: true },
      { value: "opt_2", label: `Strong alternative for ${icp}` },
      { value: "opt_3", label: `Conservative option for ${timeline}` },
      { value: "opt_4", label: "Type your own answer below" },
    ]
  );
}

function QuestionPanel({
  question,
  options,
  optionsLoading,
  optionsError,
  onRetryOptions,
  answer,
  customText,
  setCustomText,
  onSelect,
  onToggleMulti,
  onSubmitCustom,
}: {
  question: GtmInterviewQuestion;
  options: GtmOption[];
  optionsLoading?: boolean;
  optionsError?: string | null;
  onRetryOptions?: () => void;
  answer?: GtmSectionAnswer;
  customText: string;
  setCustomText: (v: string) => void;
  onSelect: (opt: GtmOption) => void;
  onToggleMulti: (opt: GtmOption) => void;
  onSubmitCustom: () => void;
}) {
  const selected = new Set(
    Array.isArray(answer?.values) && answer!.values!.length
      ? answer!.values!
      : answer?.value
        ? [answer.value]
        : []
  );

  return (
    <div>
      <h4 style={{ marginBottom: 4 }}>{question.question}</h4>
      {question.helperText ? (
        <p className="text-muted" style={{ fontSize: 12, marginBottom: 16 }}>
          {question.helperText}
        </p>
      ) : null}

      {optionsLoading ? (
        <div style={{ marginBottom: 16 }}>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>
            Generating options for your company…
          </p>
          <div
            style={{
              height: 4,
              background: "var(--color-surface)",
              border: "1px solid var(--color-divider)",
            }}
          >
            <div style={{ height: "100%", width: "42%", background: "var(--color-accent)" }} />
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {options.map((opt) => {
            const active = selected.has(opt.value);
            return (
              <button
                key={`${opt.value}-${opt.label}`}
                type="button"
                className="btn btn-secondary"
                onClick={() => (question.type === "multi_select" ? onToggleMulti(opt) : onSelect(opt))}
                style={{
                  justifyContent: "flex-start",
                  textAlign: "left",
                  borderColor: active ? "var(--color-accent)" : undefined,
                  background: active ? "color-mix(in srgb, var(--color-accent) 14%, transparent)" : undefined,
                }}
              >
                <span style={{ flex: 1 }}>
                  {opt.label}
                  {opt.recommended ? (
                    <span className="tag tag-accent" style={{ marginLeft: 8 }}>
                      Recommended
                    </span>
                  ) : null}
                </span>
                {active ? "✓" : null}
              </button>
            );
          })}
          {!options.length ? (
            <div>
              <p style={{ color: "var(--color-accent)", fontSize: 13, marginBottom: 8 }}>
                {optionsError || "Options didn’t load."}
              </p>
              {onRetryOptions ? (
                <button type="button" className="btn btn-secondary" onClick={onRetryOptions}>
                  <RefreshCw size={14} /> Retry AI options
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {question.type === "multi_select" && selected.size > 0 ? (
        <button type="button" className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => onSelect({ value: "__continue__", label: "__continue__" })}>
          Continue with {selected.size} selected
        </button>
      ) : null}

      {question.allowCustomAnswer !== false ? (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Or type your own answer…"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmitCustom();
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!customText.trim()}
            onClick={onSubmitCustom}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function GtmDocumentView({
  doc,
  answers,
  onRegenerate,
  regenerating,
  onReset,
  setActiveScreen,
  focusSectionId = null,
  onActiveSectionChange,
}: {
  doc: StrategyDoc;
  answers: GtmAnswers;
  onRegenerate: () => void;
  regenerating: boolean;
  onReset: () => void;
  setActiveScreen: (screen: string) => void;
  focusSectionId?: string | null;
  onActiveSectionChange?: (sectionId: string | null) => void;
}) {
  const [docTab, setDocTab] = useState<"document" | "activation">("document");
  const [activeSectionId, setActiveSectionId] = useState<string | null>(focusSectionId);
  const ga = doc.goalAlignment || {};
  const sections: StrategySection[] =
    Array.isArray(doc.sections) && doc.sections.length > 0
      ? doc.sections
      : GTM_FULL_STRATEGY_SECTION_ORDER.map((s) => ({ id: s.id, title: s.title }));

  useEffect(() => {
    if (!focusSectionId) return;
    const exists = sections.some((s) => s.id === focusSectionId);
    if (exists) {
      setActiveSectionId(focusSectionId);
      setDocTab("document");
      onActiveSectionChange?.(focusSectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSectionId]);

  const selectSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
    onActiveSectionChange?.(sectionId);
  };

  const active = sections.find((s) => s.id === activeSectionId) || sections[0] || null;
  const sectionTargetFor = (sectionId: string) =>
    (ga.sectionTargets || []).find((t) => t.sectionId === sectionId);
  const northStarLabel = ga.north_star_metric || "North Star";
  const northStarTarget =
    ga.quantified_target || answerLabel(answers.quantified_target) || "Not quantified";
  const northStarTimeline = ga.timeline_target || answerLabel(answers.timeline_target) || "";
  const contributingCount = (ga.sectionTargets || []).filter(
    (t) => t.metric && !isPlaceholderSectionTarget(t)
  ).length;
  const placeholderCount = countPlaceholderSectionTargets(ga.sectionTargets || []);

  const exportPdf = () => {
    const html = strategyToHtml(doc);
    const w = window.open("", "_blank", "noopener");
    if (!w) {
      downloadBlob((doc.title || "gtm") + ".html", html, "text/html");
      return;
    }
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      w.focus();
      w.print();
    }, 300);
  };

  const exportMarkdown = () => {
    downloadBlob(
      `${(doc.title || "gtm-strategy").replace(/\s+/g, "-").toLowerCase()}.md`,
      strategyToMarkdown(doc),
      "text/markdown"
    );
  };

  const openSectionInAskMarqq = (section: StrategySection) => {
    const text = formatStrategySectionForChat(section);
    stashAskMarqqContext({
      sectionId: section.id,
      title: section.title || section.id,
      text:
        text ||
        `## ${section.title || section.id}\n\n(No written content yet — ask Marqq to draft or refine this section.)`,
    });
    setActiveScreen("chat");
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 6,
        }}
      >
        <h4 style={{ margin: 0 }}>GTM Strategy Document</h4>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" onClick={exportPdf}>
            Export PDF
          </button>
          <button type="button" className="btn btn-secondary" onClick={exportMarkdown}>
            Export Markdown
          </button>
          <button type="button" className="btn btn-secondary" onClick={onRegenerate} disabled={regenerating}>
            <RefreshCw size={12} /> {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onReset}>
            Start over
          </button>
        </div>
      </div>

      <div className="card elev-sm" style={{ marginBottom: 20 }}>
        <div className="card-kicker">North-star goal system</div>
        {ga.business_archetype ? (
          <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
            Archetype: {ga.business_archetype}
          </div>
        ) : null}
        <div className="card-title" style={{ fontSize: 16, marginTop: 4 }}>
          {northStarLabel}
        </div>
        <p className="card-body" style={{ marginTop: 8 }}>
          Target: {northStarTarget}
          {northStarTimeline ? ` · By ${northStarTimeline}` : ""}
        </p>
        {ga.metric_definition ? (
          <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
            Definition: {ga.metric_definition}
          </p>
        ) : null}
        {ga.ultimate_outcome_metric ? (
          <p className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
            Ultimate outcome: {ga.ultimate_outcome_metric}
          </p>
        ) : null}
        {ga.priority_90d || ga.channel_bet ? (
          <p className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
            {[ga.priority_90d ? `Primary: ${ga.priority_90d}` : null, ga.channel_bet ? `Channel: ${ga.channel_bet}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        {(ga.metric_tree || []).length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <div className="card-kicker">Metric tree</div>
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(ga.metric_tree || []).slice(0, 6).map((m) => (
                <span key={m} className="tag tag-outline" style={{ fontSize: 11 }}>
                  {m}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {(ga.primary_loop || []).length > 0 ? (
          <p className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
            Loop: {(ga.primary_loop || []).join(" → ")}
          </p>
        ) : null}
        {(ga.guardrails || []).length > 0 ? (
          <div style={{ marginTop: 10 }}>
            <div className="card-kicker">Guardrails</div>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {(ga.guardrails || []).slice(0, 4).map((g) => (
                <li key={g} style={{ fontSize: 12, marginBottom: 2 }}>
                  {g}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {(ga.rejects_as_nsm || []).length > 0 ? (
          <div style={{ marginTop: 10 }}>
            <div className="card-kicker">Do not optimize as NSM</div>
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(ga.rejects_as_nsm || []).slice(0, 5).map((r) => (
                <span key={r} className="tag tag-neutral" style={{ fontSize: 11 }}>
                  {r}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="card-meta" style={{ marginTop: 12 }}>
          <span>
            {contributingCount}/{ga.sectionTargets?.length || 0} concrete contributing metrics
          </span>
          <span style={{ marginLeft: 12 }}>{sections.length} sections mapped</span>
          {placeholderCount > 0 ? (
            <span style={{ marginLeft: 12 }} className="text-muted">
              {placeholderCount} still generic
            </span>
          ) : null}
        </div>
      </div>

      <div className="seg" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={`seg-opt${docTab === "document" ? " active" : ""}`}
          onClick={() => setDocTab("document")}
        >
          Strategy document
        </button>
        <button
          type="button"
          className={`seg-opt${docTab === "activation" ? " active" : ""}`}
          onClick={() => setDocTab("activation")}
        >
          Activation &amp; control loop
        </button>
      </div>

      {docTab === "document" ? (
        <div>
          <h4 style={{ marginBottom: 8 }}>Executive summary</h4>
          <p style={{ marginBottom: 20 }}>
            {doc.executiveSummary ||
              sections.find((s) => s.id === "executive_summary")?.summary ||
              "Strategy ready."}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(180px, 240px) 1fr",
              gap: 20,
              alignItems: "start",
            }}
            className="gtm-doc-split"
          >
            <div style={{ display: "grid", gap: 4 }}>
              {sections.map((s) => {
                const isActive = active?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => selectSection(s.id)}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: isActive
                        ? "1px solid var(--color-accent, #c45c26)"
                        : "1px solid transparent",
                      background: isActive ? "rgba(196,92,38,0.06)" : "transparent",
                      cursor: "pointer",
                      color: isActive ? "var(--color-accent, #c45c26)" : "var(--color-text)",
                      fontFamily: "var(--font-heading, Archivo, system-ui, sans-serif)",
                      fontSize: 13,
                      fontWeight: isActive ? 700 : 500,
                      lineHeight: 1.35,
                    }}
                  >
                    {s.title}
                  </button>
                );
              })}
            </div>

            <div>
              {active ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 12,
                      marginBottom: 12,
                    }}
                  >
                    <h4 style={{ margin: 0 }}>{active.title}</h4>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => openSectionInAskMarqq(active)}
                      title="Open this section in Ask Marqq with the full text"
                    >
                      Open →
                    </button>
                  </div>
                  {active.summary ? (
                    <p style={{ fontSize: 14, marginBottom: 12 }}>{active.summary}</p>
                  ) : null}
                  {sectionTargetFor(active.id) ? (
                    <div
                      className="card elev-sm"
                      style={{
                        marginBottom: 16,
                        borderColor: "rgba(196,92,38,0.35)",
                        background: "rgba(196,92,38,0.05)",
                      }}
                    >
                      <div className="card-kicker">Contribution to North Star</div>
                      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                        {sectionTargetFor(active.id)?.metric}
                      </div>
                      <p className="card-body" style={{ marginTop: 6, fontSize: 13 }}>
                        {sectionTargetFor(active.id)?.contribution}
                      </p>
                      <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
                        {[
                          sectionTargetFor(active.id)?.byWhen
                            ? `Due by ${sectionTargetFor(active.id)?.byWhen}`
                            : null,
                          sectionTargetFor(active.id)?.owner
                            ? `Owner: ${sectionTargetFor(active.id)?.owner}`
                            : null,
                          sectionTargetFor(active.id)?.targetType
                            ? sectionTargetFor(active.id)?.targetType?.replace(/_/g, " ")
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  ) : null}
                  {active.body ? (
                    <p
                      className="text-muted"
                      style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, marginBottom: 12 }}
                    >
                      {active.body}
                    </p>
                  ) : null}
                  {(active.bullets || []).length > 0 ? (
                    <ul style={{ margin: "0 0 16px", paddingLeft: 18 }}>
                      {(active.bullets || []).map((b, i) => (
                        <li key={i} style={{ fontSize: 13, marginBottom: 6 }}>
                          {b}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {(active.subsections || []).map((sub, i) => (
                    <div
                      key={`sub-${i}`}
                      style={{
                        borderTop: "1px solid var(--color-divider)",
                        paddingTop: 12,
                        marginTop: 12,
                      }}
                    >
                      <h5 style={{ margin: "0 0 6px", fontSize: 13 }}>{sub.title}</h5>
                      {sub.body ? (
                        <p className="text-muted" style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>
                          {sub.body}
                        </p>
                      ) : null}
                      {(sub.bullets || []).length > 0 ? (
                        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                          {(sub.bullets || []).map((b, j) => (
                            <li key={j} style={{ fontSize: 12, marginBottom: 4 }}>
                              {b}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </>
              ) : null}
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-kicker">Journey</div>
            <div className="card-title" style={{ fontSize: 15 }}>
              Strategy home
            </div>
            <p className="card-body">
              Open the live strategy document with section owners and next-best-action handoffs into workstreams.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setActiveScreen("strategy")}>
              Continue to Strategy
            </button>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-kicker">Next</div>
            <div className="card-title" style={{ fontSize: 15 }}>
              Marketing ideas
            </div>
            <p className="card-body">
              Run the marketing-ideas skill (139-idea catalog) against this locked strategy — scored for your North Star.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                try {
                  sessionStorage.setItem("marqq_marketing_ideas_autogen", "1");
                } catch {
                  /* ignore */
                }
                setActiveScreen("ideas");
              }}
            >
              Generate Marketing Ideas
            </button>
          </div>
        </div>
      ) : (
        <div>
          <h4 style={{ marginBottom: 12 }}>Activation plan</h4>
          <div style={{ display: "grid", gap: 8, marginBottom: 24 }}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>Review North Star</span>
                <span className="tag tag-accent">Done</span>
              </div>
              <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
                {northStarLabel} → {northStarTarget}
              </p>
            </div>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>Connect tools</span>
                <span className="tag tag-outline">2 of 4 connected</span>
              </div>
            </div>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>Run first agent in draft</span>
                <span className="tag tag-neutral">Not started</span>
              </div>
            </div>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>Approve live + schedule</span>
                <span className="tag tag-neutral">Not started</span>
              </div>
            </div>
          </div>
          <h4 style={{ marginBottom: 12 }}>Control loop</h4>
          <p className="card-body" style={{ marginBottom: 12 }}>
            Checkpoints measure actual vs. North Star, diagnose bottlenecks, and propose fixes — all
            draft-gated until you approve live work. Section leading indicators feed the loop; they are
            not fractional shares of the North Star.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setActiveScreen("orchestration")}
          >
            Open orchestration control loop
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginLeft: 8 }}
            onClick={() => setActiveScreen("strategy")}
          >
            Strategy home
          </button>
        </div>
      )}
    </div>
  );
}

export default function GtmWizard({ setActiveScreen }: GtmWizardProps) {
  const ctx = useMemo(() => getCtx(), []);
  const [state, setState] = useState<WizardState>(() => loadWizardState(ctx));
  const [regenerating, setRegenerating] = useState(false);
  const [customText, setCustomText] = useState("");
  const [liveOptions, setLiveOptions] = useState<GtmOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [focusStrategySectionId, setFocusStrategySectionId] = useState<string | null>(null);
  const optionsCache = useRef<Record<string, GtmOption[]>>({});
  const optionsReqId = useRef(0);
  const autoAdvancedStage = useRef<string | null>(null);

  const navigateToSection = (target: {
    kind: "interview" | "auto" | "end";
    interviewId?: GtmInterviewSectionId;
    strategySectionId?: string;
  }) => {
    autoAdvancedStage.current = null;
    if (target.kind === "interview" && target.interviewId) {
      const id = target.interviewId;
      // Redo wizard questions from here, but keep onboarding-locked answers
      autoAdvancedStage.current = id;
      setFocusStrategySectionId(null);
      try {
        saveGtmAutoSections(WORKSPACE_ID, []);
      } catch {
        /* ignore */
      }
      setState((s) => {
        const cleared = applyOnboardingAnswers(clearFromSection(s.answers, id), ctx);
        return {
          ...s,
          stage: id,
          answers: cleared,
          drafts: clearDraftsFromSection(s.drafts, id),
          questionIndex: startIndexForSection(id, cleared),
          review: null,
          briefsComplete: true,
          strategy: null,
        };
      });
      setCustomText("");
      return;
    }
    if (target.kind === "auto" && target.strategySectionId) {
      setFocusStrategySectionId(target.strategySectionId);
      if (state.strategy) {
        setState((s) => ({ ...s, stage: "document", review: null }));
        return;
      }
      if (interviewComplete(state.answers)) {
        void generateDocument();
      }
      return;
    }
    if (target.kind === "end") {
      setFocusStrategySectionId(null);
      if (state.strategy) {
        setState((s) => ({ ...s, stage: "document", review: null }));
        return;
      }
      if (interviewComplete(state.answers)) {
        void generateDocument();
      }
    }
  };

  useEffect(() => {
    const normalized = normalizeWizardState(state, ctx);
    sessionStorage.setItem(GTM_WIZARD_SESSION_KEY, JSON.stringify(normalized));
    if (normalized.strategy) {
      sessionStorage.setItem("marqq_gtm_strategy", JSON.stringify(normalized.strategy));
      try {
        const os = buildAgentOs({
          goalSystem: normalized.strategy.goalAlignment,
          strategyDocument: {
            title: normalized.strategy.title,
            executiveSummary: normalized.strategy.executiveSummary,
            sectionIds: (normalized.strategy.sections || []).map((s) => s.id),
          },
        });
        saveAgentOs(os);
      } catch (err) {
        console.warn("[gtm] agent OS bootstrap failed:", err);
      }
    }
  }, [state, ctx]);

  // Keep interview cursor on the first unanswered question (skip onboarding-prefilled)
  useEffect(() => {
    if (!isInterviewStage(state.stage)) return;
    const section = getInterviewSection(state.stage);
    if (!section) return;
    // Fully prefilled from onboarding → advance once per stage to the next section / strategy
    if (sectionAnswersComplete(section.questions, state.answers) && !state.review) {
      if (autoAdvancedStage.current !== state.stage) {
        autoAdvancedStage.current = state.stage;
        advanceAfterAnswer(state.stage, state.answers);
      }
      return;
    }
    const firstOpen = firstUnansweredIndex(section.questions, state.answers);
    const maxIdx = Math.max(section.questions.length - 1, 0);
    if (firstOpen > maxIdx) return;
    const current = section.questions[state.questionIndex];
    const currentFilled = current
      ? firstUnansweredIndex([current], state.answers) === 1
      : false;
    if (state.questionIndex !== firstOpen && (currentFilled || firstOpen < state.questionIndex || state.questionIndex === 0)) {
      setState((s) => (s.questionIndex === firstOpen ? s : { ...s, questionIndex: firstOpen }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- advance when stage lands fully seeded
  }, [state.stage, state.answers, state.questionIndex, state.review]);


  const stage = state.stage;
  const interviewSection = isInterviewStage(stage) ? getInterviewSection(stage) : null;
  const currentQuestion =
    interviewSection && interviewSection.questions[state.questionIndex]
      ? interviewSection.questions[state.questionIndex]
      : null;

  const loadQuestionOptions = async (force = false) => {
    if (!currentQuestion) {
      setLiveOptions([]);
      setOptionsLoading(false);
      setOptionsError(null);
      return;
    }
    const fixed = currentQuestion.fixedOptions;
    if (Array.isArray(fixed) && fixed.length > 0) {
      setLiveOptions(fixed);
      setOptionsLoading(false);
      setOptionsError(null);
      return;
    }
    const cacheKey = `${stage}:${currentQuestion.id}`;
    if (!force) {
      const cached = optionsCache.current[cacheKey];
      if (cached?.length) {
        setLiveOptions(cached);
        setOptionsLoading(false);
        setOptionsError(null);
        return;
      }
    }
    const reqId = ++optionsReqId.current;
    setOptionsLoading(true);
    setOptionsError(null);
    setLiveOptions([]);
    try {
      const res = await fetch("/api/gtm/interview/question-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: {
            id: currentQuestion.id,
            question: currentQuestion.question,
            helperText: currentQuestion.helperText || "",
            type: currentQuestion.type,
          },
          draftAnswers: state.answers,
          context: {
            companyName: ctx.companyName,
            website: ctx.website,
            niche: ctx.niche,
            icp: ctx.icp,
            outcome: ctx.outcome,
            timeWindow: ctx.timeWindow,
            target: ctx.target,
            baseline: ctx.baseline,
            brandTagline: ctx.brandTagline,
            businessSummary: ctx.businessSummary,
            toneOfVoice: ctx.toneOfVoice,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      let options = Array.isArray(data?.options) ? (data.options as GtmOption[]) : [];
      if (!options.length) {
        options = clientFallbackOptions(currentQuestion, ctx, state.answers);
        if (reqId === optionsReqId.current) {
          setOptionsError(data?.error ? String(data.error) : "Using company fallbacks — retry for fresh AI options.");
        }
      }
      if (reqId !== optionsReqId.current) return;
      optionsCache.current[cacheKey] = options;
      setLiveOptions(options);
    } catch (err) {
      console.error("[gtm] question options failed:", err);
      if (reqId !== optionsReqId.current) return;
      const fallback = clientFallbackOptions(currentQuestion, ctx, state.answers);
      optionsCache.current[cacheKey] = fallback;
      setLiveOptions(fallback);
      setOptionsError("AI options failed — showing company fallbacks.");
    } finally {
      if (reqId === optionsReqId.current) setOptionsLoading(false);
    }
  };

  // Fetch LLM options when the question has no static fixedOptions (Marqq2 behavior)
  useEffect(() => {
    void loadQuestionOptions(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id, stage, state.questionIndex]);

  const setAnswer = (questionId: string, next: GtmSectionAnswer) => {
    setState((s) => ({
      ...s,
      answers: { ...s.answers, [questionId]: next },
    }));
  };

  const advanceAfterAnswer = (sectionId: GtmInterviewSectionId, answers: GtmAnswers) => {
    const section = getInterviewSection(sectionId);
    if (!section) return;
    // Skip ahead past questions already filled from onboarding
    let nextIdx = state.questionIndex + 1;
    while (
      nextIdx < section.questions.length &&
      answers[section.questions[nextIdx].id] &&
      (Array.isArray(answers[section.questions[nextIdx].id].values)
        ? answers[section.questions[nextIdx].id].values!.length > 0
        : Boolean(
            String(answers[section.questions[nextIdx].id].value || "").trim() ||
              String(answers[section.questions[nextIdx].id].label || "").trim()
          ))
    ) {
      nextIdx += 1;
    }
    if (nextIdx < section.questions.length) {
      setState((s) => ({ ...s, questionIndex: nextIdx }));
      setCustomText("");
      return;
    }
    // Section complete → next interview section, or generate full strategy
    if (!sectionAnswersComplete(section.questions, answers)) return;
    const order = GTM_WIZARD_INTERVIEW_SECTION_IDS;
    const i = order.indexOf(sectionId);
    const next = order[i + 1];
    if (next) {
      setState((s) => ({
        ...s,
        stage: next,
        questionIndex: startIndexForSection(next, answers),
        review: null,
      }));
      setCustomText("");
      return;
    }
    setCustomText("");
    void generateDocument(answers);
  };

  const handleSelect = (opt: GtmOption) => {
    if (!interviewSection || !currentQuestion) return;
    if (opt.value === "__continue__") {
      // finalize multi-select and advance
      const existing = state.answers[currentQuestion.id];
      if (!existing || !(existing.values && existing.values.length)) return;
      const answers = { ...state.answers, [currentQuestion.id]: existing };
      advanceAfterAnswer(interviewSection.id, answers);
      return;
    }
    if (currentQuestion.type === "multi_select") return;

    const nextAnswer: GtmSectionAnswer = { value: opt.value, label: opt.label };
    const answers = { ...state.answers, [currentQuestion.id]: nextAnswer };
    setState((s) => ({ ...s, answers }));
    advanceAfterAnswer(interviewSection.id, answers);
  };

  const handleToggleMulti = (opt: GtmOption) => {
    if (!currentQuestion) return;
    const existing = state.answers[currentQuestion.id];
    const values = new Set(
      Array.isArray(existing?.values) && existing!.values!.length
        ? existing!.values!
        : existing?.value
          ? [existing.value]
          : []
    );
    if (values.has(opt.value)) values.delete(opt.value);
    else values.add(opt.value);
    const labels = liveOptions
      .filter((o) => values.has(o.value))
      .map((o) => o.label);
    // include custom labels already stored
    if (existing?.label && existing.value?.startsWith("custom_") && values.has(existing.value)) {
      labels.push(existing.label);
    }
    setAnswer(currentQuestion.id, {
      value: Array.from(values).join("||"),
      label: labels.join(", "),
      values: Array.from(values),
    });
  };

  const handleSubmitCustom = () => {
    if (!interviewSection || !currentQuestion) return;
    const text = customText.trim();
    if (!text) return;
    if (currentQuestion.type === "multi_select") {
      const existing = state.answers[currentQuestion.id];
      const values = new Set(existing?.values || []);
      const customVal = `custom_${Date.now()}`;
      values.add(customVal);
      const labelParts = [answerLabel(existing), text].filter(Boolean);
      const nextAnswer: GtmSectionAnswer = {
        value: Array.from(values).join("||"),
        label: labelParts.join(", "),
        values: Array.from(values),
      };
      const answers = { ...state.answers, [currentQuestion.id]: nextAnswer };
      setState((s) => ({ ...s, answers }));
      setCustomText("");
      return;
    }
    const nextAnswer: GtmSectionAnswer = { value: `custom_${Date.now()}`, label: text };
    const answers = { ...state.answers, [currentQuestion.id]: nextAnswer };
    setState((s) => ({ ...s, answers }));
    advanceAfterAnswer(interviewSection.id, answers);
  };

  const generateDocument = async (
    answersOverride?: GtmAnswers,
    draftsOverride?: WizardState["drafts"]
  ) => {
    const answersSnapshot = answersOverride || { ...state.answers };
    const draftsSnap = draftsOverride || state.drafts;
    const approved = Object.values(draftsSnap)
      .flat()
      .filter(Boolean) as GtmStrategySectionDraft[];
    setState((s) => ({ ...s, stage: "generating", review: null }));
    try {
      const doc = await generateGtmStrategy(ctx, answersSnapshot, approved);
      // Safety net: fold proposedGoalSystem when assembly somehow stayed weak.
      const goalsDraft = approved.find((x) => x.proposedGoalSystem || x.proposedNorthStar);
      if (goalsDraft?.proposedGoalSystem && isWeakGoalSystem(doc.goalAlignment)) {
        doc.goalAlignment = assembleGoalAlignment({
          proposed: goalsDraft.proposedGoalSystem,
          sectionIds: GTM_FULL_STRATEGY_SECTION_ORDER.map((s) => s.id),
          draftTargets: doc.goalAlignment.sectionTargets,
          answers: {
            priority_90d: answerLabel(answersSnapshot.priority_90d) || ctx.outcome,
            quantified_target:
              goalsDraft.proposedNorthStar ||
              answerLabel(answersSnapshot.quantified_target) ||
              ctx.target,
            timeline_target: answerLabel(answersSnapshot.timeline_target) || ctx.timeWindow,
            channel_bet: answerLabel(answersSnapshot.channel_bet),
            success_baseline: answerLabel(answersSnapshot.success_baseline) || ctx.baseline,
          },
          ctx: {
            outcome: answerLabel(answersSnapshot.priority_90d) || ctx.outcome,
            target: answerLabel(answersSnapshot.quantified_target) || ctx.target,
            timeline: answerLabel(answersSnapshot.timeline_target) || ctx.timeWindow,
            baseline: ctx.baseline,
            channel: answerLabel(answersSnapshot.channel_bet),
            companyName: ctx.companyName,
            niche: ctx.niche,
          },
        });
        doc.sections = alignSectionsToLeadingMetrics(doc.sections, doc.goalAlignment.sectionTargets);
      }
      setState((s) => ({ ...s, stage: "document", strategy: doc, answers: answersSnapshot }));
    } catch (err) {
      console.error("[gtm] generation failed:", err);
      setState((s) => ({
        ...s,
        stage: "document",
        answers: answersSnapshot,
        strategy: fallbackStrategy(ctx, answersSnapshot, approved),
      }));
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const approved = Object.values(state.drafts).flat().filter(Boolean) as GtmStrategySectionDraft[];
      const doc = await generateGtmStrategy(ctx, state.answers, approved);
      setState((s) => ({ ...s, strategy: doc }));
    } catch (err) {
      console.error("[gtm] regenerate failed:", err);
    } finally {
      setRegenerating(false);
    }
  };

  const handleReset = () => {
    sessionStorage.removeItem(GTM_WIZARD_SESSION_KEY);
    sessionStorage.removeItem("marqq_gtm_strategy");
    sessionStorage.removeItem("marqq_gtm_briefs_complete");
    clearAgentOs();
    sessionStorage.setItem(GTM_WIZARD_VERSION_KEY, GTM_WIZARD_SESSION_VERSION);
    try {
      saveGtmAutoSections(WORKSPACE_ID, []);
    } catch {
      /* ignore */
    }
    autoAdvancedStage.current = "goals";
    // Keep onboarding answers (outcome / timeline / target / baseline / ICP); clear wizard-only picks
    const answers = applyOnboardingAnswers({}, ctx);
    setState({
      stage: "goals",
      answers,
      questionIndex: startIndexForSection("goals", answers),
      briefsComplete: true,
      drafts: {},
      review: null,
      strategy: null,
    });
    setCustomText("");
  };

  const totalInSection = interviewSection?.questions.length || 0;
  const qNum = Math.min(state.questionIndex + 1, totalInSection);

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>GTM Wizard</h1>
      <p className="text-muted" style={{ marginBottom: 20 }}>
        Answer Goals → Module → Offer → Audience with AI options. Strategy section headers show what will be generated at the end.
      </p>

      <StageChips
        stage={stage}
        hasStrategy={Boolean(state.strategy)}
        interviewDone={interviewComplete(state.answers)}
        activeStrategySectionId={focusStrategySectionId}
        onNavigate={navigateToSection}
      />

      {interviewSection && currentQuestion ? (
        <div style={{ width: "100%", maxWidth: 1100 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 20,
              alignItems: "start",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <div>
                  <h4 style={{ marginBottom: 4 }}>{interviewSection.title}</h4>
                  <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                    {interviewSection.description}
                  </p>
                </div>
                <span className="tag tag-neutral">
                  Q{qNum}/{totalInSection}
                </span>
              </div>
              <div
                style={{
                  height: 4,
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-divider)",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(state.questionIndex / Math.max(totalInSection, 1)) * 100}%`,
                    background: "var(--color-accent)",
                  }}
                />
              </div>
              <QuestionPanel
                question={currentQuestion}
                options={liveOptions}
                optionsLoading={optionsLoading}
                optionsError={optionsError}
                onRetryOptions={() => {
                  const key = `${stage}:${currentQuestion.id}`;
                  delete optionsCache.current[key];
                  void loadQuestionOptions(true);
                }}
                answer={state.answers[currentQuestion.id]}
                customText={customText}
                setCustomText={setCustomText}
                onSelect={handleSelect}
                onToggleMulti={handleToggleMulti}
                onSubmitCustom={handleSubmitCustom}
              />
              {sectionAnswersComplete(interviewSection.questions, state.answers) &&
              state.questionIndex >= interviewSection.questions.length - 1 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: 20 }}
                  onClick={() => advanceAfterAnswer(interviewSection.id, state.answers)}
                >
                  {interviewSection.cta}
                </button>
              ) : null}
            </div>

            <LockedAnswersCard answers={state.answers} />
          </div>
        </div>
      ) : null}

      {stage === "generating" ? <GeneratingView /> : null}

      {stage === "document" && state.strategy ? (
        <GtmDocumentView
          doc={state.strategy}
          answers={state.answers}
          onRegenerate={handleRegenerate}
          regenerating={regenerating}
          onReset={handleReset}
          setActiveScreen={setActiveScreen}
          focusSectionId={focusStrategySectionId}
          onActiveSectionChange={setFocusStrategySectionId}
        />
      ) : null}
    </div>
  );
}
