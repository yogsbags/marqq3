/**
 * Marketing Ideas — execute Corey Haines marketing-ideas skill against locked GTM strategy.
 * Selects from the 139-idea catalog (cite ideaNumber). Does not invent a new ICP/strategy.
 */

import { resolveGroqModel, isCompoundModel } from "./groqReasoning.js";
import { buildPlaybookFromPack } from "./gtmStrategySkills.js";
import { meteredGroqJson, assertCanAfford } from "./credits/index.js";
import { getInjectableRulesBlock } from "./agentInstructions.js";

const MARKETING_IDEAS_PACK = {
  primary: ["marketing-ideas"],
  secondary: ["product-marketing-context", "launch-strategy"],
};

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

function strategyDigest(strategy = {}) {
  const ga = strategy.goalAlignment || {};
  const sections = Array.isArray(strategy.sections) ? strategy.sections : [];
  return {
    title: strategy.title || "",
    executiveSummary: strategy.executiveSummary || "",
    nextSteps: Array.isArray(strategy.nextSteps) ? strategy.nextSteps.slice(0, 5) : [],
    northStar: {
      metric: ga.north_star_metric || "",
      quantified_target: ga.quantified_target || "",
      timeline_target: ga.timeline_target || "",
      priority_90d: ga.priority_90d || "",
      channel_bet: ga.channel_bet || "",
      business_archetype: ga.business_archetype || "",
    },
    sectionTargets: Array.isArray(ga.sectionTargets)
      ? ga.sectionTargets.slice(0, 16).map((t) => ({
          sectionId: t.sectionId || t.id,
          metric: t.metric,
          contribution: t.contribution,
        }))
      : [],
    sections: sections.slice(0, 16).map((s) => ({
      id: s.id,
      title: s.title,
      summary: String(s.summary || "").slice(0, 280),
    })),
  };
}

function fallbackIdeas(ctx, company) {
  const target = ctx.northStar?.quantified_target || "the quantified GTM target";
  const timeline = ctx.northStar?.timeline_target || "90 days";
  const channel = ctx.northStar?.channel_bet || "the primary channel bet";
  return {
    scores: { fitScore: 62, actionability: 70, channelDiversity: 55 },
    summary: `Fallback ideas for ${company} toward ${target} within ${timeline} (model unavailable).`,
    stageFit: "growth",
    budgetBand: "low",
    northStar: {
      quantified_target: target,
      timeline_target: timeline,
    },
    ideas: [
      {
        ideaNumber: 28,
        name: "LinkedIn Ads",
        category: "Paid Advertising",
        priority: "high",
        whyItFits: `Direct demand toward ${target} on ${channel} with ICP-matched creative from the locked strategy.`,
        strategySectionId: "marketing_strategy",
        contributionToGoal: `Book qualified conversations that compound toward ${target}.`,
        hooks: [`${company}: strategy to execution in ${timeline}`, "Stop guessing GTM — run the plan"],
        angles: ["Outcome-led vs feature-led", "Founder POV vs category POV"],
        howToStart: [
          "Pull ICP + claim one-liner from Positioning",
          "Launch one narrow ABM set on the primary channel bet",
          "Kill if 0 discoveries in 14 days",
        ],
        expectedOutcome: `First measurable contribution to ${target} within ${timeline}`,
        resources: "Ads budget + creative from brand DNA",
        outcomeModule: "paid",
      },
      {
        ideaNumber: 47,
        name: "Founder-Led Sales Emails",
        category: "Email Marketing",
        priority: "high",
        whyItFits: "Services/consulting motions convert faster with founder voice than brand newsletters.",
        strategySectionId: "sales_strategy",
        contributionToGoal: "Warm intros → discoveries that feed the North Star.",
        hooks: ["Short founder note after a trigger", "Reference a locked strategy claim"],
        angles: ["Personal note", "Trigger-based outreach"],
        howToStart: [
          "Draft 3-touch founder sequence from Sales strategy objections",
          "Send to 20 warm ICP accounts this week",
          "Log replies into CRM",
        ],
        expectedOutcome: "3–5 replies / 20 sends in week 1",
        resources: "Founder time + CRM list",
        outcomeModule: "outreach",
      },
      {
        ideaNumber: 15,
        name: "Engineering as Marketing",
        category: "Free Tools & Engineering",
        priority: "medium",
        whyItFits: "A free diagnostic tied to the offer attracts ICP leads without redefining strategy.",
        strategySectionId: "product_strategy",
        contributionToGoal: "Inbound leads that convert into the quantified target.",
        hooks: ["Free GTM readiness check", "Score your pipeline gaps"],
        angles: ["Diagnostic quiz", "ROI-lite calculator"],
        howToStart: [
          "Ship a one-page diagnostic from Offer + ICP",
          "Gate results with email",
          "Route into nurture",
        ],
        expectedOutcome: "Lead magnet conversions feeding pipeline",
        resources: "Light build + landing page",
        outcomeModule: "leadmagnets",
      },
    ],
    hooksToTest: [
      { hook: `${company}: from strategy to booked pipeline`, why: "Outcome language matches North Star" },
      { hook: "Stop guessing GTM — run the locked plan", why: "Positions Marqq as operator" },
      { hook: `Hit ${target} without hiring a full GTM team`, why: "Resource-constrained buyers" },
      { hook: "Weekly plays scored against your North Star", why: "Control-loop differentiation" },
    ],
    anglesToTest: [
      { angle: "Operator vs advisor", framework: "Positioning", hypothesis: "Operator claim lifts reply rates" },
      { angle: "Trigger-based outreach", framework: "JTBD", hypothesis: "Trigger hooks beat generic intros" },
      { angle: "Proof before pitch", framework: "Trust", hypothesis: "Case/proof first increases discovery rate" },
    ],
    fallback: true,
  };
}

