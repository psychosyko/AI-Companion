Here is the comprehensive **README.md** file for your project. You can copy this directly into a new file named `README.md` in your project root.

---

# 🦇 Nazuna AI Companion

A highly customizable, local-first AI companion featuring **Nazuna Nanakusa** from *Call of the Night*. This project integrates an LLM "brain" via OpenAI, a real-time 3D VRM model, and a high-quality local voice pipeline using **RVC** (Retrieval-based Voice Conversion).

---

## 🚀 Step-by-Step Installation

### 1. Prerequisites
Ensure you have the following installed on your Windows machine:
*   **Node.js** (v18 or higher)
*   **Python** (3.10.x recommended)
*   **Git**

### 2. Setup the Project
Clone the repository and install the Node.js dependencies for the bridge and frontend:
```bash
git clone https://github.com/YOUR_USERNAME/Nazuna-AI.git
cd Nazuna-AI
npm install
```

### 3. Setup the Python Voice Server
It is highly recommended to use a virtual environment to keep your global Python install clean:
```bash
# Create the virtual environment
python -m venv venv

# Activate the environment
.\venv\Scripts\activate

# Install the required libraries
pip install -r requirements.txt
```

### 4. Download the Voice Model (RVC)
To get the authentic Nazuna voice (Sora Amamiya), follow these steps:
1.  Go to the [Sora Amamiya RVC Repository](https://huggingface.co/orhay1/RVC_Amamiya_Sora/tree/main).
2.  Download **`Amamiya_Sora_rmvpe.zip`**.
3.  Create a folder in your project root named `RVC_Nazuna`.
4.  Extract the `.pth` and `.index` files into that folder.
5.  **Important:** Ensure the filenames in the folder match the paths defined in your `config.json`. (e.g., Rename them to `AmamiyaSora.pth` and `AmamiyaSora.index`).

### 5. Add your API Key
For security, your API key is stored in a hidden `.env` file rather than the source code:
1.  Create a file named **`.env`** in the root folder.
2.  Paste your OpenAI key inside:
    ```env
    OPENAI_API_KEY=sk-proj-your-actual-key-here
    ```

---

## ⚙️ Configuration (`config.json`)

The `config.json` file is the central hub for the app. You can modify it to change her personality or swap her models without touching the code.

| Section | Description |
| :--- | :--- |
| **`character`** | Change the `user_name`, 3D `vrm_path`, and the detailed `personality_prompt`. |
| **`voice_settings`** | Set the RVC model paths, change the `base_voice`, or toggle `save_voice_files`. |
| **`server_settings`** | Configure the ports for the Node bridge (3001) and Voice server (5000). |

### Swapping Characters
*   **To change the 3D model:** Place a new `.vrm` file in the `/public` folder and update `vrm_path` in the config.
*   **To change the voice:** Place your new RVC `.pth` and `.index` files in a folder and update the paths in `voice_settings`.

---

## 🎮 Running the App

The easiest way to start Nazuna is by using the provided batch file:

1.  Double-click **`START_NAZUNA.bat`**.
2.  Three windows will open:
    *   **The Voice Server:** Handles the RVC processing.
    *   **The Bridge:** Connects the AI logic and local memory.
    *   **The Frontend:** Launches the 3D interface.
3.  Your browser will open to `http://localhost:5173`.

---

## 🧠 Memory & Features

*   **Permanent Memory:** Nazuna learns facts about you (likes, hobbies, job) and saves them to `memory.json`. She will remember these even after you restart the app.
*   **Chat History:** Conversations are saved to `chat_history.json` on your disk, not in the browser.
*   **Call Mode:** Click the microphone icon to enable "Hands-Free" mode. You can talk to her, and she will respond automatically whenever you stop speaking.
*   **Emotion Engine:** Nazuna reacts with 3D expressions (Happy, Relaxed, Surprised) based on the context of the chat.

---

## ⚠️ Security Reminder
**Never commit your `.env` file to GitHub.** This repository includes a `.gitignore` to protect your `memory.json` and `.env` files from being uploaded. 

---

*Enjoy the night, Psycho.* 🦇🌙