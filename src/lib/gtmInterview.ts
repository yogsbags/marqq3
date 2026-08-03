/** Marqq2-aligned GTM interview definitions (live wizard subset). */

export type GtmQuestionType = "single_select" | "multi_select" | "free_text";

export interface GtmOption {
  value: string;
  label: string;
  recommended?: boolean;
}

export interface GtmInterviewQuestion {
  id: string;
  question: string;
  helperText?: string;
  type: GtmQuestionType;
  allowCustomAnswer?: boolean;
  fixedOptions?: GtmOption[];
}

export interface GtmInterviewSection {
  id: "goals" | "module" | "offer" | "audience";
  title: string;
  description: string;
  cta: string;
  questions: GtmInterviewQuestion[];
}

export interface GtmDraftCard {
  id: string;
  kicker: string;
  body: string;
}

export interface GtmSectionAnswer {
  value: string;
  label: string;
  values?: string[];
}

export type GtmAnswers = Record<string, GtmSectionAnswer>;

/** Answers captured in onboarding — keep these when resetting wizard sections. */
export const ONBOARDING_SEEDED_ANSWER_IDS = [
  "priority_90d",
  "timeline_target",
  "quantified_target",
  "success_baseline",
  "icp",
] as const;

/** Live wizard order — Goals first so North Star locks early. */
export const GTM_WIZARD_INTERVIEW_SECTION_IDS = [
  "goals",
  "module",
  "offer",
  "audience",
] as const;

export type GtmInterviewSectionId = (typeof GTM_WIZARD_INTERVIEW_SECTION_IDS)[number];

export const GTM_INTERVIEW_STRATEGY_OUTPUTS: Record<
  GtmInterviewSectionId,
  { cta: string; outputs: Array<{ id: string; title: string; blurb?: string }> }
> = {
  goals: {
    cta: "Lock Goals · Continue",
    outputs: [],
  },
  module: {
    cta: "Lock Module · Continue",
    outputs: [],
  },
  offer: {
    cta: "Lock Offer · Continue",
    outputs: [],
  },
  audience: {
    cta: "Lock Audience · Generate strategy",
    outputs: [],
  },
};

export const GTM_FULL_STRATEGY_SECTION_ORDER = [
  { id: "executive_summary", title: "Executive summary", openScreen: null as string | null },
  { id: "market_analysis", title: "Market analysis", openScreen: "market" },
  { id: "target_customer", title: "Target customer", openScreen: "audiences" },
  { id: "product_strategy", title: "Product strategy", openScreen: "strategy" },
  { id: "positioning_messaging", title: "Positioning & messaging", openScreen: "brand" },
  { id: "pricing_monetization", title: "Pricing & monetization", openScreen: "pricing" as string | null },
  { id: "distribution_channels", title: "Distribution & channels", openScreen: "campaigns" },
  { id: "marketing_strategy", title: "Marketing strategy", openScreen: "campaigns" },
  { id: "sales_strategy", title: "Sales strategy", openScreen: "crm" },
  { id: "customer_success", title: "Customer success & retention", openScreen: "customer360" },
  { id: "launch_plan", title: "Launch plan", openScreen: "calendar" },
  { id: "operations_execution", title: "Operations & execution", openScreen: "workflows" },
  { id: "financial_plan", title: "Financial plan", openScreen: "reporting" },
  { id: "measurement_optimization", title: "Measurement & optimization", openScreen: "analytics" },
  { id: "risks_contingencies", title: "Risks & contingencies", openScreen: "market" },
  { id: "timeline_roadmap", title: "Timeline & roadmap", openScreen: "orchestration" },
] as const;

