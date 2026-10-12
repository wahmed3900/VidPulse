// Server-side AI endpoint. The Groq key lives in the GROQ_API_KEY env var on
// Vercel, so customers never need their own key. Prompts are built here (not
// sent from the browser) so this can't be used as an open LLM proxy.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

const STYLES = {
  tutorial: "tutorial-style with step-by-step instructions",
  explainer: "explainer video that breaks down complex ideas simply",
  shorts: "YouTube Shorts under 60 seconds — hook in the first 3 seconds, fast-paced",
  vlog: "personal vlog-style, conversational and engaging",
  review: "product or topic review with pros/cons and a verdict",
};

const DURATIONS = {
  "1": "approximately 1 minute (150-200 words)",
  "3": "approximately 3 minutes (450-500 words)",
  "5": "approximately 5 minutes (750-800 words)",
  "10": "approximately 10 minutes (1500-1600 words)",
  "15": "approximately 15 minutes (2200-2400 words)",
};

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function scriptPrompt({ topic, style, duration }) {
  return `You are an expert YouTube scriptwriter. Write a complete, engaging ${STYLES[style] || STYLES.tutorial} script about: "${topic}".
Duration: ${DURATIONS[duration] || DURATIONS["3"]}.
Structure the script with:
1. 🎬 HOOK (first 5-10 seconds — grab attention immediately)
2. 📌 INTRO (briefly tell viewers what they'll learn)
3. 📋 MAIN CONTENT (the core of the video with clear sections)
4. 💡 KEY TAKEAWAYS (brief summary)
5. 🔔 CTA (subscribe/like/comment call to action)
Make it conversational, punchy, and optimized for YouTube retention. Use [PAUSE], [B-ROLL: description], and [ON SCREEN TEXT: …] cues where helpful. Write directly — no meta-commentary, just the script.`;
}

function seoPrompt({ title, topic }) {
  return `You are a YouTube SEO expert. Analyze this video and suggest improvements for YouTube search and suggested-video traffic.
Current title: "${title}"
${topic ? `Topic / notes: "${topic}"` : ""}

Reply with ONLY a JSON object in exactly this shape:
{
  "score": <integer 0-100 rating the current title's SEO>,
  "primaryKeyword": "<the main search phrase to target>",
  "titles": ["<3 improved titles, each under 70 characters, keyword near the start>"],
  "description": "<a 120-180 word YouTube description: keyword in the first sentence, 2-3 timestamp placeholders like 0:00 Intro, and a subscribe CTA>",
  "tags": ["<12-15 tags, mix of broad and long-tail>"],
  "hashtags": ["<3 hashtags starting with #>"],
  "tips": ["<4 short, specific, actionable SEO tips for this video>"]
}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "AI is not configured yet. Please try again later." });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const task = body.task;
  let prompt, json = false, maxTokens = 2048;

  if (task === "script") {
    const topic = clean(body.topic, 200);
    if (!topic) return res.status(400).json({ error: "Please enter a video topic." });
    prompt = scriptPrompt({ topic, style: body.style, duration: String(body.duration) });
  } else if (task === "seo") {
    const title = clean(body.title, 150);
    if (!title) return res.status(400).json({ error: "Please enter a video title." });
    prompt = seoPrompt({ title, topic: clean(body.topic, 300) });
    json = true;
    maxTokens = 1200;
  } else {
    return res.status(400).json({ error: "Unknown task." });
  }

  try {
    const resp = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: json ? 0.6 : 0.8,
        ...(json && { response_format: { type: "json_object" } }),
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("Groq error", resp.status, data);
      const busy = resp.status === 429;
      return res.status(busy ? 429 : 502).json({
        error: busy ? "Lots of people are using this right now — try again in a minute." : "AI service error. Please try again.",
      });
    }
    const content = data.choices?.[0]?.message?.content || "";
    if (!json) return res.status(200).json({ text: content });
    try {
      return res.status(200).json({ seo: JSON.parse(content) });
    } catch {
      return res.status(502).json({ error: "Couldn't read the AI response. Please try again." });
    }
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "Couldn't reach the AI service. Please try again." });
  }
};
