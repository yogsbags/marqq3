/**
 * Load Marqq2 marketing skill playbooks for GTM Goals strategy sections.
 * Skills live under Marqq2: platform/agent-runtime/skills/marketingskills/skills/<id>/SKILL.md
 *
 * Override with MARQQ_SKILLS_DIR (absolute path to the skills/ folder).
 */

import { readdir, readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @typedef {{ primary: string[], secondary?: string[] }} SkillPack */

/** Goals interview → strategy section skill packs (Marqq2-aligned). */
export const STRATEGY_SECTION_SKILL_PACKS = {
  financial_plan: {
    primary: ["pricing-strategy"],
    secondary: ["paid-ads", "ads-budget"],
  },
  customer_success: {
    primary: ["onboarding-cro", "churn-prevention"],
    secondary: ["email-sequence"],
  },
  operations_execution: {
    primary: ["revops", "analytics-tracking"],
    secondary: ["ab-test-setup"],
  },
  product_strategy: {
    primary: ["product-marketing-context", "offer-definer"],
    secondary: ["pricing-strategy"],
  },
  pricing_monetization: {
    primary: ["pricing-strategy"],
    secondary: ["offer-definer", "paywall-upgrade-cro"],
  },
  target_customer: {
    primary: ["icp-definer", "persona-definer"],
    secondary: ["customer-research", "pain-identifier"],
  },
};

/** Marqq2 GTM_AUTO_SECTION_SKILL_KEYS → task packs in artifactMarketingSkills. */
export const GTM_AUTO_SECTION_SKILL_KEYS = {
  market_analysis: "gtm_strategy_doc",
  positioning_messaging: "positioning_messaging",
  distribution_channels: "channel_strategy",
  marketing_strategy: "marketing_strategy",
  sales_strategy: "sales_enablement",
  launch_plan: "launch-strategy",
  measurement_optimization: "analytics-tracking",
  risks_contingencies: "gtm_strategy_doc",
  timeline_roadmap: "gtm_strategy_doc",
};

/** Task-key skill packs (subset of Marqq2 artifactMarketingSkills). */
export const TASK_SKILL_PACKS = {
  gtm_strategy_doc: {
    primary: ["product-marketing-context", "gtm-action-thinker", "launch-strategy", "icp-definer"],
    secondary: [
      "offer-definer",
      "trigger-finder",
      "campaign-angle-finder",
      "pricing-strategy",
      "sales-enablement",
    ],
  },
  positioning_messaging: {
    primary: ["product-marketing-context", "offer-definer", "copywriting"],
    secondary: ["campaign-angle-finder", "pain-identifier", "copywriting-refiner"],
  },
  channel_strategy: {
    primary: ["ads-meta", "paid-ads", "launch-strategy"],
    secondary: ["ads-plan", "analytics-tracking"],
  },
  marketing_strategy: {
    primary: ["gtm-action-thinker", "marketing-ideas", "launch-strategy", "icp-definer"],
    secondary: ["product-marketing-context", "offer-definer", "campaign-angle-finder"],
  },
  marketing_ideas: {
    primary: ["marketing-ideas"],
    secondary: ["product-marketing-context", "launch-strategy"],
  },
  sales_enablement: {
    primary: ["sales-enablement", "offer-definer"],
    secondary: ["pain-identifier", "copywriting", "competitor-alternatives", "trigger-finder"],
  },
  "launch-strategy": {
    primary: ["launch-strategy"],
    secondary: ["product-marketing-context", "offer-definer"],
  },
  "analytics-tracking": {
    primary: ["analytics-tracking"],
    secondary: ["ab-test-setup", "revops"],
  },
};

export const GTM_AUTO_SECTION_DEFS = [
  { id: "market_analysis", title: "Market analysis" },
  { id: "positioning_messaging", title: "Positioning & messaging" },
  { id: "distribution_channels", title: "Distribution & channels" },
  { id: "marketing_strategy", title: "Marketing strategy" },
  { id: "sales_strategy", title: "Sales strategy" },
  { id: "launch_plan", title: "Launch plan" },
  { id: "measurement_optimization", title: "Measurement & optimization" },
  { id: "risks_contingencies", title: "Risks & contingencies" },
  { id: "timeline_roadmap", title: "Timeline & roadmap" },
];

/** Per-section lane instructions (Marqq2 AUTO_SECTION_LANE_PROMPTS). */
export const AUTO_SECTION_LANE_PROMPTS = {
  market_analysis: `MARKET ANALYSIS LANE (strict):
- summary: one complete sentence naming who to win FIRST (starting market) + why now. Must end with a period. Start with "Marqq will…".
- Plain language for users: say "Starting market" — NOT "beachhead". Starting market = who BUYS from this company (ICP), NEVER peer firms in the company's own service category.
- bullets (exactly 5, labeled by intent — MARKET DECISIONS, not marketing plays):
  1. Starting market: buyer firmographic / persona / geo — grounded in ICP (no invented $ revenue / headcount bands)
  2. Why now: buyer trigger (conditional if unproven) — NO invented funding surges
  3. Expand next: second BUYER segment after first-market proof
  4. Expand later: third segment or expansion condition
  5. Deprioritize: explicit geo/vertical/account type to skip + why
- body: 4–6 complete sentences on sequencing logic. No asset-building prescriptions.
- Do NOT invent KPI lifts, CAC, ROI %, or fake "last 30 days" events.`,
  positioning_messaging: `POSITIONING LANE (executable copy assets):
- Required bullets: (1) Claim one-liner, (2) Hook opener Marqq can paste into outreach, (3) Proof hierarchy, (4) Competitive counter, (5) Deprioritize.
- FORBIDDEN: "develop a UVP" / "create messaging" / "emphasize expertise" without the actual claim text.
- No campaign plans or channel calendars. Marqq-will voice.`,
  distribution_channels: `DISTRIBUTION LANE (capacity plan):
- Required: primary motion with WEEKLY CADENCE numbers (e.g. 3 posts/week, 10 warm asks/week), supporting channel, kill rule (0 discoveries / 14d), deprioritize.
- No invented budgets. Do not dump a generic ads stack. Marqq-will voice.`,
  marketing_strategy: `MARKETING LANE (strict — NOT a channel list):
- Do NOT restate LinkedIn / referrals / Google Ads / events from Distribution.
- Required: (1) one campaign spine, (2) one concrete offer/CTA, (3) demand narrative for the BUYER, (4) experiment cadence with kill rules, (5) one deprioritization.
- Channels belong in Distribution; Marketing owns story + offer + tests. Marqq-will voice.`,
  sales_strategy: `SALES LANE (required elements):
- Qualification criteria tied to ICP
- Conversion stages (discovery → proposal → close) with clear SLA/TAT (e.g. 48h)
- Top objections + counters
- Explicit deprioritization of bad-fit leads
FORBIDDEN: restating UVP/messaging pillars or channel lists as the whole sales section. Marqq-will voice.`,
  launch_plan: `LAUNCH LANE: pre-launch → launch → post milestones, time-boxed to the 90-day target with week numbers and shippable artifacts. Concrete. Do not clone the marketing paragraph. Marqq-will voice.`,
  measurement_optimization: `MEASUREMENT LANE (scorecard):
- Required: primary KPI (= quantified target + definition), 2–3 leading indicators, instrumentation (UTM/CRM), weekly review loop with kill/double rules.
- FORBIDDEN: vanity-only (traffic/likes) as the decision system. Marqq-will voice.`,
  risks_contingencies: `RISKS LANE (if/then operating rules):
- Each risk MUST be "If <trigger> by <time> → Marqq will <pivot/kill>".
- FORBIDDEN: generic essays (market competition, talent, regulatory) without a decision trigger. Marqq-will voice.`,
  timeline_roadmap: `TIMELINE LANE (12-week operating plan):
- Week blocks with shippable artifacts (ICP list, posts, outreach, discoveries) — NOT a list of strategy section names.
- Each fortnight ends with an outcome or kill decision. Marqq-will voice.`,
};

export const LAST30_MARKET_ANALYSIS_GUIDE = `## Supplemental skill: last30days (market analysis mode)
Use a buyer-trigger lens for market_analysis ONLY:
- Prefer buyer triggers (new CXO, stalled roadmap, board mandate, failed internal initiative) over timeless TAM essays.
- If site/Brand DNA does NOT prove a recent market wedge, say "likely" / "test first" — NEVER invent funding surges or partnership waves.
- Starting market = who BUYS — never peer firms in the seller's service category. Use the label "Starting market" (not "beachhead").
- Output MUST answer only:
  1. Which BUYER segment is the starting market now?
  2. Why that segment first (fit + timing)?
  3. What second / third BUYER segments follow?
  4. What geos / account types to deprioritize until proof appears?
- FORBIDDEN: ROI calculators, sales scripts, landing pages, ad budgets, content calendars, or any "build this asset" play.`;

const DEFAULT_PACK = {
  primary: ["product-marketing-context", "gtm-action-thinker"],
  secondary: ["launch-strategy"],
};

const skillCache = new Map();
const PRIMARY_MAX_CHARS = 8_000;
const SECONDARY_MAX_CHARS = 3_000;
const REFERENCE_MAX_CHARS = 4_000;
const PLAYBOOK_MAX_CHARS = 14_000;

function defaultSkillsDir() {
  // Marqq-test/server/services → ../../Marqq2/...
  return resolve(
    __dirname,
    "..",
    "..",
    "..",
    "Marqq2",
    "platform",
    "agent-runtime",
    "skills",
    "marketingskills",
    "skills"
  );
}

export function resolveSkillsDir() {
  const fromEnv = String(process.env.MARQQ_SKILLS_DIR || "").trim();
  return fromEnv ? resolve(fromEnv) : defaultSkillsDir();
}

export function resolveSectionSkillPack(sectionId) {
  const id = String(sectionId || "").trim();
  return STRATEGY_SECTION_SKILL_PACKS[id] || DEFAULT_PACK;
}

export function resolveTaskSkillPack(taskKey) {
  const key = String(taskKey || "").trim();
  if (!key) return DEFAULT_PACK;
  return TASK_SKILL_PACKS[key] || STRATEGY_SECTION_SKILL_PACKS[key] || DEFAULT_PACK;
}

function truncateSkill(content, maxChars) {
  const text = String(content || "").trim();
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[…skill truncated for context budget…]`;
}

async function readSkillMarkdown(skillsDir, skillId) {
  const key = String(skillId || "").trim();
  if (!key) return "";
  const cacheKey = `${skillsDir}::${key}`;
  if (skillCache.has(cacheKey)) return skillCache.get(cacheKey);

  try {
    let raw = (await readFile(join(skillsDir, key, "SKILL.md"), "utf-8")).trim();
    try {
      const refsDir = join(skillsDir, key, "references");
      const files = (await readdir(refsDir))
        .filter((name) => name.toLowerCase().endsWith(".md"))
        .sort();
      for (const file of files.slice(0, 3)) {
        const refBody = (await readFile(join(refsDir, file), "utf-8")).trim();
        if (!refBody) continue;
        raw += `\n\n### Skill reference: ${file}\n${truncateSkill(refBody, REFERENCE_MAX_CHARS)}`;
      }
    } catch {
      /* no references */
    }
    skillCache.set(cacheKey, raw);
    return raw;
  } catch {
    skillCache.set(cacheKey, "");
    return "";
  }
}

