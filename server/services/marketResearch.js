/**
 * Live market / competitor research via Groq (with credit metering).
 */
import { resolveGtmAutoSectionModel } from './groqReasoning.js';
import { meteredGroqJson } from './credits/index.js';
import { getInjectableRulesBlock } from './agentInstructions.js';

function fallbackResearch({ companyName, niche, website }) {
  return {
    ok: true,
    source: 'fallback',
    summary: `${companyName} operates in ${niche || 'its category'}${website ? ` (${website})` : ''}. Connect Groq for live web-backed research.`,
    competitors: [],
    opportunities: ['Clarify ICP triggers', 'Ship one proof asset this week'],
    risks: ['Thin category differentiation without live research'],
    queries: [],
    updatedAt: new Date().toISOString(),
  };
}

function parseJsonLoose(raw) {
  try {
    return JSON.parse(String(raw || '').replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim());
  } catch {
    return null;
  }
}

export async function runMarketResearch(input = {}) {
  const companyName = String(input.companyName || '').trim() || 'Company';
  const website = String(input.website || '').trim();
  const niche = String(input.niche || '').trim();
  const icp = String(input.icp || '').trim();
  const marketBrief = String(input.marketBrief || '').trim().slice(0, 1200);
  const workspaceId = String(input.workspaceId || input.companyId || 'marqq-ws-1').trim();

  const model = resolveGtmAutoSectionModel();
  const ishaRules = await getInjectableRulesBlock(workspaceId, 'isha');
  const system = `You are a B2B market intelligence analyst. Use web search when available.
Return ONLY JSON:
{
  "summary": "4-6 sentence market snapshot",
  "competitors": [{"name":"","angle":"","threat":"low|medium|high"}],
  "opportunities": ["..."],
  "risks": ["..."],
  "queries": ["search queries you would monitor"]
}
Be specific to the company. Max 5 competitors, 4 opportunities, 4 risks.${ishaRules}`;

  const user = `Company: ${companyName}
Website: ${website || 'n/a'}
Niche: ${niche || 'n/a'}
ICP: ${icp || 'n/a'}
Existing market brief (may be stale):
${marketBrief || '(none)'}

Refresh competitor and category intelligence for GTM planning.`;

  try {
    const result = await meteredGroqJson({
      workspaceId,
      feature: 'market_research',
      model,
      temperature: 0.25,
      max_tokens: 1800,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      meta: { companyName, website },
    });

    if (result.insufficientCredits) {
      return {
        ...fallbackResearch({ companyName, niche, website }),
        error: 'insufficient_credits',
        credits: result.wallet,
      };
    }

    if (!result.ok) {
      console.warn('[market-research] groq error', result.error);
      const parsed = parseJsonLoose(result.content);
      if (parsed?.summary) {
        return {
          ok: true,
          source: 'groq',
          model: result.model,
          summary: String(parsed.summary || '').trim(),
          competitors: Array.isArray(parsed.competitors) ? parsed.competitors.slice(0, 6) : [],
          opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.slice(0, 6).map(String) : [],
          risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 6).map(String) : [],
          queries: Array.isArray(parsed.queries) ? parsed.queries.slice(0, 8).map(String) : [],
          credits: result.credits,
          updatedAt: new Date().toISOString(),
        };
      }
      return { ...fallbackResearch({ companyName, niche, website }), error: result.error };
    }

    const parsed = result.json || {};
    return {
      ok: true,
      source: 'groq',
      model: result.model,
      summary:
        String(parsed.summary || '').trim() ||
        fallbackResearch({ companyName, niche, website }).summary,
      competitors: Array.isArray(parsed.competitors) ? parsed.competitors.slice(0, 6) : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.slice(0, 6).map(String) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 6).map(String) : [],
      queries: Array.isArray(parsed.queries) ? parsed.queries.slice(0, 8).map(String) : [],
      usage: result.usage,
      credits: result.credits,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[market-research]', err.message);
    return { ...fallbackResearch({ companyName, niche, website }), error: err.message };
  }
}
