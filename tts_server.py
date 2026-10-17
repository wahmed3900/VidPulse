from flask import Flask, request, send_file
from flask_cors import CORS
import edge_tts
import asyncio, tempfile, re

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

if __name__ == '__main__':
    print("Edge TTS server running on http://localhost:5050")
    print("Paste this URL in your app: http://localhost:5050/tts")
    app.run(port=5050, debug=False)
