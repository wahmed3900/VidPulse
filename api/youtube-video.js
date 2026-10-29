// Vercel serverless function: api/youtube-video.js
// Set YOUTUBE_API_KEY in Vercel Project Settings > Environment Variables.
// Never put your API key in browser-side HTML.
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = String(req.query.id || "").trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return res.status(400).json({ error: "A valid 11-character YouTube video ID is required." });
  }

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: "YouTube API key is not configured. Add YOUTUBE_API_KEY in Vercel Environment Variables, then redeploy."
    });
  }

  try {
    const videoUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    videoUrl.search = new URLSearchParams({
      part: "snippet,statistics",
      id,
      key
    }).toString();

    const videoResponse = await fetch(videoUrl);
    const videoJson = await videoResponse.json();
    if (!videoResponse.ok) {
      return res.status(videoResponse.status).json({
        error: videoJson?.error?.message || "YouTube video lookup failed."
      });
    }

    const video = videoJson.items?.[0];
    if (!video) return res.status(404).json({ error: "Video not found, private, or unavailable through the public API." });

    const channelId = video.snippet?.channelId;
    let channel = null;
    if (channelId) {
      const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
      channelUrl.search = new URLSearchParams({
        part: "snippet,statistics",
        id: channelId,
        key
      }).toString();
      const channelResponse = await fetch(channelUrl);
      const channelJson = await channelResponse.json();
      if (channelResponse.ok) channel = channelJson.items?.[0] || null;
    }

    const thumbnails = video.snippet?.thumbnails || {};
    const channelThumbs = channel?.snippet?.thumbnails || {};
    return res.status(200).json({
      videoId: video.id,
      title: video.snippet?.title || "",
      channelTitle: video.snippet?.channelTitle || "",
      publishedAt: video.snippet?.publishedAt || null,
      thumbnail: thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || "",
      channelThumbnail: channelThumbs.high?.url || channelThumbs.medium?.url || channelThumbs.default?.url || "",
      viewCount: video.statistics?.viewCount ?? null,
      likeCount: video.statistics?.likeCount ?? null,
      commentCount: video.statistics?.commentCount ?? null,
      subscriberCount: channel?.statistics?.hiddenSubscriberCount ? null : (channel?.statistics?.subscriberCount ?? null)
    });
  } catch (error) {
    return res.status(500).json({ error: "Unexpected error retrieving YouTube data." });
  }
};