export const GTM_INTERVIEW_SECTIONS: GtmInterviewSection[] = [
  {
    id: "goals",
    title: "Goals",
    description: "Define the objective and timeline, then lock a quantified north-star target.",
    cta: GTM_INTERVIEW_STRATEGY_OUTPUTS.goals.cta,
    questions: [
      {
        id: "priority_90d",
        question: "What business outcome should Marqq optimize for?",
        helperText: "AI proposes outcomes from your business model — pick or type your own.",
        type: "multi_select",
        allowCustomAnswer: true,
        // No fixedOptions — LLM from Brand DNA / company context
      },
      {
        id: "timeline_target",
        question: "By when should we hit the target?",
        helperText: "Set the deadline first so the north-star stays realistic for that window.",
        type: "single_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "30d", label: "30 days" },
          { value: "60d", label: "60 days" },
          { value: "90d", label: "90 days", recommended: true },
          { value: "2_quarters", label: "This half / 2 quarters" },
        ],
      },
      {
        id: "quantified_target",
        question: "What North Star Metric should Marqq agents drive?",
        helperText: "AI proposes a quantified outcome metric for your business — pick or type your own.",
        type: "single_select",
        allowCustomAnswer: true,
        // No fixedOptions — LLM from company + timeline
      },
      {
        id: "channel_bet",
        question: "Which channel should lead first?",
        helperText: "Select the channels you want to lead with.",
        type: "multi_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "content_seo", label: "Content / SEO" },
          { value: "paid", label: "Paid acquisition" },
          { value: "social", label: "Social / community" },
          { value: "sales_led", label: "Sales-led outreach", recommended: true },
        ],
      },
      {
        id: "budget_band",
        question: "What is the approximate marketing budget for that timeline?",
        type: "single_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "zero", label: "₹0 / $0 — organic & owned only" },
          { value: "under_5l", label: "Under ₹5L / $6k" },
          { value: "5_20l", label: "₹5–20L / $6–25k", recommended: true },
          { value: "20_50l", label: "₹20–50L / $25–60k" },
          { value: "50l_plus", label: "₹50L+ / $60k+" },
        ],
      },
      {
        id: "success_baseline",
        question: "What is your current baseline for the primary metric?",
        helperText: "Where you are starting from — even a rough number helps.",
        type: "single_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "none", label: "No reliable baseline yet" },
          { value: "1_lead_mo", label: "1 qualified lead per month", recommended: true },
          { value: "mid", label: "Mid-scale with noisy attribution" },
          { value: "strong", label: "Strong baseline with clean tracking" },
        ],
      },
      {
        id: "strategy_depth",
        question: "How detailed should the GTM strategy document be?",
        type: "single_select",
        allowCustomAnswer: false,
        fixedOptions: [
          { value: "practical_90d", label: "Practical 90-day execution plan", recommended: true },
          { value: "full_strategic", label: "Full strategic plan (all sections)" },
          { value: "executive_only", label: "Executive summary + priorities" },
          { value: "launch_plan", label: "Launch-focused plan" },
        ],
      },
    ],
  },
  {
    id: "module",
    title: "Module",
    description: "What product, service, app, or business line is this GTM for?",
    cta: GTM_INTERVIEW_STRATEGY_OUTPUTS.module.cta,
    questions: [
      {
        id: "module_type",
        question: "What are you building a go-to-market plan for?",
        helperText: "This scopes every later answer to one offer line.",
        type: "single_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "product", label: "Product", recommended: true },
          { value: "service", label: "Service" },
          { value: "app", label: "App" },
          { value: "business_line", label: "Business line / brand" },
        ],
      },
      {
        id: "module_name",
        question: "What should we call this module?",
        helperText: "AI proposes names from your Brand DNA — pick or type your own.",
        type: "single_select",
        allowCustomAnswer: true,
      },
      {
        id: "one_sentence_desc",
        question: "In one sentence, what does this offer do?",
        helperText: "AI proposes plain-language descriptions from your company context.",
        type: "single_select",
        allowCustomAnswer: true,
      },
    ],
  },
  {
    id: "offer",
    title: "Offer",
    description: "How this module makes money — packaging, pricing, and proof. (What it does was covered in Module.)",
    cta: GTM_INTERVIEW_STRATEGY_OUTPUTS.offer.cta,
    questions: [
      {
        id: "category",
        question: "Where would a buyer put you on a shortlist?",
        helperText: "AI proposes market-shelf categories from your niche — pick or type your own.",
        type: "single_select",
        allowCustomAnswer: true,
      },
      {
        id: "business_model",
        question: "How do you primarily make money?",
        helperText: "Revenue motion — not the product description.",
        type: "single_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "saas_subscription", label: "SaaS / subscription", recommended: true },
          { value: "one_time", label: "One-time / project fee" },
          { value: "marketplace", label: "Marketplace / take-rate" },
          { value: "usage", label: "Usage-based / credits" },
        ],
      },
      {
        id: "pricing_strategy",
        question: "How do you package and charge?",
        helperText: "Select all packaging motions that apply.",
        type: "multi_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "value_based", label: "Value-based pricing", recommended: true },
          { value: "tiered_plans", label: "Tiered plans (Good / Better / Best)" },
          { value: "freemium_trial", label: "Freemium or free trial" },
          { value: "custom_enterprise", label: "Custom / enterprise quotes" },
        ],
      },
      {
        id: "validation_evidence",
        question: "What proof do you have that buyers will pay?",
        helperText: "Select all that apply — honesty beats optimism.",
        type: "multi_select",
        allowCustomAnswer: true,
        fixedOptions: [
          { value: "paying_customers", label: "Paying customers", recommended: true },
          { value: "pilots_waitlist", label: "Pilots / waitlist / LOIs" },
          { value: "interviews_usage", label: "User interviews / usage data" },
          { value: "no_validation", label: "No strong validation yet" },
        ],
      },
    ],
  },
  {
    id: "audience",
    title: "Audience",
    description: "Who buys, why they care, and when you need them.",
    cta: GTM_INTERVIEW_STRATEGY_OUTPUTS.audience.cta,
    questions: [
      {
        id: "icp",
        question: "Who is the ideal customer for this module?",
        helperText: "AI proposes ICP segments from your Brand DNA — select all that apply or type your own.",
        type: "multi_select",
        allowCustomAnswer: true,
      },
      {
        id: "persona",
        question: "Who is the primary decision-maker or champion?",
        helperText: "AI proposes buyer roles for your offer — select all that apply.",
        type: "multi_select",
        allowCustomAnswer: true,
      },
      {
        id: "jtbd",
        question: "What job are they hiring this offer to do?",
        helperText: "AI proposes jobs-to-be-done for your buyers — select all that apply or type your own.",
        type: "multi_select",
        allowCustomAnswer: true,
      },
      {
        id: "buying_triggers",
        question: "What typically triggers a buyer to start looking?",
        helperText: "AI proposes urgency triggers for your market — select all that apply.",
        type: "multi_select",
        allowCustomAnswer: true,
      },
      {
        id: "not_a_fit",
        question: "Who is explicitly not a good fit?",
        helperText: "AI proposes disqualifiers for your offer — select all that apply.",
        type: "multi_select",
        allowCustomAnswer: true,
      },
    ],
  },
];

