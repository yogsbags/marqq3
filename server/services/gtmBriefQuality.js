/**
 * Shared quality rules + detectors for GTM brief generation.
 */

export function inferMotion({ industry = "", icp = "", businessSummary = "" } = {}) {
  const blob = `${industry} ${icp} ${businessSummary}`.toLowerCase();
  // Services first: agencies/dev shops sell apps-as-service, not a consumer product
  if (
    /\b(consult|advisory|agency|services|strategy-to-execution|management strategy|app development|custom development|software development services|client projects?)\b/.test(
      blob
    )
  ) {
    return "services_consulting";
  }
  if (
    /\b(saas|software|platform|subscription|product-led|plg|consumer (?:health|app)|nutrition app|lab-personalized|food scan|mobile app|matchmaking|private capital)\b/.test(
      blob
    )
  ) {
    return "saas_product";
  }
  if (/\bnutrition\b/.test(blob) && /\bapp\b/.test(blob)) return "saas_product";
  // Bare "app" alone is ambiguous — prefer unknown over wrong SaaS
  if (/\bapp\b/.test(blob) && /\b(users?|subscribers?|download|install|trial|meal)\b/.test(blob)) {
    return "saas_product";
  }
  return "unknown";
}

/** Injected at END of system prompts so it overrides long skill playbooks. */
export function buildBriefQualityRules({ company, industry, icp, motion }) {
  const motionBlock =
    motion === "services_consulting"
      ? `BUSINESS MOTION = services / consulting:
- Buyers hire ${company} for expertise and delivery — they are NOT "${industry}" peer companies unless ICP explicitly says so.
- Sales = discovery → proposal → close with objections/SLA — not product demos.
- Customer success = engagement kickoff → first value milestone → retainer/expansion — NOT SaaS activation/health scores unless a product is explicit in context.
- Prefer LinkedIn + referrals + thought leadership over broad paid social when budget is thin/zero.`
      : motion === "saas_product"
        ? `BUSINESS MOTION = SaaS / product: activation, time-to-value, and product-led loops are appropriate in CS.`
        : `BUSINESS MOTION unclear — stay conditional; do not assume SaaS activation or peer-industry starting markets.`;

  return `## CRITICAL QUALITY OVERRIDES (beat skill playbooks when they conflict)

BUYER vs SELLER (never confuse):
- ${company} SELLS: ${industry || "its offer"}.
- Starting market / ICP = who BUYS from ${company}: ${icp || "(use stated ICP)"}.
- NEVER set starting market to companies that merely operate in the same service category as ${company} (e.g. a digital-transformation consultancy's starting market is mid-market leaders needing transformation — NOT "digital transformation companies").

NO INVENTED MARKET EVENTS:
- Do NOT invent funding waves, partnership surges, "recent demand spikes", logos, metrics, headcount bands, revenue bands, or geo proof not present in Brand DNA / onboarding / site signals.
- If timing is thin, use conditional buyer triggers (board mandate, stalled roadmap, new CXO, budget cycle) and label as "likely" / "test first".

EXECUTABLE BY MARQQ (this is an operating plan, not a consulting memo):
- Write as if Marqq agents will run this next week — every bullet needs a shippable artifact, cadence, owner (Marqq), or kill rule.
- Prefer verbs like: ship, publish, book, outreach, instrument, scorecard, kill, gate, assign, run weekly.
- FORBIDDEN hollow verbs as the whole bullet: "develop a UVP", "create messaging", "emphasize expertise", "leverage thought leadership", "explore channels", "focus on growth" with no deliverable.
- Include at least one explicit timebox (week N, 48h SLA, fortnightly, weekly Mon review) in every section.
- Include at least one kill / deprioritize rule tied to a measurable trigger.

VOICE:
- Actionable lines start with "Marqq will…" — never "${company} should…" / "${company} aims to…" as the operator voice.
- ${company} is the client; Marqq is the operating system writing and executing the brief.

ANTI-GENERIC:
- Do not recycle the same LinkedIn/Twitter/Google Ads/influencer paragraph across sections.
- Each section must add NEW decisions for ITS lane only.
- Include at least one explicit deprioritization.

${motionBlock}`;
}

