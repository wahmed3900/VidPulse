// Text-to-speech using Microsoft Edge's Read Aloud voices (free, no API key).
// Runs server-side because Microsoft only allows the Edge browser to call it directly.
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

const VOICES = new Set([
    "en-US-AndrewNeural", "en-US-AvaNeural", "en-US-BrianNeural", "en-US-EmmaNeural",
    "en-US-GuyNeural", "en-US-JennyNeural", "en-US-AriaNeural", "en-US-ChristopherNeural",
    "en-GB-RyanNeural", "en-GB-SoniaNeural", "en-AU-WilliamNeural", "en-AU-NatashaNeural",
    "en-IN-PrabhatNeural", "en-IN-NeerjaNeural"
]);
const MAX_CHARS = 5000; // the Recording Studio sends the whole script at once
const TIMEOUT_MS = 50000;

function escapeXml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function collect(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const timer = setTimeout(() => reject(new Error("Timed out waiting for audio")), TIMEOUT_MS);
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", (err) => { clearTimeout(timer); reject(err); });
        stream.on("close", () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
    });
}

module.exports = async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Use POST" });
        return;
    }
    const { text, voice = "en-US-AndrewNeural", rate = "+0%" } = req.body || {};
    if (typeof text !== "string" || !text.trim() || text.length > MAX_CHARS) {
        res.status(400).json({ error: `Text must be 1-${MAX_CHARS} characters` });
        return;
    }
    if (!VOICES.has(voice)) {
        res.status(400).json({ error: "Unknown voice" });
        return;
    }
    if (!/^[+-]\d{1,2}%$/.test(rate)) {
        res.status(400).json({ error: "Rate must look like +10% or -5%" });
        return;
    }

    const tts = new MsEdgeTTS();
    try {
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const { audioStream } = tts.toStream(escapeXml(text.trim()), { rate });
        const audio = await collect(audioStream);
        if (!audio.length) throw new Error("No audio returned");
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.status(200).send(audio);
    } catch (err) {
        res.status(502).json({ error: `Voice generation failed: ${err.message}` });
    } finally {
        tts.close();
    }
};
