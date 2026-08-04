const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || import.meta.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
/** Ask Marqq / agentic chat — Compound Mini has built-in web search. */
const CHAT_MODEL = import.meta.env.VITE_GROQ_CHAT_MODEL || 'groq/compound-mini';

function resolveWorkspaceId(explicit) {
  if (explicit) return String(explicit).trim();
  try {
    return localStorage.getItem('marqq_workspace_id') || 'marqq-ws-1';
  } catch {
    return 'marqq-ws-1';
  }
}

/**
 * Ask Marqq chat via metered server endpoint (falls back to direct Groq if API down).
 * Returns { content, model, usedSearch, credits?, insufficientCredits? } or null on failure.
 */
export async function askMarqqCompound(messages, systemPrompt = '', opts = {}) {
  const workspaceId = resolveWorkspaceId(opts.workspaceId);
  const channel = opts.channel || null;

  try {
    const response = await fetch('/api/ask-marqq/chat/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        channel,
        systemPrompt,
        messages,
        model: CHAT_MODEL,
        temperature: 0.6,
        max_tokens: 2048,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 402 || data?.error === 'insufficient_credits') {
      return {
        content: '',
        model: CHAT_MODEL,
        usedSearch: false,
        insufficientCredits: true,
        estimatedCredits: data?.estimatedCredits,
        wallet: data?.wallet,
        credits: null,
      };
    }
    if (response.ok && data?.ok !== false && (data.content != null || data.ok)) {
      return {
        content: data.content || '',
        model: data.model || CHAT_MODEL,
        usedSearch: Boolean(data.usedSearch),
        executedTools: data.executedTools || [],
        credits: data.credits || null,
      };
    }
    console.warn('Ask Marqq metered API error:', data?.error || response.status);
  } catch (error) {
    console.warn('Ask Marqq metered API failed, trying direct Groq:', error?.message || error);
  }

  // Legacy direct Groq fallback (unmetered) when server unavailable
  if (!GROQ_API_KEY) return null;
  try {
    const payloadMessages = [];
    if (systemPrompt) {
      payloadMessages.push({ role: 'system', content: systemPrompt });
    }
    payloadMessages.push(...messages);

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: payloadMessages,
        temperature: 0.6,
        max_tokens: 2048,
      }),
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
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: payloadMessages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
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
- Name: ${companyInfo.companyName || 'Your company'}
- Website: ${companyInfo.website || 'not provided'}
- Industry Niche: ${companyInfo.niche || 'not provided'}
- Target ICP: ${companyInfo.icp || 'not provided'}
- Goal/Outcome: ${companyInfo.outcome || 'Grow qualified pipeline'}
- Target Window: ${companyInfo.timeWindow || '90 days'}
- Target Metric: ${companyInfo.target || 'to be defined'}

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
      const cleanJson = rawResult.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    }
  } catch (e) {
    console.warn('Groq onboarding parsing fallback used:', e);
  }

  return {
    brandSummary: `${companyInfo.companyName || 'This company'} — ${companyInfo.niche || 'B2B'} for ${companyInfo.icp || 'target buyers'}.`,
    positioningTags: ['Clear', 'Credible', 'Execution-focused'],
    primaryValueProp: `Drive ${companyInfo.target || 'the North Star'} in ${companyInfo.timeWindow || '90 days'}.`,
    recommendedChannels: ['LinkedIn', 'Owned content', 'Outbound'],
    topPillarStrategy: `${companyInfo.companyName || 'Company'} GTM acceleration`,
  };
}
