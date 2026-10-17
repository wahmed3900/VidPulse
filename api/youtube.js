// Vercel serverless function: api/youtube-video.js
// Works without a YouTube API key using the free oEmbed fallback.
// For real view/like/subscriber counts, add YOUTUBE_API_KEY in Vercel env vars.

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = String(req.query.id || "").trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return res.status(400).json({ error: "A valid 11-character YouTube video ID is required." });
  }

  const key = process.env.YOUTUBE_API_KEY;

  // ── Path A: YouTube Data API (full stats, requires key) ───────────────────
  if (key) {
    try {
      const videoUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      videoUrl.search = new URLSearchParams({ part: "snippet,statistics", id, key }).toString();

      const videoResponse = await fetch(videoUrl);
      const videoJson = await videoResponse.json();

      if (!videoResponse.ok) {
        // Key is invalid or quota hit — fall through to oEmbed
        console.warn("YouTube API error, falling back to oEmbed:", videoJson?.error?.message);
      } else {
        const video = videoJson.items?.[0];
        if (!video) return res.status(404).json({ error: "Video not found or unavailable." });

        const channelId = video.snippet?.channelId;
        let channel = null;
        if (channelId) {
          const chUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
          chUrl.search = new URLSearchParams({ part: "snippet,statistics", id: channelId, key }).toString();
          const chResp = await fetch(chUrl);
          const chJson = await chResp.json();
          if (chResp.ok) channel = chJson.items?.[0] || null;
        }

        const thumbs = video.snippet?.thumbnails || {};
        const chThumbs = channel?.snippet?.thumbnails || {};
        return res.status(200).json({
          videoId: video.id,
          title: video.snippet?.title || "",
          channelTitle: video.snippet?.channelTitle || "",
          publishedAt: video.snippet?.publishedAt || null,
          thumbnail: thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || "",
          channelThumbnail: chThumbs.high?.url || chThumbs.medium?.url || chThumbs.default?.url || "",
          viewCount: video.statistics?.viewCount ?? null,
          likeCount: video.statistics?.likeCount ?? null,
          commentCount: video.statistics?.commentCount ?? null,
          subscriberCount: channel?.statistics?.hiddenSubscriberCount ? null : (channel?.statistics?.subscriberCount ?? null),
          source: "youtube_api",
        });
      }
    } catch (err) {
      console.warn("YouTube API fetch failed, falling back to oEmbed:", err.message);
    }
  }

  // ── Path B: Free oEmbed fallback (no key, basic data only) ───────────────
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(id)}&format=json`;
    const oembedResp = await fetch(oembedUrl);

    if (!oembedResp.ok) {
      return res.status(404).json({ error: "Video not found, private, or unavailable." });
    }

    const oembed = await oembedResp.json();

    // Build best-quality thumbnail URL from known YouTube CDN pattern
    const thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    return res.status(200).json({
      videoId: id,
      title: oembed.title || "",
      channelTitle: oembed.author_name || "",
      publishedAt: null,           // not available without API key
      thumbnail,
      channelThumbnail: "",        // not available without API key
      viewCount: null,             // not available without API key
      likeCount: null,
      commentCount: null,
      subscriberCount: null,
      source: "oembed_fallback",   // lets the frontend know stats are unavailable
    });
  } catch (err) {
    return res.status(500).json({ error: "Could not retrieve video data. Check the video ID and try again." });
  }
}
