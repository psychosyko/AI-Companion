# 🦇 Nazuna AI Companion

A high-fidelity, local-first AI companion featuring **Nazuna Nanakusa** from *Call of the Night*. This project integrates a GPT-4o-mini "brain", a real-time 3D VRM model with procedural animations, and a customizable voice pipeline (Edge-TTS + RVC).

## 🚀 Step-by-Step Installation

### 1. Prerequisites
*   **Node.js** (v18 or higher)
*   **Python** (3.10.x recommended - required for RVC)
*   **OpenAI API Key** (for her "brain")

### 2. Core Setup
Clone the repository and install the Node.js dependencies:
```bash
git clone https://github.com/psychosyko/AI-Companion.git
cd ai-companion
npm install
```

### 3. Voice Server Setup (Python)
It is highly recommended to use a virtual environment:
```bash
# Create and activate venv
python -m venv venv
.\venv\Scripts\activate

# Install requirements
pip install -r requirements.txt
```

### 4. Downloading the Voice Model (Optional)
To use her authentic voice (Sora Amamiya), you need an RVC model:
1.  Download an RVC model (e.g., from [HuggingFace](https://huggingface.co/orhay1/RVC_Amamiya_Sora/tree/main)).
2.  Create a folder named `RVC_Nazuna` in the root directory.
3.  Place the `.pth` and `.index` files inside and ensure the names match `config.json`.

**Note:** If you have a slow machine, you can disable this in `config.json` by setting `"rvc_enabled": false`.

### 5. API Configuration
Initialize your environment file by copying the template, then add your OpenAI key:

**Windows:** `copy .env.example .env`  
**macOS/Linux:** `cp .env.example .env`

```env
OPENAI_API_KEY=sk-proj-your-actual-key-here
DISCORD_TOKEN=your_optional_bot_token_here
```

---

## ⚙️ Key Features

### 🧠 The Brain (Summarization & Memory)
Nazuna doesn't just remember facts; she understands the context of the night.
*   **Permanent Facts:** Learns your name, hobbies, and likes automatically via `[MEMORY]` tags.
*   **Background Summarization:** After 30 messages, she automatically condenses the history into a summary to keep API costs low and her memory sharp.

### 🎙️ The Voice (High Quality vs. Fast)
*   **RVC Mode:** (High CPU) Uses Retrieval-based Voice Conversion for 1:1 anime voice accuracy.
*   **Light Mode:** (Low CPU) Disable RVC in config to use high-quality Microsoft Neural voices directly. Nazuna will respond nearly instantly.

### 🎭 Visual Engine
*   **Procedural Animation:** Includes natural breathing, eye saccades (darting), and micro-expressions.
*   **State-Based Physics:** Her head and eyes follow you, but react differently when she is "thinking," "listening," or "talking."
*   **Lip-Sync:** Real-time analysis of the audio frequency moves her mouth accurately.

---

## 🎮 How to Run

1.  **Double-click `START.bat`**. 
    *   This will launch the Voice Server, the Logic Bridge, and the Frontend.
2.  Wait for the **"SUMMONING NAZUNA"** loading bar to hit 100%.
3.  **Click the Gear Icon (⚙️)** to view "Vampire Records" (Admin Panel) to manage what she knows about you.
4.  **Click the Microphone Icon** to enable "Hands-Free" mode.

---

## 🛠️ Customization (`config.json`)

| Setting | Description |
| :--- | :--- |
| `rvc_enabled` | Set to `false` for instant responses on slow PCs. |
| `base_voice` | Choose from various Microsoft Neural voices (e.g., `en-US-AvaMultilingualNeural`). |
| `personality_prompt` | Edit her core behavior and "vibe." |
| `temperature` | Increase (0.8+) for more creative teasing. |

---
*Enjoy the night, Psycho.* 🦇🌙