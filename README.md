# VidPulse Pro — real YouTube public data patch

This patch changes the Analyze button so it fetches a real video's public metadata and statistics through a Vercel serverless API route. It does not replace your existing app with a new dashboard.

## Files
- `index.html`: patched copy of your pasted HTML.
- `api/youtube-video.js`: Vercel serverless function that calls the YouTube Data API without exposing the API key to the browser.

## Install
1. Back up your current project first.
2. Put the patched `index.html` at the same location as your current HTML file (usually the project root). If your actual entry file has another name, copy the changed `runCustomAnalysis()` function and the helper functions into that file instead.
3. Add `api/youtube-video.js` under an `api` folder at the Vercel project's root.
4. In Google Cloud Console, enable **YouTube Data API v3** and create an API key.
5. In Vercel → Project → Settings → Environment Variables, add `YOUTUBE_API_KEY` with the key value. Keep it server-side; do not put it in HTML or commit it to Git.
6. Redeploy, then paste a public YouTube URL or 11-character video ID and click Analyze.

## What is genuinely available
- Public video title, channel name, publish date, thumbnail, views, and usually likes/comments.
- Public channel subscriber count, unless hidden.

## What is not public for arbitrary videos
- CTR and impressions require authorization from the channel owner through YouTube Analytics.
- VPH needs at least two observations over time or another reliable historical source.
- Outlier multiplier needs a defensible comparison baseline.
- Public Data API does not provide historical daily views, so the chart switches to a single current-view-count point rather than pretending to show a real 28-day history.
- The viral score remains a simple title/metadata heuristic; it is not a YouTube prediction or official YouTube score.

## Important
The preset dropdown still contains demonstration presets. Use Analyze with a real URL to load live public data. Review the project's existing Vercel structure before replacing files so you don't overwrite API routes or other working code.


## Hosted AI voiceover

The Recording Studio can generate and download narrated MP3 audio through ElevenLabs. Add `ELEVENLABS_API_KEY` in Vercel → Project Settings → Environment Variables, then redeploy. The key stays server-side; the browser calls `/api/voiceover`.

Voice generation uses the ElevenLabs API and may consume paid account credits. Set a usage limit in the ElevenLabs account before sharing the public app. The endpoint accepts up to 10,000 characters per generation and applies a lightweight per-instance request limit.