export function marketConfusesSellerWithBuyer(section, { industry, icp, company }) {
  const blob = [
    section?.summary,
    ...(section?.bullets || []),
    section?.body,
  ]
    .join(" ")
    .toLowerCase();

  const consulting = /\b(consult|strateg|advisor|services|transformation)\w*/i.test(
    `${industry} ${icp}`
  );
  if (!consulting) return false;

  // Peer-as-buyer patterns (seller category treated as starting-market firms)
  const peerAsBuyer =
    /\b(ai and digital transformation companies|digital transformation companies|management consulting companies|strategy consulting firms|ai (?:saas )?companies in the|companies in the ai and digital)\b/i.test(
      blob
    );

  const beachhead = (section?.bullets || []).find((b) => /beachhead|starting market|first focus|primary (?:customer )?segment/i.test(String(b))) || "";
  const beachheadUsesIcp =
    /\b(mid-market|growth-stage|leaders|seeking|buyers|clients|accounts)\b/i.test(beachhead);

  // Invented surge
  const inventedSurge =
    /\b(recent (?:surge|funding|wave)|surge in demand|recent funding and partnerships)\b/i.test(blob);

  // Invented firmographics not grounded in context
  const inventedBands =
    /\$\d+\s*[-–]\s*\$?\d+\s*million|\d+\s*[-–]\s*\d+\s*employees/i.test(blob);

  return peerAsBuyer || inventedSurge || inventedBands || (Boolean(beachhead) && !beachheadUsesIcp);
}

export function timelineExceedsWindow(section, windowLabel = "90 days") {
  const blob = [section?.summary, ...(section?.bullets || []), section?.body].join(" ");
  const weekNums = [...blob.matchAll(/week[s]?\s*(\d+)\s*[-–—]?\s*(\d+)?/gi)].flatMap((m) =>
    [m[1], m[2]].filter(Boolean).map(Number)
  );
  const maxWeek = weekNums.length ? Math.max(...weekNums) : 0;
  if (/90\s*day/i.test(windowLabel) && maxWeek > 14) return true;
  return false;
}

export function timelineServicesFallback(company, icp, quantified) {
  const who = icp || "the primary customer segment";
  return {
    id: "timeline_roadmap",
    title: "Timeline & roadmap",
    channel: "",
    summary: `Marqq will execute a 12-week operating plan for ${company} to reach ${quantified || "the quantified target"} with ${who} — each fortnight has one primary outcome Marqq owns.`,
    bullets: [
      "Weeks 1–2: Marqq ships ICP account list (50), offer one-pager, LinkedIn presence, UTM + CRM stages",
      "Weeks 3–4: Marqq publishes 2 proof posts/week + 10 warm-intro asks/week; discovery SLA live (48h)",
      "Weeks 5–8: Marqq doubles converting conversations; kills any play with 0 discoveries in 14 days",
      "Weeks 9–12: Marqq locks 2 reference-ready engagements and optimizes toward 5 qualified leads/month",
      "Deprioritize: any work that does not create a booked discovery this quarter",
    ],
    body: `Marqq will keep the roadmap inside 90 days. This is not a list of strategy section names — each fortnight ends with a shippable artifact or a kill decision tied to ${quantified || "the North Star"}.`,
    subsections: [
      {
        title: "Fortnight outcomes",
        body: "Marqq will review one primary outcome every two weeks.",
        bullets: ["ICP + offer live", "Outreach cadence live", "Conversion focus", "Reference proof"],
      },
    ],
  };
}

/** Timeline that only lists strategy section names (not executable work). */
export function timelineLooksMeta(section) {
  const blob = sectionBlob(section);
  const metaHits = (
    blob.match(
      /\b(market analysis|positioning(?:\s*&\s*messaging)?|distribution channels|marketing strategy|sales strategy|launch plan|measurement(?:\s*&\s*optimization)?|product marketing context|demand narrative)\b/gi
    ) || []
  ).length;
  const hasShippables = /\b(icp (?:account )?list|offer one-pager|warm[- ]?(?:intro|ask)|discovery (?:sla|call)|posts? per week|\d+\s+posts?\/week)\b/.test(
    blob
  );
  return !hasShippables || metaHits >= 2;
}

const CHANNEL_PHRASES = [
  "linkedin",
  "referral",
  "google ads",
  "industry events",
  "podcast",
  "thought leadership",
  "warm intro",
];

function sectionBlob(section) {
  return [section?.summary, ...(section?.bullets || []), section?.body].join(" ").toLowerCase();
}

function channelHits(blob) {
  return CHANNEL_PHRASES.filter((p) => blob.includes(p));
}

