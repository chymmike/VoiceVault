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
    gemini_model = genai.GenerativeModel('gemini-2.5-flash')
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

def save_to_markdown(transcript: str, feedback: str, duration_seconds: int = 0) -> str:
    """Save practice session to markdown file"""
    os.makedirs('practice_logs', exist_ok=True)
    
    today = datetime.now().strftime('%Y-%m-%d')
    filepath = f'practice_logs/{today}.md'
    
    # If first session of the day, add date header
    if not os.path.exists(filepath):
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(f'# {today}\n\n')
    
    # Format duration
    mins = duration_seconds // 60
    secs = duration_seconds % 60
    duration_str = f"{mins}:{secs:02d}"
    
    # Append session
    with open(filepath, 'a', encoding='utf-8') as f:
        time_now = datetime.now().strftime('%H:%M')
        f.write(f'## Practice Session - {time_now} ({duration_str})\n\n')
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


@app.route('/open-logs')
def open_logs():
    """Open practice_logs folder in system file explorer"""
    import platform
    import subprocess
    
    logs_path = os.path.abspath('practice_logs')
    os.makedirs(logs_path, exist_ok=True)
    
    system = platform.system()
    if system == 'Darwin':      # macOS
        subprocess.run(['open', logs_path])
    elif system == 'Windows':
        subprocess.run(['explorer', logs_path])
    else:                       # Linux
        subprocess.run(['xdg-open', logs_path])
    
    return jsonify({'ok': True})


@app.route('/api/stats')
def get_stats():
    """Get practice statistics from markdown files"""
    import re
    from datetime import timedelta
    
    stats = {}
    logs_dir = 'practice_logs'
    
    if os.path.exists(logs_dir):
        for filename in os.listdir(logs_dir):
            if filename.endswith('.md'):
                date = filename.replace('.md', '')
                filepath = os.path.join(logs_dir, filename)
                
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Count sessions: ## Practice Session - HH:MM (M:SS)
                sessions = re.findall(r'## Practice Session - \d{2}:\d{2}(?: \((\d+):(\d{2})\))?', content)
                session_count = len(sessions)
                
                # Sum durations
                total_seconds = 0
                for match in sessions:
                    if match[0] and match[1]:  # Has duration
                        total_seconds += int(match[0]) * 60 + int(match[1])
                
                stats[date] = {
                    'sessions': session_count,
                    'duration': total_seconds
                }
    
    # Calculate streak (consecutive days ending today or yesterday)
    today = datetime.now().date()
    streak = 0
    check_date = today
    
    while True:
        date_str = check_date.strftime('%Y-%m-%d')
        if date_str in stats and stats[date_str]['sessions'] > 0:
            streak += 1
            check_date -= timedelta(days=1)
        else:
            # Allow starting from yesterday if no practice today yet
            if check_date == today and streak == 0:
                check_date -= timedelta(days=1)
                continue
            break
    
    # Calculate this week's minutes (Mon-Sun)
    week_start = today - timedelta(days=today.weekday())
    weekly_seconds = 0
    for i in range(7):
        date_str = (week_start + timedelta(days=i)).strftime('%Y-%m-%d')
        if date_str in stats:
            weekly_seconds += stats[date_str]['duration']
    
    return jsonify({
        'streak': streak,
        'weeklyMinutes': weekly_seconds // 60,
        'days': stats
    })


@app.route('/upload', methods=['POST'])
def upload_audio():
    """Handle audio upload, transcription, and AI feedback"""
    
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400
    
    audio_file = request.files['audio']
    duration = int(request.form.get('duration', 0))
    
    # Save to temp file
    os.makedirs('recordings', exist_ok=True)
    temp_filename = f"recordings/{uuid.uuid4()}.webm"
    audio_file.save(temp_filename)
    
    try:
        # Whisper transcription (本地)
        print(f"🎤 Transcribing: {temp_filename}")
        result = whisper_model.transcribe(temp_filename, language='en')
        transcript = result['text'].strip()
        print(f"📝 Transcript: {transcript[:100]}...")
        
        # Gemini feedback
        print("🤖 Getting AI feedback...")
        feedback = get_ai_feedback(transcript)
        print("✅ AI feedback received!")
        
        # Save to markdown (with duration)
        saved_to = save_to_markdown(transcript, feedback, duration)
        print(f"💾 Saved to: {saved_to}")
        
        return jsonify({
            'transcript': transcript,
            'feedback': feedback,
            'saved_to': saved_to,
            'duration': duration
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
    
    # Run server (set FLASK_DEBUG=1 for development)
    debug_mode = os.getenv('FLASK_DEBUG', '0') == '1'
    app.run(debug=debug_mode, port=5000)
