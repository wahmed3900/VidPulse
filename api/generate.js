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

function ideasPrompt({ niche, channel }) {
  return `You are a YouTube viral growth strategist from vidIQ. Generate 5 high-converting, trending Daily Video Ideas for YouTube creators in the niche: "${niche || 'YouTube Growth & Tech'}".
Target Channel reference: "${channel || 'Growing Creator'}".

Reply with ONLY a JSON object in this exact shape:
{
  "ideas": [
    {
      "title": "<punchy, click-worthy YouTube title under 65 chars>",
      "predictedVph": 740,
      "competition": "Low",
      "searchVolume": "High",
      "hook": "<1 sentence hook for first 5 seconds>",
      "whyItWorks": "<brief explanation based on YouTube algorithm psychology>"
    }
  ]
}`;
}

function keywordPrompt({ keyword }) {
  return `You are the vidIQ Keyword Inspector algorithm. Analyze the YouTube search query: "${keyword}".
Provide comprehensive search intelligence.

Reply with ONLY a JSON object in this exact shape:
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
    "How does ${keyword} actually work in 2026?",
    "What is the best way to get started with ${keyword}?",
    "Can you make money with ${keyword}?"
  ],
  "strategyTip": "Target long-tail queries first and hook searchers within the first 10 seconds to maximize your YouTube search rank."
}`;
}

function competitorPrompt({ targetChannel, niche }) {
  return `You are the vidIQ YouTube competitor intelligence system. Analyze the competitive landscape for channel: "${targetChannel || 'vidIQ'}" in niche: "${niche || 'YouTube Creators & AI'}".

Reply with ONLY a JSON object in this exact shape:
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
  "benchmark": {
    "targetCtr": "7.8%",
    "targetRetention50": "4:45 min",
    "viewsPerSubRatio": "12.4%"
  }
}`;
}

function auditPrompt({ channelName, videoCount, avgViews }) {
  return `You are an elite YouTube channel audit engine by vidIQ. Conduct a performance and health audit for channel "${channelName || 'Creator'}".

Reply with ONLY a JSON object in this exact shape:
{
  "channel": "${channelName || 'Creator'}",
  "healthScore": 79,
  "checklist": [
    { "item": "Title Length Under 60 chars", "status": "passed", "detail": "Optimal for mobile truncation and search clarity" },
    { "item": "First 5-Second Retention Hook", "status": "warning", "detail": "Branded intros cause an immediate 18% audience drop-off" },
    { "item": "Thumbnail Face/Text Contrast", "status": "passed", "detail": "High contrast ratio against YouTube dark mode" },
    { "item": "End Screen Binge-Loop Cards", "status": "critical", "detail": "Missing link to top-converting related playlist" },
    { "item": "Weekly Upload Regularity", "status": "passed", "detail": "Consistent publication pattern maintains algorithmic velocity" },
    { "item": "SEO-Optimized Description", "status": "warning", "detail": "Needs 150+ words in the initial paragraph targeting secondary keywords" }
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
  return `You are the vidIQ Real-Time Trend Alert engine. Scan current trending search velocity and breakout topics for YouTube creators in niche: "${niche || 'Tech & AI'}".

Reply with ONLY a JSON object in this exact shape:
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
  } else if (task === "ideas") {
    prompt = ideasPrompt({ niche: clean(body.niche, 100), channel: clean(body.channel, 100) });
    json = true;
    maxTokens = 1500;
  } else if (task === "keyword") {
    const kw = clean(body.keyword, 100);
    if (!kw) return res.status(400).json({ error: "Please enter a keyword to inspect." });
    prompt = keywordPrompt({ keyword: kw });
    json = true;
    maxTokens = 1500;
  } else if (task === "competitor") {
    prompt = competitorPrompt({ targetChannel: clean(body.targetChannel, 100), niche: clean(body.niche, 100) });
    json = true;
    maxTokens = 1500;
  } else if (task === "audit") {
    prompt = auditPrompt({
      channelName: clean(body.channelName, 100) || "My Channel",
      videoCount: body.videoCount || 50,
      avgViews: body.avgViews || "15K"
    });
    json = true;
    maxTokens = 1500;
  } else if (task === "trends") {
    prompt = trendsPrompt({ niche: clean(body.niche, 100) });
    json = true;
    maxTokens = 1500;
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
      const parsed = JSON.parse(content);
      return res.status(200).json({ [task]: parsed, data: parsed, seo: parsed });
    } catch {
      return res.status(502).json({ error: "Couldn't read the AI response. Please try again." });
    }
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "Couldn't reach the AI service. Please try again." });
  }
};