/** Marketing that only restates the distribution channel list. */
export function marketingRecyclesDistribution(section, priorSections = []) {
  const marketing = sectionBlob(section);
  const dist = (priorSections || []).find((s) => s.id === "distribution_channels");
  const distBlob = dist ? sectionBlob(dist) : "";

  const mChannels = channelHits(marketing);
  const dChannels = channelHits(distBlob);
  const overlap = mChannels.filter((c) => dChannels.includes(c));

  const hasStrongSpine =
    /\b(campaign spine|offer|narrative|experiment|content pillar|lead magnet|webinar series|case study|proof (?:series|asset)|message angle|kill (?:the loser|rules)|diagnostic|scoped pilot)\b/.test(
      marketing
    );
  // "thought leadership campaign" alone is too weak if channels are copy-pasted
  const weakCampaignOnly =
    /\bcampaign\b/.test(marketing) && !hasStrongSpine;

  // Overlaps distribution channels heavily without a distinct offer/experiment spine
  if (overlap.length >= 3 && !hasStrongSpine) return true;

  // Marketing reads as a channel list even without prior distribution
  if (mChannels.length >= 3 && (!hasStrongSpine || weakCampaignOnly)) return true;

  return false;
}

export function marketingServicesFallback(company, icp, quantified) {
  const who = icp || "the primary customer segment";
  return {
    id: "marketing_strategy",
    title: "Marketing strategy",
    channel: "",
    summary: `Marqq will run one demand campaign for ${company} aimed at ${who}, centered on a strategy-to-execution offer that drives ${quantified || "qualified conversations"} — not a restated channel list.`,
    bullets: [
      "Campaign spine: 'Strategy Meets Execution' proof series — problem → approach → outcome for primary buyers",
      "Offer: diagnostic / scoped pilot conversation (not a free unlimited audit)",
      "Narrative: stalled transformation or growth mandate → partner bridges strategy to delivery",
      "Experiments: 2 message angles per fortnight (trigger vs outcome); kill the loser after 2 cycles",
      "Deprioritize: multi-channel spray, paid social without a tracked offer, and content that does not create a discovery ask",
    ],
    body: `Marqq will treat marketing for ${company} as a single campaign spine with a concrete offer and weekly experiments toward ${quantified || "the North Star"}. Channel mix lives in Distribution; Marketing decides the story, offer, and test cadence.`,
    subsections: [
      {
        title: "Campaign spine",
        body: "Marqq will keep one narrative and one primary CTA for 90 days.",
        bullets: ["Proof series", "Pilot conversation CTA"],
      },
      {
        title: "Experiments",
        body: "Marqq will run fortnightly message tests and cut losers fast.",
        bullets: ["Trigger angle", "Outcome angle"],
      },
    ],
  };
}

/** Thin launch with no pre/launch/post milestones. */
export function launchLooksHollow(section) {
  const blob = sectionBlob(section);
  const hasPhases =
    /\b(pre-?launch|post-?launch|week[s]?\s*\d|phase|milestone)\b/.test(blob) &&
    /\b(wk|week|day)\b/.test(blob);
  const genericOnly =
    /\b(phased launch strategy|drive traffic and generate leads|clear goals and timelines)\b/.test(
      blob
    );
  return genericOnly || !hasPhases;
}

/** Product Hunt / consumer big-bang launch is wrong for consulting/services. */
export function launchLooksWrongForServices(section) {
  const blob = sectionBlob(section);
  if (/\bproduct\s*hunt\b/.test(blob)) return true;
  if (/\b(app\s*store|play\s*store|consumer\s+launch|viral\s+launch)\b/.test(blob)) return true;
  const consumerHits = [
    "influencer blasts",
    "unpaid influencers",
    "waitlist",
    "beta users",
    "signup funnel",
  ].filter((k) => blob.includes(k)).length;
  const servicesHits = [
    "thought-leadership",
    "thought leadership",
    "warm outreach",
    "referral",
    "discovery",
    "proposal",
    "engagement",
    "starting market",
  ].filter((k) => blob.includes(k)).length;
  // Consumer-shaped without services motion cues
  if (consumerHits >= 2 && servicesHits < 2) return true;
  return false;
}

