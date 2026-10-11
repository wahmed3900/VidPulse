// Finds a stock clip (or photo) on Pexels for a search term, keeping the API key on the server.
// With ?url=, relays a Pexels media file so the browser can record it into a video.
const MEDIA_HOSTS = ["videos.pexels.com", "images.pexels.com"];
const MAX_RELAY_BYTES = 4 * 1024 * 1024; // stay under Vercel's response size limit

async function relay(url, res) {
    let parsed;
    try { parsed = new URL(url); } catch { res.status(400).json({ error: "Bad url" }); return; }
    if (parsed.protocol !== "https:" || !MEDIA_HOSTS.includes(parsed.hostname)) {
        res.status(400).json({ error: "Only Pexels media can be relayed" });
        return;
    }
    const upstream = await fetch(parsed);
    if (!upstream.ok) { res.status(502).json({ error: `Pexels returned ${upstream.status}` }); return; }
    const size = Number(upstream.headers.get("content-length") || 0);
    if (size > MAX_RELAY_BYTES) { res.status(413).json({ error: "File too large to relay" }); return; }
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.length > MAX_RELAY_BYTES) { res.status(413).json({ error: "File too large to relay" }); return; }
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(200).send(body);
}

// Smallest MP4 that is still at least targetWidth wide, else the largest available.
function pickVideoFile(files, targetWidth) {
    const mp4s = files.filter(f => f.file_type === "video/mp4" && f.link && f.width);
    const bigEnough = mp4s.filter(f => f.width >= targetWidth).sort((a, b) => a.width - b.width);
    return bigEnough[0] || mp4s.sort((a, b) => b.width - a.width)[0] || null;
}

module.exports = async (req, res) => {
    const { q, orientation = "portrait", url } = req.query || {};
    try {
        if (url) { await relay(url, res); return; }

        const key = process.env.PEXELS_API_KEY;
        if (!key) { res.status(500).json({ error: "PEXELS_API_KEY is not set in Vercel" }); return; }
        if (!q || typeof q !== "string" || q.length > 100) { res.status(400).json({ error: "Missing search term" }); return; }
        const orient = orientation === "landscape" ? "landscape" : "portrait";
        const targetWidth = orient === "portrait" ? 720 : 1280;
        const headers = { Authorization: key };
        const query = encodeURIComponent(q);

        const videos = await fetch(`https://api.pexels.com/videos/search?query=${query}&orientation=${orient}&per_page=10`, { headers });
        if (videos.ok) {
            const data = await videos.json();
            const candidates = (data.videos || [])
                .map(v => ({ v, file: pickVideoFile(v.video_files || [], targetWidth) }))
                .filter(c => c.file);
            if (candidates.length) {
                const { v, file } = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
                res.status(200).json({ type: "video", url: file.link, poster: v.image, credit: v.user?.name || "Pexels" });
                return;
            }
        } else if (videos.status === 401 || videos.status === 403) {
            res.status(500).json({ error: "Pexels rejected the API key" });
            return;
        }

        const photos = await fetch(`https://api.pexels.com/v1/search?query=${query}&orientation=${orient}&per_page=10`, { headers });
        if (photos.ok) {
            const data = await photos.json();
            const list = data.photos || [];
            if (list.length) {
                const p = list[Math.floor(Math.random() * Math.min(5, list.length))];
                res.status(200).json({ type: "image", url: orient === "portrait" ? p.src.portrait : p.src.landscape, credit: p.photographer || "Pexels" });
                return;
            }
        }
        res.status(404).json({ error: "No stock media found" });
    } catch (err) {
        res.status(502).json({ error: `Pexels lookup failed: ${err.message}` });
    }
};
