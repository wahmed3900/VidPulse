from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import edge_tts
import asyncio, tempfile, re, os
from moviepy.editor import AudioFileClip, ColorClip, TextClip, CompositeVideoClip

app = Flask(__name__)
CORS(app)

def clean_script(text):
    # Remove [ON SCREEN TEXT: ...] and [PAUSE ...] stage directions
    text = re.sub(r'\[.*?\]', '', text)
    # Remove markdown bold/italic (**word** or *word*)
    text = re.sub(r'\*{1,2}(.*?)\*{1,2}', r'\1', text)
    # Remove section headers with emojis and symbols
    text = re.sub(r'[^\w\s,.!?\'"-]', ' ', text)
    # Remove markdown bullet dashes at line start
    text = re.sub(r'^\s*[-–]\s*', '', text, flags=re.MULTILINE)
    # Collapse multiple blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Collapse multiple spaces
    text = re.sub(r' {2,}', ' ', text)
    return text.strip()

@app.route('/tts', methods=['POST'])
def tts():
    data = request.get_json()
    raw_text = data.get('text', '')
    voice = data.get('voice', 'en-US-AriaNeural')

    text = clean_script(raw_text)
    print(f"\n[TTS] Voice: {voice}")
    print(f"[TTS] Cleaned text preview: {text[:200]}...\n")

    async def generate():
        communicate = edge_tts.Communicate(text, voice)
        tmp = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
        await communicate.save(tmp.name)
        return tmp.name

    path = asyncio.run(generate())
    return send_file(path, mimetype='audio/mpeg', as_attachment=False)

@app.route('/generate-video', methods=['POST'])
def generate_video():
    data = request.get_json()
    raw_text = data.get('text', 'Hello from VidPulse')
    voice = data.get('voice', 'en-GB-RyanNeural')

    text = clean_script(raw_text)
    print(f"\n[VIDEO] Voice: {voice}")
    print(f"[VIDEO] Text preview: {text[:200]}...\n")

    # Use temp files so concurrent requests don't collide
    audio_tmp = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
    video_tmp = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
    audio_path = audio_tmp.name
    output_path = video_tmp.name
    audio_tmp.close()
    video_tmp.close()

    try:
        # 1. Generate TTS audio
        async def create_tts():
            communicate = edge_tts.Communicate(text, voice)
            await communicate.save(audio_path)

        asyncio.run(create_tts())

        # 2. Load audio to get exact duration
        audio_clip = AudioFileClip(audio_path)
        duration = audio_clip.duration

        # 3. Dark background clip
        background = ColorClip(size=(1280, 720), color=(20, 20, 30), duration=duration)

        # 4. Text overlay — first 120 chars of script, centered
        preview_text = text[:120] + ('...' if len(text) > 120 else '')
        txt_clip = (
            TextClip(preview_text, fontsize=38, color='white', size=(1100, None), method='caption')
            .set_duration(duration)
            .set_position('center')
        )

        # 5. Composite and attach audio
        video = CompositeVideoClip([background, txt_clip])
        final_video = video.set_audio(audio_clip)

        # 6. Render to MP4
        final_video.write_videofile(
            output_path, fps=24, codec='libx264', audio_codec='aac',
            logger=None  # suppress verbose moviepy output
        )

        return send_file(output_path, mimetype='video/mp4', as_attachment=True,
                         download_name='VidPulse-Generated.mp4')

    except Exception as e:
        print(f"[VIDEO ERROR] {e}")
        return jsonify({"error": str(e)}), 500

    finally:
        try:
            os.unlink(audio_path)
        except Exception:
            pass


if __name__ == '__main__':
    print("Edge TTS server running on http://localhost:5050")
    print("Routes: POST /tts  |  POST /generate-video")
    app.run(port=5050, debug=False)