export function launchServicesFallback(company, icp, quantified) {
  const who = icp || "the primary customer segment";
  return {
    id: "launch_plan",
    title: "Launch plan",
    channel: "",
    summary: `Marqq will run a 90-day services launch for ${company} aimed at ${who}, toward ${quantified || "the quantified target"} — no consumer app-store launch motion.`,
    bullets: [
      "Pre-launch (wk 1–2): ICP list, offer one-pager, tracking, LinkedIn presence",
      "Launch (wk 3–6): thought-leadership + warm outreach on the starting market; weekly creative/message tests",
      "Post-launch (wk 7–12): double down on conversations that convert; cut dead plays in 2 cycles",
      "Proof path: 2–3 reference-ready engagements before broadening geos",
      "Deprioritize: consumer launch directories, broad influencer blasts, and untargeted paid social",
    ],
    body: `Marqq will ship a thin, measurable services launch for ${company}. Success is learning speed toward ${quantified || "the goal"} with qualified conversations — not a big-bang consumer launch.`,
    subsections: [
      {
        title: "Pre-launch",
        body: "Marqq will lock ICP list, offer packaging, and instrumentation.",
        bullets: ["ICP account list", "Offer one-pager", "UTM + CRM stages"],
      },
      {
        title: "Launch window",
        body: "Marqq will concentrate LinkedIn + referrals + outreach.",
        bullets: ["Weekly message tests", "Warm intro cadence", "Discovery SLA"],
      },
    ],
  };
}

export function csLooksTooSaasForServices(section) {
  const blob = [section?.summary, ...(section?.bullets || []), section?.body].join(" ").toLowerCase();
  const saasHits = ["health score", "health scorecard", "activation", "product onboarding"].filter((k) =>
    blob.includes(k)
  ).length;
  const servicesHits = ["kickoff", "first value", "engagement", "retainer", "milestone", "sow"].filter((k) =>
    blob.includes(k)
  ).length;
  return saasHits >= 2 && servicesHits < 2;
}

export function salesLooksHollow(section) {
  const blob = sectionBlob(section);
  const hasProcess = /\b(qualif|sla|objection|discovery|proposal|tat|stage|handoff|pipeline)\b/.test(
    blob
  );
  const onlyMessaging =
    /\b(unique value proposition|key messaging|icp alignment|sales deck|one-liner offer)\b/.test(
      blob
    ) && !/\bobjection\b/.test(blob);
  const stealsChannels =
    channelHits(blob).length >= 1 &&
    /\b(\d+\s+posts?|warm asks?|linkedin posts?|publish \d+)\b/.test(blob);
  const inventsSurge = /\b(recent funding|partnership surges|funding waves)\b/.test(blob);
  return onlyMessaging || !hasProcess || stealsChannels || inventsSurge;
}

export function rewriteElevateVoice(text, company) {
  const name = String(company || "").trim();
  if (!name || !text) return text;
  let out = String(text);
  const reShould = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")} should\\b`, "gi");
  const reAims = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")} aims to\\b`, "gi");
  const reWill = new RegExp(`^${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")} will\\b`, "i");
  out = out.replace(reShould, "Marqq will");
  out = out.replace(reAims, "Marqq will");
  if (reWill.test(out.trim())) {
    out = out.replace(reWill, "Marqq will");
  }
  out = out.replace(/\bThe Elevate\b/g, "Elevate");
  return out;
}

export function applyVoicePass(section, company) {
  if (!section) return section;
  return {
    ...section,
    summary: rewriteElevateVoice(section.summary, company),
    body: rewriteElevateVoice(section.body, company),
    bullets: (section.bullets || []).map((b) => rewriteElevateVoice(b, company)),
    subsections: (section.subsections || []).map((s) => ({
      ...s,
      title: s.title,
      body: rewriteElevateVoice(s.body, company),
      bullets: (s.bullets || []).map((b) => rewriteElevateVoice(b, company)),
    })),
  };
}

export function salesFallback(company, icp, quantified) {
  const who = icp || "the stated ICP";
  return {
    id: "sales_strategy",
    title: "Sales strategy",
    channel: "",
    summary: `Marqq will run a consultative sales motion for ${company} against ${who}, with clear qualification, discovery SLA, and objection handling toward ${quantified || "the quantified target"}.`,
    bullets: [
      `Qualify: fit to ${who} + active buying trigger (budget owner, timeline, transformation mandate)`,
      "Discovery SLA: first discovery call within 48h of inbound / warm intro",
      "Stages: discovery → problem framing → proposal → commercial close",
      "Objections: price vs DIY/internal team, unclear ROI, timing — counter with scoped pilots and reference proof",
      "Deprioritize: tire-kickers with no budget owner or timeline",
    ],
    body: `Marqq will not treat sales as restated messaging. For ${company}, Marqq will enforce qualification and TAT so conversion rate — not just lead volume — moves the North Star.`,
    subsections: [
      {
        title: "Qualification & SLA",
        body: "Marqq will gate pipeline on ICP fit and buying trigger.",
        bullets: ["Budget owner named", "Timeline in 90 days", "Problem urgency scored"],
      },
      {
        title: "Objection handling",
        body: "Marqq will maintain a living objection → counter map for discovery.",
        bullets: ["DIY / internal team", "Price without pilot", "Wait for next FY"],
      },
    ],
  };
}

