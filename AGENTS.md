# AGENT.md

## 專案概述

這是一個本地運行的英文口說練習 Web App，使用 Whisper 進行語音辨識，Gemini 提供 AI 反饋，並將記錄儲存為 Markdown 檔案。

**技術棧：**
- Backend: Python + Flask
- AI: Whisper (local) + Google Gemini API
- Frontend: HTML + JavaScript + Tailwind CSS
- Storage: Markdown files in `practice_logs/`

---

## 專案結構
```
english-speaking-practice/
├── app.py                 # Flask 主程式
├── requirements.txt       # Python 依賴
├── .env                   # API keys (不要提交到 git)
├── .gitignore
├── README.md
├── PRD.md
├── AGENT.md              # 本檔案
├── recordings/           # 暫存錄音檔
├── practice_logs/        # Markdown 記錄 (也是 Obsidian vault)
├── static/
│   ├── index.html        # 前端介面
│   ├── style.css
│   └── script.js
└── templates/            # Flask 模板 (如果需要)
```

---

## 開發指引

### 1. 環境設定

**必要步驟：**
```bash
# 建立虛擬環境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安裝依賴
pip install flask openai-whisper google-generativeai python-dotenv

# 建立 .env 檔案
echo "GEMINI_API_KEY=your_api_key_here" > .env
```

### 2. 核心功能實作

#### A. 語音錄製 (前端)
- 使用 `MediaRecorder API`
- 錄音格式：`audio/webm` 或 `audio/wav`
- 錄音結束後上傳到 `/upload` endpoint

#### B. Whisper 轉錄 (後端)
```python
import whisper

model = whisper.load_model("base")  # 首次執行會下載模型
result = model.transcribe("audio_file.wav")
transcript = result["text"]
```

**注意事項：**
- 模型載入較慢，建議在 Flask app 啟動時載入一次
- `base` model 適合日常使用（準確度 vs 速度平衡）

#### C. Gemini 分析 (後端)
```python
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-1.5-flash')

prompt = f"""
You are an experienced English speaking coach. Analyze this transcript:

"{transcript}"

Provide:
1. Grammar errors with corrections
2. Suggestions for more natural/native expressions
3. Brief encouraging comment

Keep it concise and actionable.
"""

response = model.generate_content(prompt)
feedback = response.text
```

#### D. Markdown 儲存 (後端)
```python
from datetime import datetime
import os

def save_to_markdown(transcript, feedback):
    os.makedirs("practice_logs", exist_ok=True)
    
    today = datetime.now().strftime("%Y-%m-%d")
    filepath = f"practice_logs/{today}.md"
    
    # 如果是當天第一次練習，加上日期標題
    if not os.path.exists(filepath):
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(f"# {today}\n\n")
    
    # Append 本次練習記錄
    with open(filepath, "a", encoding="utf-8") as f:
        time_now = datetime.now().strftime("%H:%M")
        f.write(f"## Practice Session - {time_now}\n\n")
        f.write(f"### User's Speech\n{transcript}\n\n")
        f.write(f"### AI Feedback\n{feedback}\n\n")
        f.write("---\n\n")
    
    return filepath
```

### 3. Flask API 端點

#### POST /upload
- 接收：音檔 (FormData)
- 處理：
  1. 儲存暫存檔到 `recordings/`
  2. Whisper 轉錄
  3. Gemini 分析
  4. 儲存 Markdown
  5. 刪除暫存檔
- 回傳：
```json
{
  "transcript": "...",
  "feedback": "...",
  "saved_to": "practice_logs/2025-12-25.md"
}
```

#### GET /
- 回傳前端 HTML 頁面

---

## Prompt 工程

### Gemini 的 System Prompt（關鍵）
```python
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
- Be concise and specific
- Prioritize the most impactful improvements
- Keep a friendly, supportive tone
- Don't overwhelm with too many corrections

Transcript:
{transcript}
"""
```

**調校指引給 AI Agent：**
- 如果 Gemini 回應太長 → 在 prompt 加 "Limit to 150 words"
- 如果建議不夠具體 → 強調 "Give concrete examples"
- 如果語氣太嚴厲 → 加強 "Be encouraging and supportive"

---

## 前端實作重點

### 錄音邏輯 (JavaScript)
```javascript
let mediaRecorder;
let audioChunks = [];

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  
  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };
  
  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    await uploadAudio(audioBlob);
    audioChunks = [];
  };
  
  mediaRecorder.start();
}

function stopRecording() {
  mediaRecorder.stop();
}

async function uploadAudio(blob) {
  const formData = new FormData();
  formData.append('audio', blob, 'recording.wav');
  
  const response = await fetch('/upload', {
    method: 'POST',
    body: formData
  });
  
  const result = await response.json();
  displayResults(result);
}
```

### UI 狀態管理
```javascript
const states = {
  READY: 'Ready to record',
  RECORDING: '🔴 Recording... (Click to stop)',
  PROCESSING: '⏳ Processing...',
  DONE: 'Ready to record'
};

function updateUI(state) {
  document.getElementById('status').textContent = states[state];
  // 更新按鈕狀態...
}
```

---

## 測試指引

### 手動測試清單

- [ ] 點擊錄音按鈕，麥克風權限正常請求
- [ ] 錄音 30 秒，轉錄結果準確
- [ ] AI 反饋包含文法修正和建議
- [ ] Markdown 檔案正確生成在 `practice_logs/`
- [ ] 同一天多次練習，記錄正確附加
- [ ] 瀏覽器重新整理後，可繼續使用

### 常見問題除錯

**問題：Whisper 轉錄太慢**
- 解決：降級使用 `tiny` model，或升級使用 `whisper.cpp`

**問題：瀏覽器無法錄音**
- 檢查：必須使用 HTTPS 或 localhost
- 檢查：使用者是否授予麥克風權限

**問題：Gemini API 超過限制**
- 檢查：是否超過 15 requests/min
- 解決：加入 rate limiting 或切換到付費版

---

## Git 提交規範
```bash
# 功能開發
git commit -m "feat: add Whisper transcription"

# Bug 修復
git commit -m "fix: resolve audio upload timeout"

# 文件更新
git commit -m "docs: update README with setup instructions"
```

---

## 部署指引（未來）

目前是本地運行，未來若要分享給他人：

1. **打包成獨立執行檔** (PyInstaller)
2. **Docker 容器化**
3. **提供詳細的 README 安裝步驟**

---

## 開源準備清單

- [ ] 完善 README (安裝步驟、使用說明)
- [ ] 加入 LICENSE (建議 MIT)
- [ ] 移除所有個人資料
- [ ] 加入 `.env.example` 範本
- [ ] 寫清楚 Gemini API key 申請流程
- [ ] 錄製示範影片或截圖

---

## AI Agent 協作提示

**當你（AI agent）修改程式碼時，請注意：**

1. **保持簡潔**：這是 MVP，避免過度設計
2. **註解清楚**：每個函數加上說明，方便未來擴充
3. **錯誤處理**：特別是 API 呼叫和檔案操作
4. **使用者體驗**：即使是 CLI 也要有清楚的狀態提示
5. **安全性**：API key 不要硬編碼，使用 .env

**如果遇到技術選擇：**
- 優先選擇簡單、穩定的方案
- 文件齊全的套件優先
- 效能 OK 就好，不必過度優化

**如果需要建議：**
- 明確告訴使用者有哪些選項和取捨
- 提供範例程式碼
- 標註「這是 MVP 做法，未來可以改進」