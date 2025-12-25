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
# Routes
# =============================================================================

@app.route('/')
def index():
    """Serve the main page"""
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/upload', methods=['POST'])
def upload_audio():
    """Handle audio upload and transcription"""
    
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
        
        # TODO: Sprint 4 - Gemini feedback
        feedback = "(AI feedback not implemented yet)"
        
        # TODO: Sprint 5 - Save to markdown
        saved_to = None
        
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