export function marketAnalysisServicesFallback(company, icp) {
  const who = icp || "growth-stage and mid-market leaders seeking strategy-to-execution partners";
  return {
    id: "market_analysis",
    title: "Market analysis",
    channel: "",
    summary: `Marqq will start with ${who} first; expand only after 2–3 reference engagements prove the motion.`,
    bullets: [
      `Starting market: ${who} — buyers of consulting/strategy execution, not peer consultancies.`,
      "Why now: prioritize accounts with an active trigger (new CXO, stalled transformation, board growth mandate, or failed internal initiative) — labeled conditional until proven.",
      "Expand next: adjacent buyer segment sharing the same job-to-be-done after first-market references land.",
      "Expand later: broader geos or enterprise only when first-market win rate and delivery capacity hold for 2 cycles.",
      "Deprioritize: micro-startups without budget owners, and pure product vendors seeking white-label resellers until the core advisory motion is repeatable.",
    ],
    body: `Marqq will treat market analysis for ${company} as a buyer-sequencing decision. The starting market is who hires ${company}, grounded in the locked ICP. Marqq will not invent funding surges, headcount bands, or peer-industry starting markets. Channel tactics belong in later sections.`,
    subsections: [
      {
        title: "Starting market",
        body: `Marqq will concentrate on ${who}.`,
        bullets: ["Buyer job: strategy-to-execution", "Geo: start where proof is easiest"],
      },
      {
        title: "Deprioritize",
        body: "Marqq will skip low-budget accounts until the starting market converts.",
        bullets: ["No budget owner", "No timeline", "Peer agencies as 'buyers'"],
      },
    ],
  };
}

const ASPIRATIONAL_RE =
  /\b(develop (?:a |an )?(?:unique )?value proposition|create messaging|emphasize(?:\s+\w+){0,4}|leverage (?:thought leadership|expertise)|highlight(?:\s+\w+){0,6}|explore (?:channels|partnerships)|focus on (?:driving|growth|efficient)|establish itself|utilize)\b/gi;

const EXECUTABLE_RE =
  /\b(week|wk\s*\d|sla|48h|cadence|kill|owner|checklist|fortnight|ship|publish|book|outreach|scorecard|instrument|utm|crm|deliverable|every (?:mon|week)|warm intro|discovery)\b/gi;

/** Consulting-memo language without shippable Marqq work. */
export function looksAspirationalHollow(section) {
  const blob = sectionBlob(section);
  const aspHits = (blob.match(ASPIRATIONAL_RE) || []).length;
  const execHits = (blob.match(EXECUTABLE_RE) || []).length;
  return aspHits >= 2 && execHits < 2;
}

export function positioningLooksHollow(section) {
  const blob = sectionBlob(section);
  const hasClaim =
    /\b(claim|hook|proof|counter|vs\.|versus|differentiator|one-liner|tagline)\b/.test(blob);
  return looksAspirationalHollow(section) || !hasClaim;
}

export function positioningServicesFallback(company, icp, tagline) {
  const who = icp || "the primary customer segment";
  const line = tagline || "Strategy Meets Execution";
  return {
    id: "positioning_messaging",
    title: "Positioning & messaging",
    channel: "",
    summary: `Marqq will lock ${company}'s buyer-facing claim as "${line}" for ${who}, with one hook, one proof hierarchy, and one competitive counter Marqq agents reuse weekly.`,
    bullets: [
      `Claim: "${line}" — ${company} stays until the roadmap ships, not just the slide deck`,
      "Hook (LinkedIn/outreach opener): Stalled transformation or growth mandate? Marqq books a scoped pilot conversation.",
      "Proof hierarchy: engagement outcomes → method → logos (only when real; never invent)",
      "Competitive counter: vs strategy-only firms (no execution) and vs tech vendors (no strategy bridge)",
      "Deprioritize: feature laundry lists and peer-consultancy comparisons",
    ],
    body: `Marqq will treat positioning as reusable copy assets, not a memo. Agents will paste the claim, hook, and counter into outreach and posts. No new UVP essays without a shippable one-liner.`,
    subsections: [
      {
        title: "Assets Marqq ships week 1",
        body: "Marqq will publish claim + hook + counter as a one-pager.",
        bullets: ["Claim line", "Hook opener", "Objection counter"],
      },
    ],
  };
}

