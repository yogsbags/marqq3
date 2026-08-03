/** One-time workspace identity: Elevate @ theelevate.co.in */

export const WORKSPACE_BOOTSTRAP_KEY = "marqq_workspace_bootstrap";
export const WORKSPACE_BOOTSTRAP_VERSION = "elevate-theelevate-co-in-v6";

export const ELEVATE_DEFAULTS = {
  companyName: "Elevate",
  website: "theelevate.co.in",
  niche: "Management strategy, AI solutions & digital transformation consulting",
  icp: "Growth-stage companies and mid-market leaders seeking strategy-to-execution partners",
  outcome: "Grow qualified leads from strategy and AI transformation buyers",
  timeWindow: "90 days",
  target: "5 qualified leads per month",
  baseline: "1 qualified lead per month",
  tagline: "Strategy Meets Execution",
  tone: "Clear, senior, execution-focused",
};

const OB_KEYS = [
  "marqq_onboarding_step",
  "marqq_onboarding_complete",
  "marqq_ob_companyName",
  "marqq_ob_website",
  "marqq_ob_niche",
  "marqq_ob_icp",
  "marqq_ob_outcome",
  "marqq_ob_timeWindow",
  "marqq_ob_target",
  "marqq_ob_baseline",
  "marqq_ob_tagline",
  "marqq_ob_tone",
  "marqq_active_screen",
];

const AUTO_SECTION_PREFIX = "marqq_gtm_auto_sections_";

const SESSION_KEYS = [
  "marqq_gtm_wizard",
  "marqq_gtm_strategy",
  "marqq_gtm_wizard_version",
  "marqq_gtm_briefs_complete",
];
const GTM_WIZARD_SESSION_VERSION = "wizard-llm-options-headers-v1";
const GTM_WIZARD_VERSION_KEY = "marqq_gtm_wizard_version";

/** Clear leftover stub GTM wizard sessions so AI section review starts clean. */
export function clearGtmWizardSession() {
  if (typeof sessionStorage === "undefined") return;
  for (const key of ["marqq_gtm_wizard", "marqq_gtm_strategy", "marqq_gtm_briefs_complete"]) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/** One-time invalidation of stub-card GTM wizard sessions. */
export function ensureGtmWizardSessionFresh() {
  if (typeof sessionStorage === "undefined") return false;
  try {
    if (sessionStorage.getItem(GTM_WIZARD_VERSION_KEY) === GTM_WIZARD_SESSION_VERSION) {
      return false;
    }
    clearGtmWizardSession();
    sessionStorage.setItem(GTM_WIZARD_VERSION_KEY, GTM_WIZARD_SESSION_VERSION);
    return true;
  } catch {
    return false;
  }
}

export function isOnboardingComplete() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem("marqq_onboarding_complete") === "1";
}

/**
 * Ensures Elevate workspace defaults and resets onboarding to step 1 once
 * when the bootstrap version changes.
 * @returns {{ resetApplied: boolean, startOnboarding: boolean }}
 */
export function ensureElevateWorkspace() {
  if (typeof localStorage === "undefined") {
    return { resetApplied: false, startOnboarding: true };
  }

  ensureGtmWizardSessionFresh();

  const already = localStorage.getItem(WORKSPACE_BOOTSTRAP_KEY) === WORKSPACE_BOOTSTRAP_VERSION;
  if (already) {
    if (isOnboardingComplete()) {
      return { resetApplied: false, startOnboarding: false };
    }
    const step = parseInt(localStorage.getItem("marqq_onboarding_step") || "1", 10);
    return { resetApplied: false, startOnboarding: !Number.isFinite(step) || step < 8 };
  }

  for (const key of OB_KEYS) localStorage.removeItem(key);
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(AUTO_SECTION_PREFIX)) localStorage.removeItem(key);
  }
  for (const key of SESSION_KEYS) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  localStorage.setItem(WORKSPACE_BOOTSTRAP_KEY, WORKSPACE_BOOTSTRAP_VERSION);
  localStorage.setItem("marqq_onboarding_step", "1");
  localStorage.removeItem("marqq_onboarding_complete");
  localStorage.setItem("marqq_ob_companyName", ELEVATE_DEFAULTS.companyName);
  localStorage.setItem("marqq_ob_website", ELEVATE_DEFAULTS.website);
  localStorage.setItem("marqq_ob_niche", ELEVATE_DEFAULTS.niche);
  localStorage.setItem("marqq_ob_icp", ELEVATE_DEFAULTS.icp);
  localStorage.setItem("marqq_ob_outcome", ELEVATE_DEFAULTS.outcome);
  localStorage.setItem("marqq_ob_timeWindow", ELEVATE_DEFAULTS.timeWindow);
  localStorage.setItem("marqq_ob_target", ELEVATE_DEFAULTS.target);
  localStorage.setItem("marqq_ob_baseline", ELEVATE_DEFAULTS.baseline);
  localStorage.setItem("marqq_ob_tagline", ELEVATE_DEFAULTS.tagline);
  localStorage.setItem("marqq_ob_tone", ELEVATE_DEFAULTS.tone);
  localStorage.setItem("marqq_active_screen", "onboarding");

  return { resetApplied: true, startOnboarding: true };
}
