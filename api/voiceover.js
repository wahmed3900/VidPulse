const ALLOWED_VOICES = new Set([
  "JBFqnCBsd6RMkjVDRZzb", // George
  "pNInz6obpgDQGcFmaJgB", // Adam
  "21m00Tcm4TlvDq8ikWAM", // Rachel
]);
const MAX_INPUT_CHARS = 10000;

function cleanNarration(value) {
  return value
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/^\s*[-–•]\s*/gm, "")
    .replace(/^\s*(?:🎬|📌|📋|💡|🔔)?\s*(?:HOOK|INTRO|MAIN CONTENT|KEY TAKEAWAYS|CTA)\s*:?\s*/gim, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 6;
const requestWindows = globalThis.__vidpulseVoiceoverRequests || (globalThis.__vidpulseVoiceoverRequests = new Map());

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST to generate voiceover audio." });
  }

  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return res.status(403).json({ error: "Voiceover requests must come from the VidPulse site." });
      }
    } catch {
      return res.status(403).json({ error: "Invalid request origin." });
    }
  }

  const clientIp = String(req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  const now = Date.now();
  const recent = (requestWindows.get(clientIp) || []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Voiceover limit reached for this minute. Wait a moment, then try again." });
  }
  recent.push(now);
  requestWindows.set(clientIp, recent);

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "Voiceover is not configured yet. Add ELEVENLABS_API_KEY to the Vercel project environment variables, then redeploy." });
  }

  const { text: rawText, voice, speed, stability } = req.body || {};
  if (typeof rawText !== "string" || !rawText.trim()) {
    return res.status(400).json({ error: "Add a script before generating voiceover." });
  }
  if (rawText.length > MAX_INPUT_CHARS) {
    return res.status(413).json({ error: `This script is too long. Keep it under ${MAX_INPUT_CHARS.toLocaleString()} characters.` });
  }
  if (!ALLOWED_VOICES.has(voice)) {
    return res.status(400).json({ error: "Choose one of the available narrator voices." });
  }
  const text = cleanNarration(rawText);
  if (!text) return res.status(400).json({ error: "This script has no narration text after removing stage directions." });
  const pace = Number(speed);
  const voiceStability = Number(stability);
  if (!Number.isFinite(pace) || pace < 0.8 || pace > 1.2 || !Number.isFinite(voiceStability) || voiceStability < 0.2 || voiceStability > 0.8) {
    return res.status(400).json({ error: "Voice pace or expression setting is outside the supported range." });
  }

  try {
    const providerResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: voiceStability,
          similarity_boost: 0.75,
          style: 0.15,
          use_speaker_boost: true,
          speed: pace,
        },
      }),
    });

    if (!providerResponse.ok) {
      if (providerResponse.status === 401 || providerResponse.status === 403) {
        return res.status(502).json({ error: "The voice provider rejected its API key. Check ELEVENLABS_API_KEY in Vercel." });
      }
      if (providerResponse.status === 429) {
        return res.status(429).json({ error: "The voice provider is busy or your plan limit was reached. Check your ElevenLabs account and try again." });
      }
      if (providerResponse.status === 422) {
        return res.status(400).json({ error: "The selected voice could not read this script. Try another voice or simplify the text." });
      }
      return res.status(502).json({ error: "The voice provider could not generate audio right now. Please try again shortly." });
    }

    const audio = Buffer.from(await providerResponse.arrayBuffer());
    if (!audio.length) return res.status(502).json({ error: "The voice provider returned an empty audio file. Please try again." });
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", String(audio.length));
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", "attachment; filename=VidPulse-voiceover.mp3");
    return res.status(200).send(audio);
  } catch {
    return res.status(502).json({ error: "Could not reach the voice provider. Check your connection and try again." });
  }
};