export function getInterviewSection(id: string): GtmInterviewSection | undefined {
  return GTM_INTERVIEW_SECTIONS.find((s) => s.id === id);
}

export function answerLabel(answer: GtmSectionAnswer | undefined): string {
  if (!answer) return "";
  if (Array.isArray(answer.values) && answer.values.length) {
    return answer.values.map(String).join(", ");
  }
  return String(answer.label || answer.value || "").trim();
}

function isAnswerFilled(answer: GtmSectionAnswer | undefined): boolean {
  if (!answer) return false;
  if (Array.isArray(answer.values) && answer.values.length > 0) return true;
  return Boolean(String(answer.value || "").trim() || String(answer.label || "").trim());
}

export function sectionAnswersComplete(
  questions: GtmInterviewQuestion[],
  answers: GtmAnswers
): boolean {
  return questions.every((q) => isAnswerFilled(answers[q.id]));
}

/** Index of first unanswered question, or questions.length if all answered. */
export function firstUnansweredIndex(
  questions: GtmInterviewQuestion[],
  answers: GtmAnswers
): number {
  const idx = questions.findIndex((q) => !isAnswerFilled(answers[q.id]));
  return idx === -1 ? questions.length : idx;
}

function matchFixedOption(
  sectionId: GtmInterviewSectionId,
  questionId: string,
  text: string
): GtmSectionAnswer | null {
  const section = getInterviewSection(sectionId);
  const question = section?.questions.find((q) => q.id === questionId);
  if (!question || !text) return null;
  const needle = text.trim().toLowerCase();
  const opt = question.fixedOptions?.find(
    (o) => o.label.toLowerCase() === needle || o.value.toLowerCase() === needle
  );
  if (!opt) return null;
  if (question.type === "multi_select") {
    return { value: opt.value, label: opt.label, values: [opt.value] };
  }
  return { value: opt.value, label: opt.label };
}