/**
 * @param {{ strategy?: object, companyName?: string, website?: string, niche?: string, icp?: string }} input
 */
export async function generateMarketingIdeas(input = {}) {
  const company = String(input.companyName || "Your company").trim();
  const workspaceId = String(input.workspaceId || input.companyId || "marqq-ws-1").trim();
  const digest = strategyDigest(input.strategy || {});
  const hasStrategy = Boolean(
    digest.executiveSummary ||
      digest.northStar.quantified_target ||
      digest.sections.length
  );

  const playbookResult = await buildPlaybookFromPack(MARKETING_IDEAS_PACK, {
    label: "marketing_ideas",
  }).catch(() => ({ playbook: "", loaded: false, skillIds: ["marketing-ideas"] }));

  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    const fb = fallbackIdeas(digest, company);
    return { ...fb, skillLoaded: Boolean(playbookResult.loaded), model: null, usedSearch: false };
  }

  assertCanAfford(workspaceId, "marketing_ideas");

  const neelRules = await getInjectableRulesBlock(workspaceId, "neel");
  const model = process.env.GROQ_MARKETING_IDEAS_MODEL || resolveGroqModel();
  const system = `You are Marqq executing the marketing-ideas skill for ${company}.

CRITICAL RULES:
- Select ONLY from the 139-idea catalog in the skill playbook. Cite ideaNumber (1-139) for every idea.
- Ground every idea in the LOCKED GTM strategy below. Do NOT invent a new ICP, positioning, channel mix, or vanity North Star.
- Prefer 3-5 ideas that best advance the quantified target within the timeline.
- Return STRICT JSON only (no markdown fences).

${playbookResult.playbook || "Use the standard marketing-ideas catalog (Content/SEO, Paid, Social, Email, Partnerships, Launches, PLG, etc.)."}

JSON schema:
{
  "scores": { "fitScore": number, "actionability": number, "channelDiversity": number },
  "summary": string,
  "stageFit": "pre-launch"|"early"|"growth"|"scale",
  "budgetBand": "free"|"low"|"medium"|"high",
  "northStar": { "quantified_target": string, "timeline_target": string },
  "ideas": [{
    "ideaNumber": number,
    "name": string,
    "category": string,
    "priority": "high"|"medium"|"low",
    "whyItFits": string,
    "strategySectionId": string,
    "contributionToGoal": string,
    "hooks": string[],
    "angles": string[],
    "howToStart": string[],
    "expectedOutcome": string,
    "resources": string,
    "outcomeModule": "paid"|"outreach"|"content"|"leadmagnets"|"campaigns"|"social"|"experiments"|"calendar"|"gtmwizard"
  }],
  "hooksToTest": [{ "hook": string, "why": string }],
  "anglesToTest": [{ "angle": string, "framework": string, "hypothesis": string }]
}${neelRules}`;

  const user = JSON.stringify(
    {
      company,
      website: input.website || null,
      niche: input.niche || null,
      icp: input.icp || null,
      hasLockedStrategy: hasStrategy,
      gtmStrategy: digest,
      instruction: hasStrategy
        ? "Execute marketing-ideas against this locked strategy. Cite ideaNumbers."
        : "Strategy is thin — still pick catalog ideas that fit company/ICP, note uncertainty in summary.",
    },
    null,
    2
  );

  try {
    const result = await meteredGroqJson({
      workspaceId,
      feature: "marketing_ideas",
      model,
      temperature: 0.45,
      max_tokens: 4096,
      json: !isCompoundModel(model),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      meta: { company },
      looseJson: true,
    });
    if (result.insufficientCredits) {
      const err = new Error("insufficient_credits");
      err.code = "insufficient_credits";
      err.status = 402;
      err.wallet = result.wallet;
      throw err;
    }
    if (!result.ok) throw new Error(result.error || "Groq failed");

    const parsed = result.json;
    const message = result.raw?.choices?.[0]?.message || {};
    const executedTools = message.executed_tools || result.raw?.executed_tools || [];
    const usedSearch = Array.isArray(executedTools)
      ? executedTools.some((t) => /search|browser|web/i.test(String(t?.type || t?.name || "")))
      : false;

    if (!parsed || !Array.isArray(parsed.ideas) || !parsed.ideas.length) {
      const fb = fallbackIdeas(digest, company);
      return {
        ...fb,
        skillLoaded: Boolean(playbookResult.loaded),
        model: result.model || model,
        usedSearch,
        warning: "Model returned incomplete ideas — used fallback catalog picks.",
        credits: result.credits,
      };
    }

    return {
      ok: true,
      scores: parsed.scores || {},
      summary: String(parsed.summary || "").trim(),
      stageFit: parsed.stageFit || null,
      budgetBand: parsed.budgetBand || null,
      northStar: parsed.northStar || digest.northStar,
      ideas: parsed.ideas.slice(0, 8),
      hooksToTest: Array.isArray(parsed.hooksToTest) ? parsed.hooksToTest.slice(0, 6) : [],
      anglesToTest: Array.isArray(parsed.anglesToTest) ? parsed.anglesToTest.slice(0, 6) : [],
      skillLoaded: Boolean(playbookResult.loaded),
      skillIds: playbookResult.skillIds || ["marketing-ideas"],
      model: result.model || model,
      usedSearch,
      credits: result.credits,
    };
  } catch (err) {
    if (err?.code === "insufficient_credits") throw err;
    console.warn("[marketing-ideas]", err.message);
    const fb = fallbackIdeas(digest, company);
    return {
      ...fb,
      skillLoaded: Boolean(playbookResult.loaded),
      model: null,
      usedSearch: false,
      warning: err.message,
    };
  }
}
