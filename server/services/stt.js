/**
 * Speech-to-text via Groq Whisper.
 * Returns { transcript: string }.
 */
export async function transcribeSpeechWithGroq({ audioBase64, mimeType = "audio/webm", language = "en" }) {
  const apiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }
  if (!audioBase64) {
    throw new Error("audioBase64 is required");
  }

  const buffer = Buffer.from(String(audioBase64), "base64");
  if (!buffer.length) throw new Error("Empty audio payload");

  const ext = String(mimeType).includes("wav")
    ? "wav"
    : String(mimeType).includes("mp4") || String(mimeType).includes("m4a")
      ? "m4a"
      : String(mimeType).includes("mpeg") || String(mimeType).includes("mp3")
        ? "mp3"
        : "webm";

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType || "audio/webm" }), `audio.${ext}`);
  form.append("model", "whisper-large-v3");
  form.append("response_format", "json");
  form.append("language", language === "hi" ? "hi" : "en");
  form.append("temperature", "0");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const raw = await res.text();
  let json = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = { error: raw };
  }

  if (!res.ok) {
    throw new Error(json?.error?.message || json?.error || `Groq STT HTTP ${res.status}`);
  }

  const transcript = String(json.text || json.transcript || "").trim();
  return { transcript };
}