export function distributionLooksHollow(section) {
  const blob = sectionBlob(section);
  const hasCadence = /\b(\d+\s*[×x]\/week|per week|weekly|10 warm|cadence|kill)\b/.test(blob);
  return looksAspirationalHollow(section) || (!hasCadence && channelHits(blob).length >= 2);
}

export function distributionServicesFallback(company, icp, quantified) {
  const who = icp || "the primary customer segment";
  return {
    id: "distribution_channels",
    title: "Distribution & channels",
    channel: "",
    summary: `Marqq will run LinkedIn + warm referrals as the primary GTM motion for ${company} against ${who}, with fixed weekly cadences toward ${quantified || "qualified leads"}.`,
    bullets: [
      "Primary: LinkedIn — Marqq publishes 3 posts/week + runs 10 warm-intro / connection asks/week",
      "Primary support: referral asks — Marqq scripts and sends 5 partner/alumni asks/week",
      "Secondary (hours permitting): Google search ads only on high-intent strategy/transformation queries with tracked landing CTA",
      "Kill rule: pause any paid test with 0 booked discoveries in 14 days",
      "Deprioritize: broad Meta/Twitter spray, untargeted influencer blasts, cold event booths",
    ],
    body: `Marqq will treat distribution as a capacity plan. Agents own the weekly cadence. Channels without a discovery CTA are cut.`,
    subsections: [
      {
        title: "Weekly cadence",
        body: "Marqq will protect fixed weekly throughput before adding channels.",
        bullets: ["3 LinkedIn posts", "10 warm asks", "5 referral asks"],
      },
    ],
  };
}

export function measurementLooksHollow(section) {
  const blob = sectionBlob(section);
  const hasNorthStar =
    /\bprimary kpi\b/.test(blob) ||
    (/\bqualified leads? per month\b/.test(blob) && /\b(definition|scorecard|leading indicator)\b/.test(blob));
  const hasLoop = /\b(weekly|scorecard|kill|double|monday)\b/.test(blob);
  const vanityHeavy =
    /\b(page views|bounce rate|website traffic|social media engagement)\b/.test(blob) &&
    !/\bprimary kpi\b/.test(blob);
  return !hasNorthStar || !hasLoop || vanityHeavy;
}

/** Invented paid budgets when plan is zero/organic capacity. */
export function inventsPaidBudgetOnZeroCash(section, onboarding = {}) {
  const budgetHint = `${onboarding?.budget || onboarding?.budgetBand || onboarding?.constraints || ""}`.toLowerCase();
  const zeroCash =
    /\b(zero|\$0|₹0|no budget|organic|capacity.?only)\b/.test(budgetHint) ||
    onboarding?.budget === 0 ||
    onboarding?.budgetBand === "zero";
  if (!zeroCash) return false;
  const blob = sectionBlob(section);
  return /[₹$]\s*\d+|weekly budget of|paid ads?.{0,40}[₹$]\d+|budget allocation of/i.test(blob);
}

export function salesSaasFallback(company, icp, quantified) {
  const who = icp || "the primary user";
  return {
    id: "sales_strategy",
    title: "Sales strategy",
    channel: "",
    summary: `Marqq will run a product-led conversion motion for ${company} aimed at ${who}, optimizing signup → first value → paid toward ${quantified || "paid conversions"}.`,
    bullets: [
      "Qualify in-product: ICP fit signal completed within 72h of signup (profile, thesis, or core setup)",
      "Activation SLA: first core action within 24h; first personalized value within 72h",
      "Conversion stages: signup → trial/demo → first value complete → paywall/commercial → paid",
      "Objections: price / DIY tools / status-quo process — counter with time-to-value proof + scoped pilot + cancel-anytime path",
      "Deprioritize: accounts that never complete first-value setup after day-7 nudge sequence",
    ],
    body: `Marqq will treat sales for ${company} as an in-product conversion system. Agents instrument funnel stages weekly and kill plays that do not move first-value → paid.`,
    subsections: [],
  };
}

