/**
 * VoiceVault - Frontend JavaScript
 * Handles recording, upload, and UI updates
 */

// =============================================================================
// State
// =============================================================================

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// DOM Elements
const recordBtn = document.getElementById('recordBtn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const transcriptEl = document.getElementById('transcript');
const feedbackEl = document.getElementById('feedback');
const savedPathEl = document.getElementById('savedPath');

// =============================================================================
// UI State Management
// =============================================================================

const UI_STATES = {
    READY: { text: 'Ready to record', class: 'ready', btnText: 'Start Recording' },
    RECORDING: { text: '🔴 Recording...', class: 'recording', btnText: 'Stop Recording' },
    PROCESSING: { text: '⏳ Processing...', class: 'processing', btnText: 'Processing...' }
};

function updateUI(state) {
    const config = UI_STATES[state];
    statusEl.textContent = config.text;
    statusEl.className = `status ${config.class}`;
    recordBtn.querySelector('.btn-text').textContent = config.btnText;
    recordBtn.className = `record-btn ${config.class}`;
    recordBtn.disabled = state === 'PROCESSING';
}

// =============================================================================
// Recording Logic
// =============================================================================

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await uploadAudio(audioBlob);

            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        isRecording = true;
        updateUI('RECORDING');
    } catch (err) {
        console.error('Failed to start recording:', err);
        alert('無法存取麥克風，請確認已授予權限');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        updateUI('PROCESSING');
    }
}

// =============================================================================
// Upload & Display
// =============================================================================

async function uploadAudio(blob) {
    const formData = new FormData();
    formData.append('audio', blob, 'recording.webm');

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        displayResults(result);
    } catch (err) {
        console.error('Upload failed:', err);
        alert('上傳失敗，請重試');
    } finally {
        updateUI('READY');
    }
}

function displayResults(result) {
    if (result.transcript) {
        transcriptEl.textContent = result.transcript;
    }
    if (result.feedback) {
        feedbackEl.innerHTML = result.feedback.replace(/\n/g, '<br>');
    }
    if (result.saved_to) {
        savedPathEl.textContent = `💾 Saved to: ${result.saved_to}`;
    }

    resultsEl.classList.remove('hidden');
}

// =============================================================================
// Event Listeners
// =============================================================================

recordBtn.addEventListener('click', () => {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
});

// Initialize
updateUI('READY');
