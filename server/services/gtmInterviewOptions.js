/**
 * LLM-generated multiple-choice options for GTM interview questions (Marqq2-aligned).
 * Static fixedOptions (exactly 4) are returned as-is; otherwise Groq proposes 4 options
 * grounded in company / Brand DNA / draft answers.
 */

import { meteredStudioChat, assertCanAfford } from "./credits/index.js";

function parseJsonLoose(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function answerLabel(answers, id) {
  const a = answers?.[id];
  if (!a) return "";
  if (typeof a === "string") return a.trim();
  return String(a.label || a.value || "").trim();
}

function optionLabelLimit(questionId) {
  if (
    questionId === "quantified_target" ||
    questionId === "priority_90d" ||
    questionId === "one_sentence_desc" ||
    questionId === "one_liner" ||
    questionId === "jtbd"
  ) {
    return 160;
  }
  return 120;
}

function questionOptionGuidance(question) {
  const guides = {
    priority_90d: `Each option is a concrete business outcome Marqq should optimize for THIS company — not generic vanity marketing goals.`,
    quantified_target: `Each option is a quantified North Star (number + unit + by-when) that fits the timeline and business model.`,
    module_name: `Each option is a clear internal name for the product/service line.`,
    one_sentence_desc: `Each option is one plain-language sentence describing what the offer does.`,
    category: `Each option is a market-shelf category a buyer would use to shortlist vendors.`,
    icp: `Each option names a concrete ideal customer segment for THIS company.`,
    persona: `Each option is a buyer persona / role title relevant to THIS offer.`,
    jtbd: `Each option is a job-to-be-done the buyer hires THIS offer for — grounded in the company's actual buyers, not unrelated industries (e.g. no clinic no-shows for a consulting firm).`,
    buying_triggers: `Each option is an event that creates urgency for THIS buyer's purchase.`,
    not_a_fit: `Each option is an explicit disqualifier for THIS offer.`,
  };
  return guides[question.id] || "Options must directly answer the question for this company only.";
}

function contextualFallbacks(question, ctx, draftAnswers) {
  const company = ctx.companyName || "Your company";
  const niche = ctx.niche || "your market";
  const icp = answerLabel(draftAnswers, "icp") || ctx.icp || "your ideal customer";
  const outcome = answerLabel(draftAnswers, "priority_90d") || ctx.outcome || "the core business outcome";
  const timeline = answerLabel(draftAnswers, "timeline_target") || ctx.timeWindow || "90 days";
  const tagline = ctx.brandTagline || ctx.businessSummary || `${company} for ${icp}`;

  const banks = {
    priority_90d: [
      { value: "custom_outcome", label: outcome, recommended: true },
      { value: "pipeline", label: `Grow qualified demand from ${icp}` },
      { value: "revenue", label: "Increase revenue from the core offer" },
      { value: "ai_recommend", label: "Let Marqq recommend the right outcome" },
    ],
    quantified_target: [
      {
        value: "custom_target",
        label: ctx.target || `Hit a measurable outcome for ${icp} within ${timeline}`,
        recommended: true,
      },
      { value: "ai_recommend", label: "Let Marqq recommend a realistic North Star" },
      {
        value: "value_loop",
        label: `Repeatable client/value progress within ${timeline}`,
      },
      {
        value: "qualified_wins",
        label: `Qualified engagements won with ${icp} by end of ${timeline}`,
      },
    ],
    module_name: [
      { value: "company", label: company, recommended: true },
      { value: "core", label: `${company} — Core` },
      { value: "niche", label: `${company} — ${niche}` },
      { value: "growth", label: `${company} — Growth offer` },
    ],
    one_sentence_desc: [
      { value: "tagline", label: String(tagline).slice(0, 160), recommended: true },
      { value: "helps_icp", label: `${company} helps ${icp} achieve ${outcome}.` },
      { value: "execution", label: `${company} turns strategy into executable GTM work for ${icp}.` },
      { value: "ai_assist", label: `AI-assisted ${niche} delivery for ${icp}.` },
    ],
    category: [
      { value: "niche_cat", label: niche, recommended: true },
      { value: "services", label: "Professional services" },
      { value: "b2b_saas", label: "B2B SaaS" },
      { value: "advisory", label: "Strategy / transformation advisory" },
    ],
    icp: [
      { value: "onboarding_icp", label: icp, recommended: true },
      { value: "mid_market", label: `Mid-market leaders in ${niche}` },
      { value: "growth_stage", label: "Growth-stage / scaling leadership teams" },
      { value: "enterprise", label: "Enterprise transformation sponsors" },
    ],
    persona: [
      { value: "founder_ceo", label: "Founder / CEO", recommended: true },
      { value: "vp_strategy", label: "VP Strategy / Transformation" },
      { value: "coo_ops", label: "COO / Head of Ops" },
      { value: "cmo_growth", label: "CMO / Head of Growth" },
    ],
    jtbd: [
      {
        value: "execute_strategy",
        label: `Turn ${niche} strategy into an executable plan`,
        recommended: true,
      },
      { value: "fill_pipeline", label: `Build a predictable pipeline of ${icp}` },
      {
        value: "accelerate_change",
        label: "Accelerate transformation without stalled pilots",
      },
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

  const list = banks[question.id];
  if (list?.length) return list.slice(0, 4);
  return [
    { value: "opt_1", label: `Best fit for ${company}`, recommended: true },
    { value: "opt_2", label: `Strong alternative for ${icp}` },
    { value: "opt_3", label: `Conservative option for ${timeline}` },
    { value: "opt_4", label: "Type your own answer below" },
  ];
}

async function callGroq(system, user, workspaceId = "marqq-ws-1") {
  const result = await meteredStudioChat({
    workspaceId,
    feature: "gtm_interview",
    system,
    user,
    temperature: 0.35,
    max_tokens: 900,
    meta: { feature: "gtm_interview" },
  });
  return result.content || "";
}

/**
 * @param {{ question: object, draftAnswers?: object, context?: object }} input
 * @returns {Promise<Array<{ value: string, label: string, recommended?: boolean }>>}
 */
export async function generateInterviewQuestionOptions(input) {
  const question = input?.question || {};
  const draftAnswers = input?.draftAnswers && typeof input.draftAnswers === "object" ? input.draftAnswers : {};
  const ctx = input?.context && typeof input.context === "object" ? input.context : {};
  const workspaceId = String(input?.workspaceId || ctx.workspaceId || "marqq-ws-1").trim();
  assertCanAfford(workspaceId, "gtm_interview");

  if (Array.isArray(question.fixedOptions) && question.fixedOptions.length === 4) {
    return question.fixedOptions.map((o, i) => ({
      value: String(o.value || `opt_${i + 1}`),
      label: String(o.label || o.value || `Option ${i + 1}`),
      recommended: Boolean(o.recommended),
    }));
  }

  const labelMax = optionLabelLimit(question.id);
  const system = `You generate exactly 4 multiple-choice options for a GTM interview question.
Return JSON only: {"options":[{"value":"short_slug","label":"Human-readable option text","recommended":true|false}]}
Rules:
- Exactly 4 options
- At most one recommended:true
- Ground every option in THIS company's niche, ICP, offer, and draft answers — never invent unrelated industry examples (e.g. clinic no-shows for a consulting firm)
- Labels max ${labelMax} characters
- value is a short slug; label is what the user reads
- No markdown
- CRITICAL: answer THIS question only
${questionOptionGuidance(question)}`;

  const user = JSON.stringify({
    question: question.question,
    helperText: question.helperText || "",
    questionId: question.id,
    draftAnswers,
    companyContext: {
      companyName: ctx.companyName || "",
      website: ctx.website || "",
      niche: ctx.niche || "",
      icp: ctx.icp || "",
      outcome: ctx.outcome || "",
      timeWindow: ctx.timeWindow || "",
      target: ctx.target || "",
      baseline: ctx.baseline || "",
      brandTagline: ctx.brandTagline || "",
      businessSummary: ctx.businessSummary || "",
      toneOfVoice: ctx.toneOfVoice || "",
    },
  });

  try {
    const raw = await callGroq(system, user, workspaceId);
    const parsed = parseJsonLoose(raw);
    const options = Array.isArray(parsed?.options) ? parsed.options : [];
    const cleaned = options
      .map((o, i) => ({
        value: String(o.value || `opt_${i + 1}`).slice(0, 80),
        label: String(o.label || o.value || `Option ${i + 1}`).slice(0, labelMax),
        recommended: Boolean(o.recommended),
      }))
      .filter((o) => o.label.trim());
    if (cleaned.length >= 4) {
      const four = cleaned.slice(0, 4);
      if (!four.some((o) => o.recommended)) four[0].recommended = true;
      else {
        let seen = false;
        for (const o of four) {
          if (o.recommended && seen) o.recommended = false;
          else if (o.recommended) seen = true;
        }
      }
      return four;
    }
  } catch (err) {
    console.warn("[gtm-interview-options]", err.message || err);
  }

  return contextualFallbacks(question, ctx, draftAnswers);
}
