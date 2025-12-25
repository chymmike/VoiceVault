"""
VoiceVault - English Speaking Practice App
Flask 主程式
"""

import os
import uuid
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv
import whisper
import google.generativeai as genai

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='static')

# =============================================================================
# Whisper Model (載入一次，避免重複載入)
# =============================================================================

print("🔄 Loading Whisper model (base)...")
whisper_model = whisper.load_model("base")
print("✅ Whisper model loaded!")

# =============================================================================
# Gemini Configuration
# =============================================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    gemini_model = genai.GenerativeModel('gemini-1.5-flash')
    print("✅ Gemini API configured!")
else:
    gemini_model = None
    print("⚠️ GEMINI_API_KEY not found, AI feedback disabled")

COACH_PROMPT = """You are an experienced English speaking coach helping a non-native speaker improve.

Your student just practiced free-form speaking. Analyze the transcript and provide:

1. **Grammar Corrections** (top 2-3 errors only):
   - Show: Incorrect → Correct
   - Explain briefly why

2. **Natural Expression Suggestions**:
   - Identify 1-2 phrases that sound unnatural
   - Suggest how a native speaker would say it

3. **Encouragement**:
   - One sentence of positive reinforcement

Rules:
- Be concise and specific (limit to 150 words)
- Prioritize the most impactful improvements
- Keep a friendly, supportive tone
- Don't overwhelm with too many corrections

Transcript:
{transcript}
"""

def get_ai_feedback(transcript: str) -> str:
    """Get AI feedback from Gemini"""
    if not gemini_model:
        return "(Gemini API not configured - add GEMINI_API_KEY to .env)"
    
    try:
        prompt = COACH_PROMPT.format(transcript=transcript)
        response = gemini_model.generate_content(prompt)
        return response.text
    except Exception as e:
        print(f"❌ Gemini error: {e}")
        return f"(AI feedback error: {e})"

# =============================================================================
# Markdown Storage
# =============================================================================

def save_to_markdown(transcript: str, feedback: str) -> str:
    """Save practice session to markdown file"""
    os.makedirs('practice_logs', exist_ok=True)
    
    today = datetime.now().strftime('%Y-%m-%d')
    filepath = f'practice_logs/{today}.md'
    
    # If first session of the day, add date header
    if not os.path.exists(filepath):
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(f'# {today}\n\n')
    
    # Append session
    with open(filepath, 'a', encoding='utf-8') as f:
        time_now = datetime.now().strftime('%H:%M')
        f.write(f'## Practice Session - {time_now}\n\n')
        f.write(f'### User\'s Speech\n{transcript}\n\n')
        f.write(f'### AI Feedback\n{feedback}\n\n')
        f.write('---\n\n')
    
    return filepath

# =============================================================================
# Routes
# =============================================================================

@app.route('/')
def index():
    """Serve the main page"""
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/upload', methods=['POST'])
def upload_audio():
    """Handle audio upload, transcription, and AI feedback"""
    
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400
    
    audio_file = request.files['audio']
    
    # Save to temp file
    os.makedirs('recordings', exist_ok=True)
    temp_filename = f"recordings/{uuid.uuid4()}.webm"
    audio_file.save(temp_filename)
    
    try:
        # Whisper transcription
        print(f"🎤 Transcribing: {temp_filename}")
        result = whisper_model.transcribe(temp_filename, language='en')
        transcript = result['text'].strip()
        print(f"📝 Transcript: {transcript[:100]}...")
        
        # Gemini feedback
        print("🤖 Getting AI feedback...")
        feedback = get_ai_feedback(transcript)
        print("✅ AI feedback received!")
        
        # Save to markdown
        saved_to = save_to_markdown(transcript, feedback)
        print(f"💾 Saved to: {saved_to}")
        
        return jsonify({
            'transcript': transcript,
            'feedback': feedback,
            'saved_to': saved_to
        })
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({'error': str(e)}), 500
        
    finally:
        # Cleanup temp file
        if os.path.exists(temp_filename):
            os.remove(temp_filename)


# =============================================================================
# Main
# =============================================================================

if __name__ == '__main__':
    # Create necessary directories
    os.makedirs('recordings', exist_ok=True)
    os.makedirs('practice_logs', exist_ok=True)
    
    # Run dev server
    app.run(debug=True, port=5000)

