/**
 * Groq chat body helpers — family-aware reasoning_effort.
 * - gpt-oss: low | medium | high
 * - qwen3.6: none | default
 * - compound / compound-mini: no reasoning_effort (built-in web search)
 */

export function resolveGroqModel() {
  return process.env.GROQ_MODEL || "openai/gpt-oss-120b";
}

/** Auto GTM sections use Compound Mini so drafts can web-search the company. */
export function resolveGtmAutoSectionModel() {
  return process.env.GROQ_GTM_AUTO_MODEL || "groq/compound-mini";
}

export function isCompoundModel(model = resolveGroqModel()) {
  return /compound/i.test(String(model || ""));
}

export function isQwenReasoningModel(model = resolveGroqModel()) {
  return /qwen3/i.test(String(model || ""));
}

export function isGptOssModel(model = resolveGroqModel()) {
  return /gpt-oss/i.test(String(model || ""));
}

export function modelSupportsReasoningEffort(model = resolveGroqModel()) {
  if (isCompoundModel(model)) return false;
  return isQwenReasoningModel(model) || isGptOssModel(model);
}

/**
 * Resolve effort for the active model family.
 * Env GROQ_REASONING_EFFORT is coerced: medium/high/low → default on Qwen.
 */
export function resolveGroqReasoningEffort(model = resolveGroqModel()) {
  const raw = String(process.env.GROQ_REASONING_EFFORT || "").toLowerCase().trim();
  if (isCompoundModel(model)) return null;
  if (isQwenReasoningModel(model)) {
    if (raw === "none") return "none";
    // qwen only accepts none|default; treat medium/high/low/default/empty as "default"
    return "default";
  }
  if (isGptOssModel(model)) {
    if (["low", "medium", "high"].includes(raw)) return raw;
    return "medium";
  }
  return raw || "medium";
}

/** Merge reasoning_effort into a chat-completions body when the model supports it. */
export function withGroqReasoning(body = {}) {
  const model = body.model || resolveGroqModel();
  const out = { ...body, model };
  if (modelSupportsReasoningEffort(model)) {
    const requested = body.reasoning_effort
      ? String(body.reasoning_effort).toLowerCase().trim()
      : "";
    if (isQwenReasoningModel(model)) {
      out.reasoning_effort =
        requested === "none" ? "none" : requested === "default" ? "default" : resolveGroqReasoningEffort(model);
      // JSON mode cannot use reasoning_format=raw
      if (out.response_format && !out.reasoning_format) {
        out.reasoning_format = "parsed";
      }
      // Reasoning tokens count against completion budget; raise floor so JSON survives.
      if (out.reasoning_effort !== "none") {
        const floor = Number(process.env.GROQ_QWEN_MAX_TOKENS || 8192);
        const current = Number(out.max_tokens || out.max_completion_tokens || 0);
        out.max_tokens = Math.max(current || 0, floor);
      }
    } else {
      out.reasoning_effort = ["low", "medium", "high"].includes(requested)
        ? requested
        : resolveGroqReasoningEffort(model);
    }
  } else {
    delete out.reasoning_effort;
    delete out.reasoning_format;
  }
  return out;
}