export function positioningSaasFallback(company, icp, tagline) {
  const who = icp || "the primary user";
  const line = tagline || `${company} — product that delivers first value fast`;
  return {
    id: "positioning_messaging",
    title: "Positioning & messaging",
    channel: "",
    summary: `Marqq will lock ${company}'s claim as "${line}" for ${who}, with a hook, proof hierarchy, and competitive counter agents reuse weekly.`,
    bullets: [
      `Claim: "${line}"`,
      `Hook: Speak to the buyer's stalled job-to-be-done for ${who} — then invite a first-value action`,
      "Proof hierarchy: outcome proof → method → logos (only when real; never invent)",
      "Competitive counter: vs generic tools that lack the differentiated workflow; vs manual status quo",
      "Deprioritize: feature laundry lists and peer-competitor mudslinging without a proof point",
    ],
    body: `Marqq will treat positioning as reusable copy assets for ${company}. Agents paste claim/hook/counter into outreach, site, and onboarding.`,
    subsections: [],
  };
}

export function distributionSaasFallback(company, icp, quantified) {
  return {
    id: "distribution_channels",
    title: "Distribution & channels",
    channel: "",
    summary: `Marqq will run owned + community channels as the primary acquisition motion for ${company} toward ${quantified || "paid conversions"} — zero paid until organic conversion proves out.`,
    bullets: [
      "Primary: owned site/app + SEO/ASO or product-led content — Marqq ships weekly assets with tracked CTA",
      "Primary support: LinkedIn or niche community — 3 posts/week + 10 warm asks/week to primary buyers",
      "Owned nurture: email/in-app nudges to first value within 72h",
      "Kill rule: pause any paid test; organic only until signup→paid holds for 2 weeks",
      "Deprioritize: broad paid spray and channels without a first-value CTA",
    ],
    body: `Marqq will treat distribution as capacity. No invented ad budgets on zero cash.`,
    subsections: [],
  };
}

export function marketingSaasFallback(company, icp, quantified) {
  return {
    id: "marketing_strategy",
    title: "Marketing strategy",
    channel: "",
    summary: `Marqq will run one demand campaign for ${company} aimed at ${icp || "primary buyers"}, driving ${quantified || "paid conversions"} with a concrete offer and kill rules.`,
    bullets: [
      `Campaign spine: problem → ${company} method → first-value outcome for primary buyers`,
      "Offer/CTA: start trial / book demo / complete first-value setup (one primary CTA)",
      "Narrative: status-quo tools fail the buyer job; ${company} closes the gap",
      "Experiments: 2 message angles/fortnight; kill loser after 2 cycles",
      "Deprioritize: multi-channel spray and content without a conversion CTA",
    ],
    body: `Marqq will keep one campaign spine for ${company}. Channel mix lives in Distribution; Marketing owns story, offer, and creative tests.`,
    subsections: [],
  };
}

export function launchSaasFallback(company, icp, quantified) {
  return {
    id: "launch_plan",
    title: "Launch plan",
    channel: "",
    summary: `Marqq will run a 90-day product launch for ${company} aimed at ${icp || "primary buyers"}, toward ${quantified || "paid conversions"} via owned + organic.`,
    bullets: [
      "Pre-launch (wk 1–2): positioning one-pager, funnel instrumentation, creative bank",
      "Launch (wk 3–6): ship content + outreach cadence; push signup → first value",
      "Post-launch (wk 7–12): double plays that lift first-value→paid; kill angles with 0 completes in 14d",
      "Proof path: 5–10 reference/user stories before paid tests",
      "Deprioritize: untargeted paid and vanity launch stunts without a conversion path",
    ],
    body: `Marqq will launch ${company} as a measurable product motion. Success is first-value rate and paid conversion.`,
    subsections: [],
  };
}

export function measurementSaasFallback(company, quantified) {
  return {
    id: "measurement_optimization",
    title: "Measurement & optimization",
    channel: "",
    summary: `Marqq will run a weekly product scorecard for ${company} with primary KPI = ${quantified || "paid conversions / month"}, plus activation leading indicators and kill/double rules.`,
    bullets: [
      `Primary KPI: ${quantified || "paid conversions / month"}`,
      "Leading indicators: signups, first-value completes ≤72h, demo/trial starts, paywall/commercial views",
      "Instrumentation: product analytics + UTM on every asset",
      "Weekly loop: Monday scorecard → Marqq doubles winners / kills losers in 2 cycles",
      "Deprioritize: vanity metrics (likes, raw traffic) as decision drivers",
    ],
    body: `Marqq will optimize for paid conversion after first value — not vanity reach.`,
    subsections: [],
  };
}

