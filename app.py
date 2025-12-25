"""
VoiceVault - English Speaking Practice App
Flask 主程式
"""

import os
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='static')

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
    # TODO: Sprint 3 - Whisper transcription
    # TODO: Sprint 4 - Gemini feedback
    # TODO: Sprint 5 - Save to markdown
    return jsonify({
        'status': 'ok',
        'message': 'Upload endpoint ready (not implemented yet)'
    })


# =============================================================================
# Main
# =============================================================================

if __name__ == '__main__':
    # Create necessary directories
    os.makedirs('recordings', exist_ok=True)
    os.makedirs('practice_logs', exist_ok=True)
    
    # Run dev server
    app.run(debug=True, port=5000)
