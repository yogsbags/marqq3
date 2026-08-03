const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || import.meta.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
/** Ask Marqq / agentic chat — Compound Mini has built-in web search. */
const CHAT_MODEL = import.meta.env.VITE_GROQ_CHAT_MODEL || 'groq/compound-mini';

/**
 * Ask Marqq chat: groq/compound-mini (server-side web search when useful).
 * Returns { content, model, usedSearch } or null on failure.
 */
export async function askMarqqCompound(messages, systemPrompt = '') {
  try {
    const payloadMessages = [];
    if (systemPrompt) {
      payloadMessages.push({ role: 'system', content: systemPrompt });
    }
    payloadMessages.push(...messages);

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: payloadMessages,
        temperature: 0.6,
        max_tokens: 2048
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn('Groq compound chat error:', err);
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message || {};
    const executedTools = message.executed_tools || data.executed_tools || [];
    const usedSearch = Array.isArray(executedTools)
      ? executedTools.some((t) => /search|browser|web/i.test(String(t?.type || t?.name || '')))
      : false;

    return {
      content: message.content || '',
      model: data.model || CHAT_MODEL,
      usedSearch,
      executedTools,
    };
  } catch (error) {
    console.error('Groq compound chat failed:', error);
    return null;
  }
}

export async function askGroqAI(messages, systemPrompt = '') {
  try {
    const payloadMessages = [];
    if (systemPrompt) {
      payloadMessages.push({ role: 'system', content: systemPrompt });
    }
    payloadMessages.push(...messages);

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: payloadMessages,
        temperature: 0.7,
        max_tokens: 2048
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn('Groq API error response:', err);
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('Groq AI Call Failed:', error);
    return null;
  }
}

/**
 * Runs Groq Llama 3.3 70B model to complete onboarding and synthesize Brand DNA + GTM strategy.
 */
export async function completeOnboardingWithGroq(companyInfo) {
  const prompt = `
You are Veena, the Chief Orchestration AI Agent for Marqq B2B Marketing Platform.
Analyze the following company onboarding inputs and generate structured GTM Brand DNA and strategy data.

Company Details:
- Name: ${companyInfo.companyName || 'Elevate'}
- Website: ${companyInfo.website || 'theelevate.co.in'}
- Industry Niche: ${companyInfo.niche || 'Healthcare scheduling software'}
- Target ICP: ${companyInfo.icp || 'Mid-market outpatient clinics, 20-200 staff'}
- Goal/Outcome: ${companyInfo.outcome || 'Grow qualified pipeline'}
- Target Window: ${companyInfo.timeWindow || '60 days'}
- Target Metric: ${companyInfo.target || '$2M pipeline'}

Return JSON strictly matching this structure:
{
  "brandSummary": "1-sentence core positioning statement",
  "positioningTags": ["Tag 1", "Tag 2", "Tag 3"],
  "primaryValueProp": "Primary headline for marketing",
  "recommendedChannels": ["LinkedIn ABM", "Google Paid Search", "SEO Content"],
  "topPillarStrategy": "Title for recommended initial strategy campaign"
}
`;

  try {
    const rawResult = await askGroqAI(
      [{ role: 'user', content: prompt }],
      'You are a JSON-only response generator. Output valid JSON only with no markdown formatting.'
    );

    if (rawResult) {
      // Clean JSON formatting if markdown wraps it
      const cleanJson = rawResult.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    }
  } catch (e) {
    console.warn('Groq onboarding parsing fallback used:', e);
  }

  // Resilient Fallback
  return {
    brandSummary: `Clinically credible ${companyInfo.niche || 'B2B automation'} platform built for ${companyInfo.icp || 'mid-market teams'}.`,
    positioningTags: ['Clinically Credible', 'Effortlessly Automated', 'Built for Scale'],
    primaryValueProp: `Cut no-shows and accelerate ${companyInfo.target || 'pipeline'} in ${companyInfo.timeWindow || '60 days'}.`,
    recommendedChannels: ['LinkedIn ABM', 'Google Ads', 'SEO Cluster'],
    topPillarStrategy: `${companyInfo.companyName || 'Elevate'} Q3 Pipeline Acceleration`
  };
}