export function seedAnswersFromOnboarding(ctx: {
  outcome?: string;
  target?: string;
  baseline?: string;
  timeWindow?: string;
  icp?: string;
  companyName?: string;
  niche?: string;
  brandTagline?: string;
  businessSummary?: string;
  /** Market-analysis bullets from wizard auto-briefs (optional). */
  marketBullets?: string[];
}): GtmAnswers {
  const seeded: GtmAnswers = {};
  const niche = String(ctx.niche || "").toLowerCase();
  const summary = String(ctx.businessSummary || "").toLowerCase();
  const blob = `${niche} ${summary} ${String(ctx.companyName || "").toLowerCase()}`;
  const isServices =
    /\b(consult|advisory|agency|services?|transformation|strategy meets)\b/i.test(blob) &&
    !/\b(nutrition app|consumer app|saas platform|mobile app)\b/i.test(blob);
  const isApp = /\b(app|saas|platform|consumer)\b/i.test(blob) && !isServices;

  if (ctx.outcome) {
    seeded.priority_90d =
      matchFixedOption("goals", "priority_90d", ctx.outcome) || {
        value: "custom_outcome",
        label: ctx.outcome,
        values: ["custom_outcome"],
      };
  }
  if (ctx.target) {
    seeded.quantified_target =
      matchFixedOption("goals", "quantified_target", ctx.target) || {
        value: "custom_target",
        label: ctx.target,
      };
  }
  if (ctx.timeWindow) {
    const tw = ctx.timeWindow.toLowerCase();
    seeded.timeline_target =
      matchFixedOption("goals", "timeline_target", ctx.timeWindow) ||
      (tw.includes("30")
        ? { value: "30d", label: "30 days" }
        : tw.includes("60")
          ? { value: "60d", label: "60 days" }
          : tw.includes("90")
            ? { value: "90d", label: "90 days" }
            : { value: "custom_timeline", label: ctx.timeWindow });
  }
  if (ctx.baseline) {
    seeded.success_baseline =
      matchFixedOption("goals", "success_baseline", ctx.baseline) || {
        value: "custom_baseline",
        label: ctx.baseline,
      };
  }
  if (ctx.icp) {
    seeded.icp =
      matchFixedOption("audience", "icp", ctx.icp) || {
        value: "custom_icp",
        label: ctx.icp,
        values: ["custom_icp"],
      };
  }

  // Goals extras — align with organic / zero-cash onboarding briefs
  seeded.channel_bet = isServices
    ? { value: "sales_led", label: "Sales-led outreach", values: ["sales_led"] }
    : { value: "social", label: "Social / community", values: ["social"] };
  seeded.budget_band = { value: "zero", label: "₹0 / $0 — organic & owned only" };
  seeded.strategy_depth = {
    value: "practical_90d",
    label: "Practical 90-day execution plan",
  };

  // Module — infer from Brand DNA / niche (skip re-asking)
  seeded.module_type = isServices
    ? { value: "service", label: "Service" }
    : isApp
      ? { value: "app", label: "App" }
      : { value: "product", label: "Product" };
  if (ctx.companyName) {
    seeded.module_name = { value: "custom_module", label: ctx.companyName };
  }
  const oneSentence =
    String(ctx.businessSummary || "").trim() ||
    String(ctx.brandTagline || "").trim() ||
    String(ctx.niche || "").trim();
  if (oneSentence) {
    seeded.one_sentence_desc = {
      value: "custom_desc",
      label: oneSentence.length > 160 ? `${oneSentence.slice(0, 157)}…` : oneSentence,
    };
  }

  // Offer — monetization only (what-it-does lives on Module)
  seeded.category = isServices
    ? { value: "services", label: "Professional services" }
    : { value: "vertical_saas", label: "Vertical SaaS" };
  seeded.business_model = isServices
    ? { value: "one_time", label: "One-time / project fee" }
    : { value: "saas_subscription", label: "SaaS / subscription" };
  seeded.pricing_strategy = isServices
    ? { value: "custom_enterprise", label: "Custom / enterprise quotes", values: ["custom_enterprise"] }
    : { value: "value_based", label: "Value-based pricing", values: ["value_based"] };
  seeded.validation_evidence = {
    value: "interviews_usage",
    label: "User interviews / usage data",
    values: ["interviews_usage"],
  };

  // Audience — ICP already seeded; fill the rest from briefs / defaults
  seeded.persona = isServices
    ? { value: "founder_ceo", label: "Founder / CEO", values: ["founder_ceo"] }
    : { value: "cmo_growth", label: "CMO / Head of Growth", values: ["cmo_growth"] };
  seeded.jtbd = /retain|activation/i.test(String(ctx.outcome || ""))
    ? { value: "scale_without_headcount", label: "Scale outcomes without adding headcount", values: ["scale_without_headcount"] }
    : /transform|ai|strategy/i.test(`${ctx.niche || ""} ${ctx.outcome || ""}`)
      ? {
          value: "clarify_execute_strategy",
          label: "Turn strategy into an executable plan",
          values: ["clarify_execute_strategy"],
        }
      : { value: "fill_pipeline", label: "Build a predictable pipeline of the right buyers", values: ["fill_pipeline"] };

  // Timeline already locked in Goals — don't re-ask in Audience
  if (seeded.timeline_target) {
    delete seeded.target_timeline;
  }

  const marketText = (ctx.marketBullets || []).join(" ").toLowerCase();
  const triggerVals: string[] = [];
  if (/cxo|leadership|mandate|new (ceo|cio|cto)/i.test(marketText)) triggerVals.push("leadership_change");
  if (/budget|fy-|planning cycle/i.test(marketText)) triggerVals.push("budget_cycle");
  if (/pain|stalled|failed|sla/i.test(marketText)) triggerVals.push("pain_spike");
  if (!triggerVals.length) triggerVals.push("leadership_change", "budget_cycle");
  seeded.buying_triggers = {
    value: triggerVals[0],
    label: triggerVals
      .map((v) =>
        v === "leadership_change"
          ? "New leadership / mandate"
          : v === "budget_cycle"
            ? "Budget / planning cycle"
            : v === "pain_spike"
              ? "Pain spike (missed revenue / SLA breach)"
              : v
      )
      .join(", "),
    values: triggerVals,
  };

  const deprioritize = (ctx.marketBullets || []).find((b) => /deprioritize/i.test(b));
  seeded.not_a_fit = deprioritize
    ? { value: "custom_not_fit", label: deprioritize.replace(/^deprioritize:\s*/i, ""), values: ["custom_not_fit"] }
    : { value: "too_small", label: "Too small / no budget", values: ["too_small"] };

  return seeded;
}

