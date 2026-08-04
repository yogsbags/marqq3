/**
 * Generate one onboarding auto-section (Marqq2 /api/gtm/auto-sections/generate).
 * Uses skill playbooks + lane prompts from Marqq2.
 */

import {
  loadAutoSectionPlaybook,
  AUTO_SECTION_LANE_PROMPTS,
  LAST30_MARKET_ANALYSIS_GUIDE,
  GTM_AUTO_SECTION_DEFS,
} from "./gtmStrategySkills.js";
import {
  inferMotion,
  buildBriefQualityRules,
  marketConfusesSellerWithBuyer,
  salesLooksHollow,
  applyVoicePass,
  salesFallback,
  salesSaasFallback,
  marketAnalysisServicesFallback,
  marketingRecyclesDistribution,
  marketingServicesFallback,
  marketingSaasFallback,
  launchLooksWrongForServices,
  launchLooksHollow,
  launchServicesFallback,
  launchSaasFallback,
  timelineExceedsWindow,
  timelineLooksMeta,
  timelineServicesFallback,
  timelineSaasFallback,
  positioningLooksHollow,
  positioningServicesFallback,
  positioningSaasFallback,
  distributionLooksHollow,
  distributionServicesFallback,
  distributionSaasFallback,
  measurementLooksHollow,
  measurementServicesFallback,
  measurementSaasFallback,
  risksLookGeneric,
  risksServicesFallback,
  risksSaasFallback,
  inventsPaidBudgetOnZeroCash,
  looksAspirationalHollow,
} from "./gtmBriefQuality.js";
import { resolveGtmAutoSectionModel } from "./groqReasoning.js";
import { meteredGroqJson, assertCanAfford } from "./credits/index.js";

const MARKET_ANALYSIS_TACTICAL_RE =
  /\b(roi calculator|case[- ]study library|sales script|objection[- ]handling|landing page|webinar|outreach cadence|ad budget|linkedin ads|content calendar|pilot onboarding|equip the sales|create a rapid|launch a \d+-week)\b/i;

function looksTruncated(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (/[,:;–—\-]$/.test(t)) return true;
  if (/\b(a|an|the|and|or|to|for|with|of|as|create|clear)\s*$/i.test(t)) return true;
  if (t.length > 40 && !/[.!?]"?$/.test(t)) return true;
  return false;
}

function sectionBlobSafe(section) {
  return [section?.summary, ...(section?.bullets || []), section?.body].join(" ");
}

function marketAnalysisFallback(company, industry, icp, geoHint) {
  const who = icp || industry || "the stated ICP";
  const motion = inferMotion({ industry, icp });
  if (motion === "services_consulting") {
    return marketAnalysisServicesFallback(company, who);
  }
  return {
    id: "market_analysis",
    title: "Market analysis",
    channel: "",
    summary: `Marqq will start with ${who}${geoHint ? ` in ${geoHint}` : ""} first; expand only after reference proof lands.`,
    bullets: [
      `Starting market: concentrate on ${who} — highest fit with current offer and proof path.`,
      `Why now: prioritize accounts showing an active buying trigger (budget, stalled roadmap, or transformation mandate) over cold broad lists — conditional until proven.`,
      `Expand next: adjacent segment sharing the same buyer job after 2–3 early references.`,
      `Expand later: secondary geos or verticals only when first-market CAC/payback holds for 2 cycles.`,
      `Deprioritize: brand-name enterprise and low-budget tire-kickers until the first-market motion is repeatable.`,
    ],
    body: `Marqq will treat market analysis for ${company} as a sequencing decision, not a campaign brief. Start narrow with ${who}, prove message-market fit, then expand. Do not invent market surges. Channel tactics belong in later GTM sections.`,
    subsections: [],
  };
}

function genericFallback(def, company, site) {
  return {
    id: def.id,
    title: def.title,
    channel: "",
    summary: `Marqq will drive ${def.title.toLowerCase()} for ${company} from Brand DNA and the locked ICP.`,
    bullets: [
      `Marqq will focus ${def.title.toLowerCase()} on the primary customer segment and 90-day goal.`,
      "Marqq will prefer concrete decisions over generic frameworks.",
      "Marqq will call out one hard trade-off or deprioritization.",
      "Marqq will stay inside this section's lane — not steal later sections.",
    ],
    body: `Marqq will treat ${def.title.toLowerCase()} for ${company} as an editable recommendation grounded in Brand DNA${site ? ` (${site})` : ""}. Keep spend lean and defer low-ROI work until the first customer segment converts.`,
    subsections: [],
  };
}

async function callGroq(system, user, { temperature = 0.4, max_tokens = 2200, workspaceId = "marqq-ws-1" } = {}) {
  const key = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!key) return null;
  const model = resolveGtmAutoSectionModel();
  const result = await meteredGroqJson({
    workspaceId,
    feature: "gtm_auto_section",
    model,
    temperature,
    max_tokens: Math.min(max_tokens, 8192),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    meta: { feature: "gtm_auto_section" },
    looseJson: true,
  });
  if (result.insufficientCredits) {
    const err = new Error("insufficient_credits");
    err.code = "insufficient_credits";
    err.status = 402;
    err.wallet = result.wallet;
    err.estimatedCredits = result.estimatedCredits;
    throw err;
  }
  if (!result.ok) throw new Error(result.error || "Groq failed");
  const message = result.raw?.choices?.[0]?.message || {};
  const executedTools = message.executed_tools || result.raw?.executed_tools || [];
  const usedSearch = Array.isArray(executedTools)
    ? executedTools.some((t) => /search|browser/i.test(String(t?.type || t?.name || "")))
    : false;
  return {
    parsed: result.json,
    model: result.model || model,
    usedSearch,
    executedTools,
    credits: result.credits,
  };
}