/**
 * @param {SkillPack} pack
 * @param {{ label?: string }} [opts]
 */
/** Build a skill playbook from a primary/secondary pack. */
export async function buildPlaybookFromPack(pack, opts = {}) {
  const skillsDir = resolveSkillsDir();
  const primaryIds = Array.isArray(pack.primary) ? pack.primary : [];
  const secondaryIds = Array.isArray(pack.secondary) ? pack.secondary : [];
  const skillIds = [...new Set([...primaryIds, ...secondaryIds].filter(Boolean))];
  const label = opts.label || "strategy section";

  let dirOk = false;
  try {
    await access(skillsDir, constants.R_OK);
    dirOk = true;
  } catch {
    dirOk = false;
  }

  if (!dirOk) {
    return {
      playbook: "",
      skillIds,
      skillsDir,
      loaded: false,
      warning: `Skills directory not readable: ${skillsDir}. Set MARQQ_SKILLS_DIR.`,
    };
  }

  const sections = [];
  for (const skillId of primaryIds) {
    const body = truncateSkill(await readSkillMarkdown(skillsDir, skillId), PRIMARY_MAX_CHARS);
    if (body) sections.push(`### Marketing skill: ${skillId} (primary)\n${body}`);
  }
  for (const skillId of secondaryIds) {
    const body = truncateSkill(await readSkillMarkdown(skillsDir, skillId), SECONDARY_MAX_CHARS);
    if (body) sections.push(`### Marketing skill: ${skillId} (supporting)\n${body}`);
  }

  if (!sections.length) {
    return {
      playbook: "",
      skillIds,
      skillsDir,
      loaded: false,
      warning: `No SKILL.md loaded for ${label} from ${skillsDir}`,
    };
  }

  const playbook = truncateSkill(
    [
      "## Required marketing skill playbook",
      "Execute this strategy section using the marketing skill(s) below as the authoritative method.",
      "Follow their frameworks, checklists, and quality bars where they do not conflict with the SECTION LANE rules or JSON schema.",
      "Stay inside THIS section's lane — do not pull in frameworks that belong to other GTM sections.",
      "",
      sections.join("\n\n---\n\n"),
    ].join("\n"),
    PLAYBOOK_MAX_CHARS
  );

  return {
    playbook,
    skillIds,
    skillsDir,
    loaded: true,
    playbookChars: playbook.length,
  };
}

/** Goals drafts skill playbook. */
export async function loadStrategySectionPlaybook(sectionId) {
  return buildPlaybookFromPack(resolveSectionSkillPack(sectionId), { label: sectionId });
}

/** Onboarding auto-section playbook (used by GTM Wizard briefs). */
export async function loadAutoSectionPlaybook(sectionId) {
  const skillTaskKey = GTM_AUTO_SECTION_SKILL_KEYS[sectionId] || "gtm_strategy_doc";
  const result = await buildPlaybookFromPack(resolveTaskSkillPack(skillTaskKey), {
    label: `${sectionId}/${skillTaskKey}`,
  });
  return { ...result, skillTaskKey };
}
