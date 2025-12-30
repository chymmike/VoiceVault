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
    READY: { text: 'Ready to record', class: 'ready', btnText: 'Start Recording', icon: 'mic' },
    RECORDING: { text: 'Recording...', class: 'recording', btnText: 'Stop Recording', icon: 'stop_circle' },
    PROCESSING: { text: 'Processing...', class: 'processing', btnText: 'Processing...', icon: 'hourglass_empty' }
};

// =============================================================================
// Timer State
// =============================================================================

const liveTimerEl = document.getElementById('liveTimer');
const todayTotalEl = document.getElementById('todayTotal');

let timerInterval = null;
let recordingStartTime = null;
let currentSessionSeconds = 0;

function getTodayKey() {
    const today = new Date();
    return `voicevault_${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function getTodaySeconds() {
    return parseInt(localStorage.getItem(getTodayKey()) || '0', 10);
}

function saveTodaySeconds(seconds) {
    localStorage.setItem(getTodayKey(), seconds.toString());
}

function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

function updateTodayDisplay() {
    todayTotalEl.textContent = formatTime(getTodaySeconds());
}

function startTimer() {
    recordingStartTime = Date.now();
    currentSessionSeconds = 0;
    liveTimerEl.textContent = '0:00';
    liveTimerEl.classList.remove('hidden');

    timerInterval = setInterval(() => {
        currentSessionSeconds = Math.floor((Date.now() - recordingStartTime) / 1000);
        liveTimerEl.textContent = formatTime(currentSessionSeconds);
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // Add to today's total
    const newTotal = getTodaySeconds() + currentSessionSeconds;
    saveTodaySeconds(newTotal);
    updateTodayDisplay();

    // Keep showing final time briefly, then hide
    setTimeout(() => {
        liveTimerEl.classList.add('hidden');
    }, 2000);

    return currentSessionSeconds;
}

// Initialize today's display on load
updateTodayDisplay();

function updateUI(state) {
    const config = UI_STATES[state];

    if (state === 'READY') {
        // Preserve Today stats in the status line (no parentheses, color difference is enough)
        const todayTime = formatTime(getTodaySeconds());
        statusEl.innerHTML = `${config.text} <span class="status-today"><span class="material-symbols-outlined icon-sm">schedule</span> Today: <span id="todayTotal">${todayTime}</span></span>`;
    } else {
        statusEl.textContent = config.text;
    }

    statusEl.className = `status ${config.class}`;
    recordBtn.querySelector('.btn-text').textContent = config.btnText;
    recordBtn.querySelector('.btn-icon').textContent = config.icon;
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
        startTimer();
        updateUI('RECORDING');
    } catch (err) {
        console.error('Failed to start recording:', err);
        alert('Microphone access denied. Please grant permission.');
    }
}

let lastSessionDuration = 0;

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        lastSessionDuration = stopTimer();
        updateUI('PROCESSING');
    }
}

// =============================================================================
// Upload & Display
// =============================================================================

async function uploadAudio(blob) {
    const formData = new FormData();
    formData.append('audio', blob, 'recording.webm');
    formData.append('duration', lastSessionDuration.toString());

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        displayResults(result);
    } catch (err) {
        console.error('Upload failed:', err);
        alert('Upload failed. Please try again.');
    } finally {
        updateUI('READY');
    }
}

function displayResults(result) {
    if (result.transcript) {
        transcriptEl.textContent = result.transcript;
    }
    if (result.feedback) {
        // Use marked.js to render Markdown
        feedbackEl.innerHTML = marked.parse(result.feedback);
    }
    if (result.saved_to) {
        savedPathEl.innerHTML = `<span class="material-symbols-outlined icon-sm">save</span> Saved to: <span class="clickable-path">${result.saved_to}</span>`;
        savedPathEl.style.cursor = 'pointer';
        savedPathEl.onclick = () => {
            fetch('/open-logs');
        };
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

// =============================================================================
// Side Panel Module (Tabs: Dictionary + Stats)
// =============================================================================

const sidePanel = document.getElementById('sidePanel');
const panelToggles = document.querySelector('.panel-toggles');
const panelToggleBtns = document.querySelectorAll('.panel-toggle-btn');
const panelTabs = document.querySelectorAll('.panel-tab');
const tabContents = document.querySelectorAll('.tab-content');
const headerStats = document.getElementById('headerStats');

// Dictionary elements
const dictInput = document.getElementById('dictInput');
const dictSearchBtn = document.getElementById('dictSearchBtn');
const dictResult = document.getElementById('dictResult');

// Stats elements
const streakCountEl = document.getElementById('streakCount');
const weeklyMinutesEl = document.getElementById('weeklyMinutes');
const heatmapGridEl = document.getElementById('heatmapGrid');

let dictAudio = null;

// Helper: Switch to a specific tab
function switchToTab(tabName) {
    // Update internal tabs
    panelTabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `${tabName}Tab`) {
            content.classList.add('active');
        }
    });
    const matchingTab = document.querySelector(`.panel-tab[data-tab="${tabName}"]`);
    if (matchingTab) matchingTab.classList.add('active');

    // Update toggle button active states
    panelToggleBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Load stats when switching to stats tab
    if (tabName === 'stats') {
        fetchAndRenderStats();
    }
}

// Toggle buttons (📖 and 📊)
panelToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        const isOpen = sidePanel.classList.contains('open');
        const currentTab = document.querySelector('.panel-tab.active')?.dataset.tab;

        if (isOpen && currentTab === tabName) {
            // Close if clicking same tab
            sidePanel.classList.remove('open');
            panelToggles.classList.remove('panel-open');
            panelToggleBtns.forEach(b => b.classList.remove('active'));
        } else {
            // Open and switch to tab
            sidePanel.classList.add('open');
            panelToggles.classList.add('panel-open');
            switchToTab(tabName);
            if (tabName === 'dictionary') {
                dictInput.focus();
            }
        }
    });
});

// Header stats click -> open Stats tab
headerStats.addEventListener('click', () => {
    sidePanel.classList.add('open');
    panelToggles.classList.add('panel-open');
    switchToTab('stats');
});

// Internal tab switching (inside panel)
panelTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        switchToTab(tab.dataset.tab);
    });
});

// Search triggers
dictSearchBtn.addEventListener('click', () => searchDictionary());
dictInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchDictionary();
});

async function searchDictionary() {
    const word = dictInput.value.trim().toLowerCase();
    if (!word) return;

    dictResult.innerHTML = '<p class="dict-loading"><span class="material-symbols-outlined">search</span> Looking up...</p>';

    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);

        if (!response.ok) {
            throw new Error('Word not found');
        }

        const data = await response.json();
        displayDictResult(data[0]);
    } catch (err) {
        dictResult.innerHTML = `<p class="dict-error"><span class="material-symbols-outlined">error</span> Word not found: "${word}"</p>`;
    }
}

function displayDictResult(entry) {
    // Find audio URL
    const audioUrl = entry.phonetics?.find(p => p.audio)?.audio || '';
    const phonetic = entry.phonetic || entry.phonetics?.[0]?.text || '';

    let html = `
        <div class="dict-entry">
            <div class="dict-word">${entry.word}</div>
            <div class="dict-phonetic">
                <span>${phonetic}</span>
                ${audioUrl ? `<button class="dict-audio-btn" onclick="playDictAudio('${audioUrl}')" title="Play pronunciation"><span class="material-symbols-outlined">volume_up</span></button>` : ''}
            </div>
    `;

    // Meanings by part of speech
    for (const meaning of entry.meanings || []) {
        html += `
            <div class="dict-meaning">
                <div class="dict-pos">${meaning.partOfSpeech}</div>
                <ul class="dict-definitions">
        `;

        // Limit to first 3 definitions per part of speech
        const defs = meaning.definitions?.slice(0, 3) || [];
        for (const def of defs) {
            html += `
                <li>
                    <div class="dict-def">${def.definition}</div>
                    ${def.example ? `<div class="dict-example">"${def.example}"</div>` : ''}
                </li>
            `;
        }

        html += `</ul></div>`;
    }

    html += `</div>`;
    dictResult.innerHTML = html;
}

// Global function for audio playback
window.playDictAudio = function (url) {
    // Fix protocol-relative URLs
    if (url.startsWith('//')) {
        url = 'https:' + url;
    }

    if (dictAudio) {
        dictAudio.pause();
    }
    dictAudio = new Audio(url);
    dictAudio.play().catch(err => console.error('Audio playback failed:', err));
};

// =============================================================================
// Stats & Heatmap Module
// =============================================================================

async function fetchAndRenderStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();

        // Update header stats
        streakCountEl.textContent = data.streak || 0;
        weeklyMinutesEl.textContent = data.weeklyMinutes || 0;

        // Render heatmap
        renderHeatmap(data.days || {});
    } catch (err) {
        console.error('Failed to fetch stats:', err);
    }
}

function renderHeatmap(daysData) {
    heatmapGridEl.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate the start of the current week (Monday)
    const dayOfWeek = today.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 6 days from Monday

    const thisWeekMonday = new Date(today);
    thisWeekMonday.setDate(today.getDate() - daysFromMonday);

    // Go back 11 more weeks (12 weeks total including current week)
    const startDate = new Date(thisWeekMonday);
    startDate.setDate(thisWeekMonday.getDate() - (11 * 7));

    // Generate 84 days (12 weeks)
    for (let i = 0; i < 84; i++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + i);

        const dateStr = cellDate.toISOString().split('T')[0];
        const dayData = daysData[dateStr];
        const sessions = dayData?.sessions || 0;
        const duration = dayData?.duration || 0;

        // Determine intensity level
        let level = 0;
        if (sessions >= 6) level = 4;
        else if (sessions >= 4) level = 3;
        else if (sessions >= 2) level = 2;
        else if (sessions >= 1) level = 1;

        // Format tooltip
        const displayDate = cellDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const mins = Math.floor(duration / 60);
        const secs = duration % 60;
        const durationStr = duration > 0 ? `${mins}m ${secs}s` : '0m';
        const tooltip = `${displayDate}: ${sessions} session${sessions !== 1 ? 's' : ''}, ${durationStr}`;

        // Create cell
        const cell = document.createElement('div');
        cell.className = `heatmap-cell level-${level}`;
        cell.dataset.tooltip = tooltip;

        // Dim future dates
        if (cellDate > today) {
            cell.style.opacity = '0.3';
        }

        heatmapGridEl.appendChild(cell);
    }
}

// Load stats on page load (for header)
fetchAndRenderStats();
