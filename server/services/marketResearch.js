/**
 * Live market / competitor refresh via Groq Compound Mini (web search).
 */
import { withGroqReasoning, resolveGtmAutoSectionModel } from './groqReasoning.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function groqKey() {
  return process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '';
}

function parseJsonLoose(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
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

function fallbackResearch({ companyName, niche, website }) {
  return {
    ok: true,
    source: 'fallback',
    summary: `Baseline market scan for ${companyName || 'this company'}${niche ? ` in ${niche}` : ''}. Connect GROQ_API_KEY for live web research.`,
    competitors: [
      {
        name: 'Category incumbents',
        angle: 'Established players with brand trust and broader distribution',
        threat: 'medium',
      },
      {
        name: 'Niche challengers',
        angle: 'Focused ICP messaging and faster iteration',
        threat: 'high',
      },
    ],
    opportunities: [
      `Own a sharper ICP wedge${niche ? ` in ${niche}` : ''}`,
      website ? `Convert ${website} visitors with proof-led content` : 'Publish proof-led content on the company site',
    ],
    risks: ['Generic positioning vs specialists', 'Paid CAC inflation if creative fatigues'],
    queries: [],
  };
}

/**
 * @param {{ companyName?: string, website?: string, niche?: string, icp?: string, marketBrief?: string }} input
 */
export async function runMarketResearch(input = {}) {
  const companyName = String(input.companyName || '').trim() || 'Company';
  const website = String(input.website || '').trim();
  const niche = String(input.niche || '').trim();
  const icp = String(input.icp || '').trim();
  const marketBrief = String(input.marketBrief || '').trim().slice(0, 1200);

  const key = groqKey();
  if (!key) return fallbackResearch({ companyName, niche, website });

  const model = resolveGtmAutoSectionModel();
  const system = `You are a B2B market intelligence analyst. Use web search when available.
Return ONLY JSON:
{
  "summary": "4-6 sentence market snapshot",
  "competitors": [{"name":"","angle":"","threat":"low|medium|high"}],
  "opportunities": ["..."],
  "risks": ["..."],
  "queries": ["search queries you would monitor"]
}
Be specific to the company. Max 5 competitors, 4 opportunities, 4 risks.`;

  const user = `Company: ${companyName}
Website: ${website || 'n/a'}
Niche: ${niche || 'n/a'}
ICP: ${icp || 'n/a'}
Existing market brief (may be stale):
${marketBrief || '(none)'}

Refresh competitor and category intelligence for GTM planning.`;

  try {
    const body = withGroqReasoning({
      model,
      temperature: 0.25,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    // Prefer JSON mode when not compound
    if (!/compound/i.test(model)) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[market-research] groq error', res.status, json?.error || json);
      return { ...fallbackResearch({ companyName, niche, website }), error: json?.error?.message || `Groq ${res.status}` };
    }
    const raw = json.choices?.[0]?.message?.content || '';
    const parsed = parseJsonLoose(raw) || {};
    return {
      ok: true,
      source: 'groq',
      model,
      summary: String(parsed.summary || '').trim() || fallbackResearch({ companyName, niche, website }).summary,
      competitors: Array.isArray(parsed.competitors) ? parsed.competitors.slice(0, 6) : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.slice(0, 6).map(String) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 6).map(String) : [],
      queries: Array.isArray(parsed.queries) ? parsed.queries.slice(0, 8).map(String) : [],
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[market-research]', err.message);
    return { ...fallbackResearch({ companyName, niche, website }), error: err.message };
  }
}