/** Overlay only onboarding-owned answers (outcome, timeline, target, baseline, ICP). */
export function applyOnboardingAnswers(
  answers: GtmAnswers,
  ctx: Parameters<typeof seedAnswersFromOnboarding>[0]
): GtmAnswers {
  const seeded = seedAnswersFromOnboarding(ctx);
  const next = { ...answers };
  for (const id of ONBOARDING_SEEDED_ANSWER_IDS) {
    if (seeded[id]) next[id] = seeded[id];
  }
  return next;
}

/** First interview stage that still has unanswered questions. */
export function firstIncompleteInterviewSection(
  answers: GtmAnswers
): GtmInterviewSectionId | null {
  for (const id of GTM_WIZARD_INTERVIEW_SECTION_IDS) {
    const section = getInterviewSection(id);
    if (!section) continue;
    if (!sectionAnswersComplete(section.questions, answers)) return id;
  }
  return null;
}


export function buildSectionDrafts(
  sectionId: GtmInterviewSectionId,
  answers: GtmAnswers,
  ctx: { companyName: string }
): GtmDraftCard[] {
  const outputs = GTM_INTERVIEW_STRATEGY_OUTPUTS[sectionId].outputs;
  const a = (id: string) => answerLabel(answers[id]) || "TBD";

  if (sectionId === "goals") {
    return [
      {
        id: "financial_plan",
        kicker: "Financial plan",
        body: `${a("quantified_target")} over ${a("timeline_target")} for ${ctx.companyName}, led by ${a("channel_bet")} within ${a("budget_band")}.`,
      },
      {
        id: "customer_success",
        kicker: "Customer success",
        body: `Onboarding and expansion motions sized to outcome “${a("priority_90d")}”, starting from baseline ${a("success_baseline")}.`,
      },
      {
        id: "operations_execution",
        kicker: "Operations & execution",
        body: `Weekly cadence across ${a("channel_bet")}, reviewed against the North Star with ${a("strategy_depth")} depth.`,
      },
    ];
  }

  if (sectionId === "offer") {
    return [
      {
        id: "product_strategy",
        kicker: "Product strategy",
        body: `${a("one_sentence_desc")} · ${a("category")}. Validation: ${a("validation_evidence")}.`,
      },
      {
        id: "pricing_monetization",
        kicker: "Pricing & monetization",
        body: `${a("business_model")} with ${a("pricing_strategy")} packaging.`,
      },
    ];
  }

  if (sectionId === "audience") {
    return [
      {
        id: "target_customer",
        kicker: "Target customer",
        body: `ICP: ${a("icp")}. Champion: ${a("persona")}. Jobs: ${a("jtbd")}. Triggers: ${a("buying_triggers")}. Not a fit: ${a("not_a_fit")}. Timeline: ${a("timeline_target")}.`,
      },
    ];
  }

  return outputs.map((o) => ({
    id: o.id,
    kicker: o.title,
    body: o.blurb || "",
  }));
}
