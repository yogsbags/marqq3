/**
 * Live workspace glue — strategy, Brand DNA, wizard answers.
 * Prefer these over hardcoded demo clinics / Elevate competitors.
 */

import { loadLocalBrandContext, getActiveWorkspaceId } from "./brandContext";
import { formatStrategySectionForChat } from "./askMarqqContext";
import { loadStrategyDoc, northStarLabel } from "./journeyHandoff";

const WIZARD_KEY = "marqq_gtm_wizard";

export function getCompanyName() {
  try {
    const brand = loadLocalBrandContext();
    const fromBrand = brand?.companyName && String(brand.companyName).trim();
    if (fromBrand && !/^elevate$/i.test(fromBrand)) return fromBrand;
    const fromOb = localStorage.getItem("marqq_ob_companyName");
    if (fromOb && String(fromOb).trim()) return String(fromOb).trim();
    if (fromBrand) return fromBrand;
  } catch {
    /* ignore */
  }
  return "Your workspace";
}

export function getWebsite() {
  try {
    const brand = loadLocalBrandContext();
    if (brand?.website) return String(brand.website);
    return localStorage.getItem("marqq_ob_website") || "";
  } catch {
    return "";
  }
}

export function loadWizardAnswers() {
  try {
    const raw = sessionStorage.getItem(WIZARD_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed?.answers && typeof parsed.answers === "object" ? parsed.answers : {};
  } catch {
    return {};
  }
}

export function wizardAnswerLabel(id) {
  const answers = loadWizardAnswers();
  const a = answers?.[id];
  if (!a || typeof a !== "object") return "";
  if (Array.isArray(a.values) && a.values.length && a.label) return String(a.label);
  return String(a.label || a.value || "").trim();
}

export function getStrategySection(sectionId) {
  const doc = loadStrategyDoc();
  if (!doc?.sections?.length) return null;
  return doc.sections.find((s) => s.id === sectionId) || null;
}

export function sectionPlainText(section) {
  if (!section) return "";
  if (typeof section.content === "string" && section.content.trim()) {
    return section.content.trim();
  }
  return formatStrategySectionForChat(section);
}

export function sectionBullets(sectionId) {
  const section = getStrategySection(sectionId);
  if (!section) return [];
  const bullets = Array.isArray(section.bullets) ? section.bullets.map(String).filter(Boolean) : [];
  if (bullets.length) return bullets;
  const text = sectionPlainText(section);
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter((l) => l.length > 8)
    .slice(0, 12);
}

/** ICP / personas from Brand DNA + interview + target_customer section. */
export function getAudienceProfile() {
  const brand = loadLocalBrandContext() || {};
  const icp =
    wizardAnswerLabel("icp") ||
    localStorage.getItem("marqq_ob_icp") ||
    brand.icp ||
    "";
  const persona = wizardAnswerLabel("persona") || "";
  const jtbd = wizardAnswerLabel("jtbd") || "";
  const triggers = wizardAnswerLabel("buying_triggers") || "";
  const notAFit = wizardAnswerLabel("not_a_fit") || "";
  const section = getStrategySection("target_customer");
  const body = sectionPlainText(section);
  const bullets = sectionBullets("target_customer");
  const ga = loadStrategyDoc()?.goalAlignment || {};
  return {
    companyName: getCompanyName(),
    icp: String(icp).trim(),
    persona: String(persona).trim(),
    jtbd: String(jtbd).trim(),
    triggers: String(triggers).trim(),
    notAFit: String(notAFit).trim(),
    sectionTitle: section?.title || "Target customer",
    sectionBody: body,
    bullets,
    northStar: northStarLabel(),
    quantified: ga.quantified_target || "",
    niche: brand.niche || localStorage.getItem("marqq_ob_niche") || "",
    hasStrategy: Boolean(loadStrategyDoc()?.sections?.length),
  };
}

/** Market analysis + risks as live intel (no fake competitors). */
export function getMarketIntel() {
  const market = getStrategySection("market_analysis");
  const risks = getStrategySection("risks_contingencies");
  const brand = loadLocalBrandContext() || {};
  return {
    companyName: getCompanyName(),
    niche: brand.niche || localStorage.getItem("marqq_ob_niche") || "",
    marketTitle: market?.title || "Market analysis",
    marketBody: sectionPlainText(market),
    marketBullets: sectionBullets("market_analysis"),
    risksTitle: risks?.title || "Risks & contingencies",
    risksBody: sectionPlainText(risks),
    risksBullets: sectionBullets("risks_contingencies"),
    northStar: northStarLabel(),
    hasStrategy: Boolean(market || risks),
  };
}

/** Planned assets / plays from a strategy section (landing pages, magnets, calendar). */
export function playsFromSection(sectionId, fallbackLabel = "Play") {
  const bullets = sectionBullets(sectionId);
  const section = getStrategySection(sectionId);
  if (!bullets.length && !section) return [];
  if (!bullets.length) {
    const body = sectionPlainText(section);
    if (!body) return [];
    return [
      {
        name: section.title || fallbackLabel,
        detail: body.slice(0, 220),
        status: "From strategy",
      },
    ];
  }
  return bullets.map((b, i) => ({
    name: b.length > 72 ? `${b.slice(0, 72)}…` : b,
    detail: b,
    status: i === 0 ? "Priority" : "Planned",
  }));
}

export function emptyStrategyCta(setActiveScreen) {
  return { setActiveScreen, screen: "gtmwizard" };
}

/**
 * Shared seed for Content / Social / Creative / Paid / Outreach studios.
 * Never hardcodes Nouriva or Elevate.
 */
export function studioSeed() {
  const brand = loadLocalBrandContext() || {};
  const audience = getAudienceProfile();
  const company = getCompanyName();
  const website = getWebsite() || brand.website || "";
  const domain = String(website)
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .trim();
  const doc = loadStrategyDoc();
  const ga = doc?.goalAlignment || {};
  const niche = audience.niche || brand.niche || localStorage.getItem("marqq_ob_niche") || "";
  const icp = audience.icp || brand.icp || localStorage.getItem("marqq_ob_icp") || "";
  const brandContext =
    brand.brandSummary ||
    brand.brandTagline ||
    [company !== "Your workspace" ? company : "", niche, icp].filter(Boolean).join(" — ") ||
    "Brand DNA not set yet — complete onboarding.";
  const quantified =
    ga.quantified_target || northStarLabel() || localStorage.getItem("marqq_ob_target") || "";
  const timeline =
    ga.timeline_target || localStorage.getItem("marqq_ob_timeWindow") || "90 days";
  const topicBase =
    wizardAnswerLabel("priority_90d") ||
    brand.outcome ||
    localStorage.getItem("marqq_ob_outcome") ||
    ga.priority_90d ||
    "";

  return {
    companyName: company,
    companyId: getActiveWorkspaceId(),
    workspaceId: getActiveWorkspaceId(),
    website,
    domain: domain || "example.com",
    marketType: "b2b",
    brandContext,
    logoUrl: brand.logoUrl || "",
    quantifiedTarget: quantified,
    timelineTarget: timeline,
    timeline,
    audience: icp || "Set ICP in Brand DNA / GTM Audience",
    topic: [topicBase, niche].filter(Boolean).join(" · ") || `GTM motion for ${company}`,
    northStarMetric: ga.north_star_metric || "",
    northStarDefinition: ga.metric_definition || "",
    channels: ["linkedin", "instagram", "twitter", "facebook", "tiktok", "youtube"],
    platform: "instagram",
    aspectRatio: "9:16",
  };
}