export function timelineSaasFallback(company, icp, quantified) {
  return {
    id: "timeline_roadmap",
    title: "Timeline & roadmap",
    channel: "",
    summary: `Marqq will execute a 12-week product GTM plan for ${company} to reach ${quantified || "paid conversions"} with ${icp || "primary buyers"}.`,
    bullets: [
      "Weeks 1–2: Marqq ships claim/hook assets + event tracking + creative drafts",
      "Weeks 3–4: Marqq publishes 3–4 posts/week; activation nudges live (first value ≤72h)",
      "Weeks 5–8: Marqq doubles creatives that lift first-value; kills dead angles in 14d",
      "Weeks 9–12: Marqq locks proof stories + optimizes signup→paid toward target",
      "Deprioritize: work that does not increase first-value completes or paid conversions",
    ],
    body: `Marqq will keep the roadmap inside 90 days with product outcomes.`,
    subsections: [],
  };
}

export function risksSaasFallback(company, quantified) {
  return {
    id: "risks_contingencies",
    title: "Risks & contingencies",
    channel: "",
    summary: `Marqq will run if/then kill rules for ${company}'s product GTM so agents can act without a new memo.`,
    bullets: [
      "If first-value rate is weak by week 4 → Marqq rewrites onboarding to value-first",
      "If signup→paid pace misses by week 8 → Marqq tests paywall/commercial timing after first value only",
      `If ${quantified || "paid conversions"} <50% of target at week 10 → Marqq narrows to top starting segment`,
      "If any paid test yields 0 first-value completes in 14d → Marqq kills paid",
      "Deprioritize: open-ended competitor monitoring without a creative or onboarding change",
    ],
    body: `Marqq will treat risks as product funnel triggers.`,
    subsections: [],
  };
}

export function measurementServicesFallback(company, quantified) {
  return {
    id: "measurement_optimization",
    title: "Measurement & optimization",
    channel: "",
    summary: `Marqq will run a weekly GTM scorecard for ${company} with primary KPI = ${quantified || "qualified leads / month"}, plus leading indicators and kill/double rules.`,
    bullets: [
      `Primary KPI: ${quantified || "5 qualified leads / month"} (definition: ICP fit + budget owner + timeline ≤90d + discovery completed)`,
      "Leading indicators: warm intros accepted, discoveries booked, proposals out",
      "Instrumentation: UTM on every asset + CRM stages (Lead → Discovery → Proposal → Won)",
      "Weekly loop: Monday scorecard → Marqq doubles winners / kills losers within 2 cycles",
      "Deprioritize: vanity metrics (raw traffic, likes) as decision drivers",
    ],
    body: `Marqq will not optimize for traffic. Agents review one scorecard weekly and change the plan only when leading indicators move the primary KPI.`,
    subsections: [
      {
        title: "Weekly scorecard",
        body: "Marqq will review KPI + leading indicators every Monday.",
        bullets: ["Qualified leads MTD", "Discoveries booked", "Kill / double decision"],
      },
    ],
  };
}

export function risksLookGeneric(section) {
  const blob = sectionBlob(section);
  const genericHits = [
    "market competition",
    "talent acquisition",
    "regulatory",
    "economic downturn",
    "cybersecurity",
    "client retention",
    "service delivery",
  ].filter((k) => blob.includes(k)).length;
  const hasTrigger = /\b(if |when |by week|kill|pivot|trigger|then )\b/.test(blob);
  return genericHits >= 2 && !hasTrigger;
}

export function risksServicesFallback(company, quantified) {
  return {
    id: "risks_contingencies",
    title: "Risks & contingencies",
    channel: "",
    summary: `Marqq will run kill criteria and pivots for ${company}'s 90-day plan so agents can act without waiting for a new strategy memo.`,
    bullets: [
      "If <2 discoveries booked by week 4 → Marqq doubles warm outreach and cuts content volume 50%",
      "If any paid test yields 0 SQL by day 14 → Marqq kills paid and reallocates hours to referrals",
      "If capacity exceeds ~20h/week with flat pipeline → Marqq freezes new content formats; focus conversion",
      `If ${quantified || "qualified-lead pace"} is <50% of target at week 8 → Marqq narrows ICP list and sharpens offer`,
      "Deprioritize: open-ended 'monitor competition' work with no decision trigger",
    ],
    body: `Marqq will treat risks as if/then operating rules. Agents execute the contingency when the trigger fires — no generic risk essays.`,
    subsections: [
      {
        title: "Kill criteria",
        body: "Marqq will pre-authorize kills so the plan stays thin.",
        bullets: ["0 discoveries / 14d on a play", "Hours up, pipeline flat", "Week-8 pace miss"],
      },
    ],
  };
}
