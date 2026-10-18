// api/generate.js — Vercel serverless AI endpoint
// Provider fallback: Groq → Gemini → Anthropic (fix)
// Keys live in Vercel env vars — never sent to the browser.

// ── Provider configs ──────────────────────────────────────────────────────────
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS = [
  process.env.GROQ_MODEL,
  "llama-3.3-70b-versatile",
  "llama3-70b-8192",
  "mixtral-8x7b-32768",
].filter(Boolean);

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5";

// ── Utilities ─────────────────────────────────────────────────────────────────
function extractJson(str) {
  if (!str) return null;
  const cleaned = str.replace(/```json\s*|```/gi, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

// ── Prompt builders ───────────────────────────────────────────────────────────
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
  return `You are a YouTube SEO expert. Analyze this video and suggest improvements.
Current title: "${title}"
${topic ? `Topic / notes: "${topic}"` : ""}
Reply with ONLY a JSON object in exactly this shape:
{
  "score": <integer 0-100>,
  "primaryKeyword": "<main search phrase>",
  "titles": ["<3 improved titles under 70 chars>"],
  "description": "<120-180 word YouTube description>",
  "tags": ["<12-15 tags>"],
  "hashtags": ["<3 hashtags>"],
  "tips": ["<4 specific actionable SEO tips>"]
}`;
}

function ideasPrompt({ niche, channel }) {
  return `You are a YouTube viral growth strategist. Generate 5 high-converting trending video ideas for niche: "${niche || 'YouTube Growth & Tech'}". Channel reference: "${channel || 'Growing Creator'}".
Reply with ONLY a JSON object:
{
  "ideas": [
    {
      "title": "<punchy title under 65 chars>",
      "predictedVph": 740,
      "competition": "Low",
      "searchVolume": "High",
      "hook": "<1 sentence hook>",
      "whyItWorks": "<brief explanation>"
    }
  ]
}`;
}

function keywordPrompt({ keyword }) {
  return `You are the vidIQ Keyword Inspector. Analyze the YouTube search query: "${keyword}".
Reply with ONLY a JSON object:
{
  "keyword": "${keyword}",
  "overallScore": 78,
  "searchVolume": "180,000 /mo",
  "competitionScore": 34,
  "competitionLabel": "Low",
  "topRankedChannels": ["vidIQ", "Think Media", "Film Booth"],
  "relatedKeywords": [
    { "keyword": "${keyword} tutorial", "volume": "95K", "score": 82, "competition": "Low" },
    { "keyword": "best ${keyword} 2026", "volume": "64K", "score": 75, "competition": "Low" },
    { "keyword": "how to use ${keyword}", "volume": "51K", "score": 68, "competition": "Medium" },
    { "keyword": "${keyword} for beginners", "volume": "42K", "score": 71, "competition": "Low" },
    { "keyword": "${keyword} vs alternative", "volume": "38K", "score": 65, "competition": "Medium" }
  ],
  "trendingQuestions": [
    "How does ${keyword} work in 2026?",
    "What is the best way to get started with ${keyword}?",
    "Can you make money with ${keyword}?"
  ],
  "strategyTip": "Target long-tail queries first and hook searchers within the first 10 seconds."
}`;
}

function competitorPrompt({ targetChannel, niche }) {
  return `You are the vidIQ YouTube competitor intelligence system. Analyze the competitive landscape for channel: "${targetChannel || 'vidIQ'}" in niche: "${niche || 'YouTube Creators & AI'}".
Reply with ONLY a JSON object:
{
  "target": "${targetChannel || 'vidIQ'}",
  "competitors": [
    { "name": "Think Media", "subs": "3.1M", "avgViews": "145K", "uploadRate": "3x / week", "threatLevel": "High", "topRecentTopic": "Best YouTube Equipment 2026" },
    { "name": "Film Booth", "subs": "450K", "avgViews": "110K", "uploadRate": "1x / week", "threatLevel": "Medium", "topRecentTopic": "The Secret Hook Formula" },
    { "name": "Channel Makers", "subs": "580K", "avgViews": "82K", "uploadRate": "2x / week", "threatLevel": "Medium", "topRecentTopic": "Algorithm Update Explained" },
    { "name": "Paddy Galloway", "subs": "720K", "avgViews": "320K", "uploadRate": "1x / month", "threatLevel": "High", "topRecentTopic": "MrBeast Retention Breakdown" }
  ],
  "breakoutFormat": {
    "titlePattern": "I Tested [Strategy] For 30 Days (Here Is What Happened)",
    "retentionSecret": "Visual pattern interrupt every 7 seconds combined with pacing acceleration."
  },
  "contentGaps": [
    "In-depth AI thumbnail A/B testing case studies",
    "Shorts-to-longform conversion funnel breakdowns",
    "Zero-budget editing setup tutorials for beginners"
  ],
  "benchmark": { "targetCtr": "7.8%", "targetRetention50": "4:45 min", "viewsPerSubRatio": "12.4%" }
}`;
}

function auditPrompt({ channelName }) {
  return `You are an elite YouTube channel audit engine. Conduct a health audit for channel "${channelName || 'Creator'}".
Reply with ONLY a JSON object:
{
  "channel": "${channelName || 'Creator'}",
  "healthScore": 79,
  "checklist": [
    { "item": "Title Length Under 60 chars", "status": "passed", "detail": "Optimal for mobile truncation and search clarity" },
    { "item": "First 5-Second Retention Hook", "status": "warning", "detail": "Branded intros cause an immediate 18% audience drop-off" },
    { "item": "Thumbnail Face/Text Contrast", "status": "passed", "detail": "High contrast ratio against YouTube dark mode" },
    { "item": "End Screen Binge-Loop Cards", "status": "critical", "detail": "Missing link to top-converting related playlist" },
    { "item": "Weekly Upload Regularity", "status": "passed", "detail": "Consistent publication pattern maintains algorithmic velocity" },
    { "item": "SEO-Optimized Description", "status": "warning", "detail": "Needs 150+ words targeting secondary keywords" }
  ],
  "thumbnailScore": 84,
  "titleSeoScore": 89,
  "retentionPacingScore": 71,
  "top3Fixes": [
    "Cut intros down to under 4 seconds — jump straight into the payoff.",
    "Add end-screen cards at the 95% mark to create a binge loop.",
    "Use high-contrast 3-word title phrases for mobile browse feed."
  ]
}`;
}

function trendsPrompt({ niche }) {
  return `You are the vidIQ Real-Time Trend Alert engine. Identify trending breakout topics for YouTube creators in niche: "${niche || 'Tech & AI'}".
Reply with ONLY a JSON object:
{
  "niche": "${niche || 'Tech & AI'}",
  "updatedAt": "Live Algorithm Scan",
  "trends": [
    {
      "topic": "Autonomous AI Agent Workflows for Creators",
      "vphVelocity": "+4,200 VPH",
      "viralMomentum": "Exploding",
      "bestAngle": "Step-by-step setup guide showing real earnings/results",
      "recommendedTags": ["#AIAgents", "#Automation", "#YouTubeGrowth"]
    },
    {
      "topic": "YouTube Algorithm Update: Watch Time vs Re-watches",
      "vphVelocity": "+2,850 VPH",
      "viralMomentum": "Rising Fast",
      "bestAngle": "Case study comparing 10 channels after the latest update",
      "recommendedTags": ["#YouTubeAlgorithm", "#CreatorTips", "#Algorithm2026"]
    },
    {
      "topic": "Micro-Shorts to Longform Funnel",
      "vphVelocity": "+1,940 VPH",
      "viralMomentum": "Rising Fast",
      "bestAngle": "How to convert 100k shorts views into 10k longform subscribers",
      "recommendedTags": ["#YouTubeShorts", "#ViralShorts", "#GrowFast"]
    },
    {
      "topic": "AI Voice Cloning Ethics & Monetization Rules",
      "vphVelocity": "+1,420 VPH",
      "viralMomentum": "Peaking",
      "bestAngle": "Clear explanation of YouTube's latest synthetic media disclosure rules",
      "recommendedTags": ["#AIVoice", "#Monetization", "#YouTubeRules"]
    }
  ]
}`;
}

function veoPrompt({ topic, script }) {
  return `You are an elite cinematic video director and AI prompt engineer for Google Veo 3 and Google Vids.
Video Topic: "${topic}"
Script reference: "${(script || topic).slice(0, 600)}"
Generate a 4-scene video generation storyboard with ultra-descriptive, cinematic text-to-video prompts tailored for Google Veo 3 and Google Vids.
Reply with ONLY a JSON object in this exact shape:
{
  "title": "${topic}",
  "scenes": [
    {
      "sceneNumber": 1,
      "segment": "Hook (0-5s)",
      "visualDescription": "Cinematic visual breakdown of what the viewer sees",
      "veoPrompt": "Photorealistic 4K cinematic footage: [ultra-detailed visual action, soft volumetric amber rim lighting, slow forward dolly with shallow depth of field, 35mm lens, atmospheric haze]",
      "motionInstruction": "Slow forward push-in with subtle handheld parallax and cinematic depth of field",
      "voiceoverLine": "1 punchy opening hook sentence matching this scene"
    },
    {
      "sceneNumber": 2,
      "segment": "Core Concept (5-20s)",
      "visualDescription": "High-interest demonstration or visual metaphor",
      "veoPrompt": "Photorealistic 4K cinematic shot: [dynamic angle, lighting, detailed environment, motion pace]",
      "motionInstruction": "Medium horizontal tracking shot with smooth motion blur",
      "voiceoverLine": "1 engaging explanation sentence"
    },
    {
      "sceneNumber": 3,
      "segment": "High-Stakes Climax (20-40s)",
      "visualDescription": "The dramatic payoff or turning point",
      "veoPrompt": "Photorealistic 4K cinematic macro shot: [high tension visual, dramatic backlighting, fast cinematic pan]",
      "motionInstruction": "Dynamic whip pan with speed ramp acceleration into sharp focus",
      "voiceoverLine": "1 dramatic revelation sentence"
    },
    {
      "sceneNumber": 4,
      "segment": "Conclusion & CTA (40-60s)",
      "visualDescription": "Inspiring closing scene with clear visual call to action",
      "veoPrompt": "Photorealistic 4K cinematic wide shot: [golden hour warm lighting, smooth camera crane up and away]",
      "motionInstruction": "Smooth crane pullback revealing wide horizon with warm sunset rays",
      "voiceoverLine": "1 memorable takeaway sentence urging viewer to subscribe"
    }
  ],
  "avatarPreset": {
    "recommendedPresenter": "Charismatic tech and creator educator",
    "voiceStyle": "Energetic, crisp, authoritative with natural pauses",
    "backdrop": "Modern minimalist creator studio with soft neon accent lighting"
  },
  "workspaceVidsTranscript": "Hook: [Hook line]\\n\\nScene 2: [Concept line]\\n\\nScene 3: [Payoff line]\\n\\nConclusion: [CTA line]"
}`;
}

// ── Provider callers ──────────────────────────────────────────────────────────
async function callGroq(prompt, json, maxTokens) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  for (const model of GROQ_MODELS) {
    try {
      const resp = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          temperature: json ? 0.6 : 0.8,
          ...(json && { response_format: { type: "json_object" } }),
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) return data.choices?.[0]?.message?.content || "";
      if (resp.status === 429) throw Object.assign(new Error("rate_limit"), { status: 429 });
      if (resp.status === 404 || resp.status === 400) continue; // try next model
      break;
    } catch (err) {
      if (err.status === 429) throw err;
    }
  }
  return null;
}

