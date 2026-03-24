# 🦇 Nazuna AI Companion

A highly customizable, local-first AI companion featuring **Nazuna Nanakusa** from *Call of the Night*. This project integrates an LLM "brain" via OpenAI, a real-time 3D VRM model, and a high-quality local voice pipeline using **RVC** (Retrieval-based Voice Conversion).

## 🚀 Step-by-Step Installation (Windows)

### 1. Prerequisites
Ensure you have the following installed on your machine:
*   **Node.js** (v18 or higher)
*   **Python 3.10.x** (Required for AI libraries)
*   **Git**

### 2. Permissions (Fix for "Scripts Disabled" Error)
If you encounter an error when running `npm`, open **PowerShell as Administrator** and run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Type `Y` and press Enter.

### 3. Setup the Project
Clone the repository and install the Node.js dependencies:
```powershell
git clone https://github.com/psychosyko/AI-Companion.git
cd AI-Companion
npm install
```

### 4. Setup the Python Voice Server
It is **critical** to use a virtual environment with Python 3.10 to avoid "ModuleNotFoundError" issues:

```powershell
# 1. Create the virtual environment using Python 3.10
py -3.10 -m venv venv

# 2. Activate the environment
.\venv\Scripts\activate

# 3. Install the requirements
pip install -r requirements.txt
```

### 5. Download the Voice Model (RVC)
To get the authentic Nazuna voice (Sora Amamiya):
1.  Go to the [Sora Amamiya RVC Repository](https://huggingface.co/orhay1/RVC_Amamiya_Sora/tree/main).
2.  Download **`Amamiya_Sora_rmvpe.zip`**.
3.  Create a folder in your project root named `RVC_Nazuna`.
4.  Extract the `.pth` and `.index` files into that folder.
5.  **Important:** Rename the files to:
    *   `AmamiyaSora.pth`
    *   `AmamiyaSora.index`

### 6. Add your API Key
1. Copy the example template to a real .env file
copy .env.example .env

2.  Paste your OpenAI key inside:
    ```env
    OPENAI_API_KEY=sk-proj-your-actual-key-here
    ```

---

## ⚙️ Configuration (`config.json`)

The `config.json` file allows you to modify her personality or swap models without touching code.

| Section | Description |
| :--- | :--- |
| **`character`** | Change `user_name`, 3D `vrm_path`, and `personality_prompt`. |
| **`voice_settings`** | Set RVC model paths, `base_voice`, and `save_voice_files`. |
| **`server_settings`** | Configure ports for the Bridge (3001) and Voice server (5000). |

---

## 🎮 Running the App

The easiest way to start Nazuna is by using the provided batch file:

1.  Double-click **`START.bat`**.
2.  Three windows will open:
    *   **The Voice Server:** Processes TTS.
    *   **The Bridge:** Connects AI logic and local memory.
    *   **The Frontend:** Launches the 3D interface.
3.  Your browser will open to `http://localhost:5173`.

---

## 🧠 Memory & Features

*   **Permanent Memory:** Nazuna learns facts about you (likes, hobbies) and saves them to `memory.json`.
*   **Chat History:** Conversations are saved locally to `chat_history.json`.
*   **Call Mode:** Click the microphone icon to enable "Hands-Free" mode for automatic voice responses.
*   **Emotion Engine:** Nazuna reacts with 3D expressions based on the context of your chat.

---

## ⚠️ Security Reminder
**Never commit your `.env` file to GitHub.** This repository includes a `.gitignore` to protect your sensitive API keys and personal memory files. 

---

*Enjoy the night, Psycho.* 🦇🌙