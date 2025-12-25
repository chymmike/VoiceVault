# 🎙️ VoiceVault

一個本地運行的英文口說練習 App，使用 Whisper 進行語音辨識，Gemini 提供 AI 反饋，並將記錄儲存為 Markdown。

## ✨ 特色

- **本地語音辨識** - Whisper 在本地運行，隱私優先
- **AI 反饋** - Gemini 提供文法修正 + 道地表達建議
- **Markdown 記錄** - 所有練習自動存成 Markdown，可用 Obsidian 管理

## 🚀 快速開始

### 1. 安裝依賴

```bash
# 建立虛擬環境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安裝套件
pip install -r requirements.txt
```

### 2. 設定 API Key

```bash
cp .env.example .env
# 編輯 .env，填入你的 Gemini API Key
```

取得 API Key: https://aistudio.google.com/app/apikey

### 3. 啟動

```bash
python app.py
```

開啟瀏覽器訪問 http://localhost:5000

## 📁 專案結構

```
VoiceVault/
├── app.py              # Flask 主程式
├── requirements.txt    # Python 依賴
├── .env               # API keys (不要 commit)
├── static/
│   ├── index.html     # 前端頁面
│   ├── style.css      # 樣式
│   └── script.js      # 錄音邏輯
└── practice_logs/     # Markdown 記錄
```

## 📝 License

MIT