async function callGemini(prompt, maxTokens) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await fetch(GEMINI_URL(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (resp.status === 429) throw Object.assign(new Error("rate_limit"), { status: 429 });
  } catch (err) {
    if (err.status === 429) throw err;
    console.error("Gemini error:", err);
  }
  return null;
}

async function callAnthropic(prompt, maxTokens) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) return data.content?.[0]?.text || "";
    if (resp.status === 429) throw Object.assign(new Error("rate_limit"), { status: 429 });
    console.error("Anthropic error:", resp.status, data);
  } catch (err) {
    if (err.status === 429) throw err;
    console.error("Anthropic network error:", err);
  }
  return null;
}

async function callAI(prompt, json, maxTokens) {
  let content = await callGroq(prompt, json, maxTokens);
  if (content === null) content = await callGemini(prompt, maxTokens);
  if (content === null) content = await callAnthropic(prompt, maxTokens);
  return content; // null if all providers failed/missing
}

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const hasKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!hasKey) {
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
    json = true; maxTokens = 1200;
  } else if (task === "ideas") {
    prompt = ideasPrompt({ niche: clean(body.niche, 100), channel: clean(body.channel, 100) });
    json = true; maxTokens = 1500;
  } else if (task === "keyword") {
    const kw = clean(body.keyword, 100);
    if (!kw) return res.status(400).json({ error: "Please enter a keyword to inspect." });
    prompt = keywordPrompt({ keyword: kw });
    json = true; maxTokens = 1500;
  } else if (task === "competitor") {
    prompt = competitorPrompt({ targetChannel: clean(body.targetChannel, 100), niche: clean(body.niche, 100) });
    json = true; maxTokens = 1500;
  } else if (task === "audit") {
    prompt = auditPrompt({ channelName: clean(body.channelName, 100) || "My Channel" });
    json = true; maxTokens = 1500;
  } else if (task === "trends") {
    prompt = trendsPrompt({ niche: clean(body.niche, 100) });
    json = true; maxTokens = 1500;
  } else if (task === "veo") {
    const topic = clean(body.topic, 200) || "The High-Stakes Experiment";
    prompt = veoPrompt({ topic, script: clean(body.script, 1500) });
    json = true; maxTokens = 2000;
  } else {
    return res.status(400).json({ error: "Unknown task." });
  }

  try {
    const content = await callAI(prompt, json, maxTokens);

    if (content === null) {
      return res.status(502).json({ error: "AI service error. Please try again." });
    }

    if (!json) return res.status(200).json({ text: content });

    const parsed = extractJson(content);
    if (parsed) {
      return res.status(200).json({ [task]: parsed, data: parsed, seo: parsed, ideas: parsed });
    }
    return res.status(502).json({ error: "Couldn't read the AI response. Please try again." });

  } catch (err) {
    if (err.status === 429) {
      return res.status(429).json({ error: "Lots of people are using this right now — try again in a minute." });
    }
    console.error("Handler error:", err);
    return res.status(502).json({ error: "AI service error. Please try again." });
  }
};