/**
 * @param {object} body request body from POST /api/gtm/auto-sections/generate
 */
export async function generateAutoSection(body = {}) {
  const {
    sectionId,
    companyName,
    websiteUrl,
    industry,
    icp,
    brandDna,
    onboarding,
    priorSections,
    businessMotion: businessMotionOverride,
    workspaceId: workspaceIdIn,
  } = body;

  const workspaceId = String(workspaceIdIn || body.companyId || "marqq-ws-1").trim();
  assertCanAfford(workspaceId, "gtm_auto_section");

  const def = GTM_AUTO_SECTION_DEFS.find((s) => s.id === sectionId);
  if (!def) {
    const err = new Error(`Unknown auto section "${sectionId}"`);
    err.status = 400;
    err.allowed = GTM_AUTO_SECTION_DEFS.map((s) => s.id);
    throw err;
  }

  const company = String(companyName || brandDna?.companyName || "Company").trim();
  const site = String(websiteUrl || brandDna?.websiteUrl || "").trim();
  const prior = Array.isArray(priorSections) ? priorSections : [];
  const industryHint = String(industry || onboarding?.industry || "").trim();
  const icpHint = String(icp || onboarding?.icp || "").trim();
  const inferred = inferMotion({
    industry: industryHint,
    icp: icpHint,
    businessSummary: brandDna?.businessSummary || brandDna?.brandSummary || "",
  });
  const motion =
    businessMotionOverride === "saas_product" ||
    businessMotionOverride === "services_consulting"
      ? businessMotionOverride
      : inferred;
  const qualityRules = buildBriefQualityRules({
    company,
    industry: industryHint,
    icp: icpHint,
    motion,
  });

  const fallback =
    def.id === "market_analysis"
      ? marketAnalysisFallback(company, industryHint, icpHint, null)
      : def.id === "sales_strategy"
        ? salesFallback(
            company,
            icpHint,
            onboarding?.quantifiedTarget || onboarding?.goals || ""
          )
        : genericFallback(def, company, site);

  const skillResult = await loadAutoSectionPlaybook(def.id);
  const skillPlaybook = skillResult.playbook || "";
  const supplementalSkillBlock =
    def.id === "market_analysis" ? LAST30_MARKET_ANALYSIS_GUIDE : "";
  const lanePrompt = AUTO_SECTION_LANE_PROMPTS[def.id] || "";
  const isMarket = def.id === "market_analysis";

  const voiceNotes = Array.isArray(brandDna?.voiceNotes)
    ? brandDna.voiceNotes
        .map((n) => String(n?.transcript || "").trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];
  if (!voiceNotes.length && brandDna?.voiceTranscript) {
    voiceNotes.push(String(brandDna.voiceTranscript).slice(0, 1200));
  }

  let groqResult;
  try {
    groqResult = await callGroq(
      `You are a senior GTM strategist writing an EXECUTABLE operating plan that Marqq agents will run next week.

WEB RESEARCH (required when a websiteUrl is provided):
- Use built-in web search on the company website and credible company pages (LinkedIn/About) BEFORE writing.
- Ground geography, buyers, offerings, and timing in what you find. Do NOT invent NA/EU starting markets, revenue bands, or headcount if evidence points elsewhere (e.g. India/.in domains).
- If search is thin, stay conditional and say so — never fabricate market surges or firmographics.
- Plain language: use "Starting market" (who to win first). Never say "beachhead".

Return STRICT JSON only:
{
  "id": "${def.id}",
  "title": "${def.title}",
  "summary": "1-2 COMPLETE sentences starting with 'Marqq will…' (must end with a period)",
  "bullets": ["4-6 bullets for THIS section's lane only — each with a deliverable, cadence, SLA, or kill rule"],
  "body": "4-7 COMPLETE sentences in Marqq-will voice (must end with a period)",
  "subsections": [{ "title": string, "body": string, "bullets": string[] }]
}
Include 2-3 short subsections when helpful. No Slack #channel headers.
CRITICAL: Never truncate mid-sentence. Finish every string with proper punctuation.
CRITICAL: This is not a consulting memo. Forbidden hollow bullets: develop UVP, create messaging, emphasize expertise, leverage thought leadership, explore channels — unless paired with the actual artifact text or weekly numbers.

${skillPlaybook || ""}
${supplementalSkillBlock || ""}

${lanePrompt}

${qualityRules}

Global rules:
- Editable recommendation — specific, with tradeoffs. No questions to the user.
- Stay consistent with prior approved sections (summaries only — do not copy their plays).
- If context is thin, stay conditional rather than asserting certainty.`,
      JSON.stringify(
        {
          sectionId: def.id,
          sectionTitle: def.title,
          company,
          websiteUrl: site || null,
          searchHint: site
            ? `Web-search "${site}" and the company name "${company}" first; align starting-market geo and ICP with evidence.`
            : `Web-search "${company}" before drafting.`,
          industry: industryHint || null,
          icp: icpHint || null,
          businessMotion: motion,
          buyerReminder: `${company} sells to: ${icpHint || "locked ICP"}. Starting market = buyers, not peer firms in "${industryHint}".`,
          onboarding: onboarding || null,
          brandDna: brandDna
            ? {
                companyName: brandDna.companyName,
                websiteUrl: brandDna.websiteUrl,
                brandTagline: brandDna.brandTagline,
                businessSummary: brandDna.businessSummary || brandDna.brandSummary,
                toneOfVoice: brandDna.toneOfVoice,
                colors: brandDna.colors,
                fonts: brandDna.fonts,
                voiceNoteTranscripts: voiceNotes,
              }
            : null,
          skillTaskKey: skillResult.skillTaskKey,
          skillIds: skillResult.skillIds,
          priorApprovedSections: prior.map((s) => ({
            id: s.id,
            title: s.title,
            summary: s.summary,
            // summaries only — reduce cross-section copy
          })),
        },
        null,
        2
      ).slice(0, 18000),
      { temperature: isMarket ? 0.25 : 0.35, max_tokens: isMarket ? 4096 : 3200, workspaceId }
    );
  } catch (err) {
    if (err?.code === "insufficient_credits" || err?.status === 402) throw err;
    console.warn("[auto-sections] groq failed:", err.message);
    return {
      section: fallback,
      model: null,
      skillIds: skillResult.skillIds,
      warning: err.message,
    };
  }

  if (!groqResult?.parsed) {
    return {
      section: fallback,
      model: groqResult?.model || null,
      skillIds: skillResult.skillIds,
    };
  }

  const parsed = groqResult.parsed;
  const subsections = (Array.isArray(parsed?.subsections) ? parsed.subsections : [])
    .map((sub) => ({
      title: String(sub?.title || "").trim(),
      body: String(sub?.body || "").trim(),
      bullets: (Array.isArray(sub?.bullets) ? sub.bullets : [])
        .map((b) => String(b || "").trim())
        .filter(Boolean)
        .slice(0, 6),
    }))
    .filter((sub) => sub.title || sub.body);

  let section = {
    id: def.id,
    title: String(parsed?.title || def.title).trim() || def.title,
    channel: "",
    summary: String(parsed?.summary || fallback.summary).trim(),
    bullets: (Array.isArray(parsed?.bullets) ? parsed.bullets : fallback.bullets)
      .map((b) => String(b || "").trim())
      .filter(Boolean)
      .slice(0, 8),
    body: String(parsed?.body || fallback.body).trim(),
    subsections,
  };

  if (!section.summary || !section.bullets.length) {
    return {
      section: fallback,
      model: groqResult.model,
      skillIds: skillResult.skillIds,
    };
  }

  if (isMarket) {
    const tacticalHits = section.bullets.filter((b) => MARKET_ANALYSIS_TACTICAL_RE.test(b)).length;
    const truncated =
      looksTruncated(section.summary) ||
      looksTruncated(section.body) ||
      section.bullets.some((b) => looksTruncated(b) && String(b).length > 20);
    const sellerBuyerMix = marketConfusesSellerWithBuyer(section, {
      industry: industryHint,
      icp: icpHint,
      company,
    });
    if (tacticalHits >= 2 || truncated || sellerBuyerMix) {
      console.warn(
        `[auto-sections] market_analysis rejected (tactical=${tacticalHits}, truncated=${truncated}, sellerBuyerMix=${sellerBuyerMix})`
      );
      section = {
        ...marketAnalysisFallback(company, industryHint, icpHint, null),
        subsections: section.subsections?.length ? section.subsections : [],
      };
    }
  }

  if (def.id === "sales_strategy" && (salesLooksHollow(section) || looksAspirationalHollow(section))) {
    console.warn(`[auto-sections] sales_strategy hollow — using ${motion} fallback`);
    section =
      motion === "saas_product"
        ? salesSaasFallback(company, icpHint, onboarding?.quantifiedTarget || onboarding?.goals || "")
        : salesFallback(company, icpHint, onboarding?.quantifiedTarget || onboarding?.goals || "");
  }

  if (def.id === "positioning_messaging" && positioningLooksHollow(section)) {
    console.warn(`[auto-sections] positioning hollow — using ${motion} fallback`);
    section =
      motion === "saas_product"
        ? positioningSaasFallback(company, icpHint, brandDna?.brandTagline || "")
        : positioningServicesFallback(company, icpHint, brandDna?.brandTagline || "");
  }

  if (
    def.id === "distribution_channels" &&
    (distributionLooksHollow(section) || inventsPaidBudgetOnZeroCash(section, onboarding))
  ) {
    console.warn(`[auto-sections] distribution hollow/$ — using ${motion} fallback`);
    section =
      motion === "saas_product"
        ? distributionSaasFallback(
            company,
            icpHint,
            onboarding?.quantifiedTarget || onboarding?.goals || ""
          )
        : distributionServicesFallback(
            company,
            icpHint,
            onboarding?.quantifiedTarget || onboarding?.goals || ""
          );
  }

  if (
    def.id === "marketing_strategy" &&
    (marketingRecyclesDistribution(section, prior) ||
      inventsPaidBudgetOnZeroCash(section, onboarding) ||
      looksAspirationalHollow(section))
  ) {
    console.warn(`[auto-sections] marketing weak/recycles/$ — using ${motion} fallback`);
    section =
      motion === "saas_product"
        ? marketingSaasFallback(
            company,
            icpHint,
            onboarding?.quantifiedTarget || onboarding?.goals || ""
          )
        : marketingServicesFallback(
            company,
            icpHint,
            onboarding?.quantifiedTarget || onboarding?.goals || ""
          );
  }

  if (def.id === "launch_plan") {
    const needsLaunchFix =
      launchLooksHollow(section) ||
      (motion === "services_consulting" && launchLooksWrongForServices(section)) ||
      (motion === "saas_product" &&
        /\bno consumer app-store|services launch|warm outreach to the starting market|discovery sla\b/i.test(
          sectionBlobSafe(section)
        ));
    if (needsLaunchFix) {
      console.warn(`[auto-sections] launch hollow/wrong — using ${motion} fallback`);
      section =
        motion === "saas_product"
          ? launchSaasFallback(
              company,
              icpHint,
              onboarding?.quantifiedTarget || onboarding?.goals || ""
            )
          : launchServicesFallback(
              company,
              icpHint,
              onboarding?.quantifiedTarget || onboarding?.goals || ""
            );
    }
  }

  if (def.id === "measurement_optimization" && measurementLooksHollow(section)) {
    console.warn(`[auto-sections] measurement hollow — using ${motion} fallback`);
    section =
      motion === "saas_product"
        ? measurementSaasFallback(company, onboarding?.quantifiedTarget || onboarding?.goals || "")
        : measurementServicesFallback(
            company,
            onboarding?.quantifiedTarget || onboarding?.goals || ""
          );
  }

  if (def.id === "risks_contingencies" && risksLookGeneric(section)) {
    console.warn(`[auto-sections] risks generic — using ${motion} fallback`);
    section =
      motion === "saas_product"
        ? risksSaasFallback(company, onboarding?.quantifiedTarget || onboarding?.goals || "")
        : risksServicesFallback(company, onboarding?.quantifiedTarget || onboarding?.goals || "");
  }

  if (
    def.id === "timeline_roadmap" &&
    (timelineExceedsWindow(section, onboarding?.timelineTarget || "90 days") ||
      timelineLooksMeta(section) ||
      inventsPaidBudgetOnZeroCash(section, onboarding) ||
      (motion === "saas_product" &&
        /\bdiscovery sla|warm-intro asks|qualified leads\/month\b/i.test(sectionBlobSafe(section))))
  ) {
    console.warn(`[auto-sections] timeline exceeded/meta/$ — using ${motion} fallback`);
    section =
      motion === "saas_product"
        ? timelineSaasFallback(
            company,
            icpHint,
            onboarding?.quantifiedTarget || onboarding?.goals || ""
          )
        : timelineServicesFallback(
            company,
            icpHint,
            onboarding?.quantifiedTarget || onboarding?.goals || ""
          );
  }

  section = applyVoicePass(section, company);

  return {
    section,
    model: groqResult.model,
    skillIds: skillResult.skillIds,
    skillLoaded: skillResult.loaded,
    businessMotion: motion,
    usedSearch: Boolean(groqResult.usedSearch),
  };
}
