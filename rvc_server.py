import os
import json
import torch
import uuid
import asyncio
import edge_tts
import shutil
import io
import time
from rvc_python.infer import RVCInference
from flask import Flask, request, send_file

# --- 1. PYTORCH SECURITY BYPASS ---
original_load = torch.load
def patched_torch_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return original_load(*args, **kwargs)
torch.load = patched_torch_load

# --- 2. INITIALIZATION & CONFIG ---
app = Flask(__name__)

with open('config.json', 'r') as f:
    config = json.load(f)

VOICE_SETTINGS = config['voice_settings']
RVC_ENABLED = VOICE_SETTINGS.get('rvc_enabled', True) # Get the toggle
MODEL_PATH = os.path.abspath(VOICE_SETTINGS['rvc_model_path'])
INDEX_PATH = os.path.abspath(VOICE_SETTINGS['rvc_index_path'])
SAVE_LOGS = VOICE_SETTINGS.get('save_voice_files', False)

if SAVE_LOGS and not os.path.exists('voice_logs'):
    os.makedirs('voice_logs')

# Initialize RVC Engine ONLY if enabled to save RAM
rvc_infer = None
if RVC_ENABLED:
    print("🚀 [Voice] RVC is ENABLED. Initializing Engine...")
    rvc_infer = RVCInference(device="cpu")
else:
    print("☁️ [Voice] RVC is DISABLED. Running in Light Mode (TTS Only).")

# --- 3. CORE FUNCTIONS ---

async def run_tts(text, output_path):
    speed = VOICE_SETTINGS['speed']
    voice = VOICE_SETTINGS['base_voice']
    rate_str = f"+{int((float(speed) - 1) * 100)}%" if float(speed) >= 1 else f"-{int((1 - float(speed)) * 100)}%"
    clean_text = text.replace('...', ' ').strip()
    communicate = edge_tts.Communicate(clean_text, voice, rate=rate_str)
    await communicate.save(output_path)

@app.route("/tts", methods=["POST"])
def voice_pipeline():
    start_time = time.time()
    data = request.json
    text = data.get("text", "")
    
    if not text:
        return "No text provided", 400

    request_id = str(uuid.uuid4())[:8]
    temp_base = os.path.abspath(f"base_{request_id}.wav")
    temp_final = os.path.abspath(f"final_{request_id}.wav")

    try:
        # Step 1: Base TTS (Always happens)
        print(f"🎙️ [TTS] Generating base for: {text[:30]}...")
        asyncio.run(run_tts(text, temp_base))

        # Step 2: RVC Inference (Only if toggled ON)
        if RVC_ENABLED and rvc_infer:
            print(f"✨ [RVC] Converting to Nazuna...")
            rvc_infer.f0_method = "rmvpe"
            rvc_infer.index_rate = VOICE_SETTINGS['index_rate']
            rvc_infer.f0_up_key = VOICE_SETTINGS['pitch_shift']
            rvc_infer.infer_file(temp_base, temp_final)
            target_file = temp_final
        else:
            # If disabled, we just use the base TTS file
            print(f"⏩ [Skip] RVC disabled, using base voice.")
            target_file = temp_base
        
        if not os.path.exists(target_file):
            raise Exception("Output file missing")

        # Step 3: Stream from RAM
        with open(target_file, 'rb') as f:
            audio_buffer = io.BytesIO(f.read())
        audio_buffer.seek(0)

        if SAVE_LOGS:
            log_name = os.path.join("voice_logs", f"voice_{request_id}.wav")
            shutil.copy(target_file, log_name)

        duration = round(time.time() - start_time, 2)
        print(f"✅ [Done] Request finished in {duration}s")

        return send_file(audio_buffer, mimetype="audio/wav")

    except Exception as e:
        print(f"❌ [Error] Pipeline failed: {e}")
        return str(e), 500

    finally:
        # Cleanup all temp files
        for f in [temp_base, temp_final]:
            if os.path.exists(f):
                try: os.remove(f)
                except: pass

# --- 4. STARTUP ---
if __name__ == "__main__":
    if RVC_ENABLED:
        if not os.path.exists(MODEL_PATH):
            print(f"❌ [Critical] RVC Model not found at: {MODEL_PATH}")
        else:
            try:
                rvc_infer.load_model(MODEL_PATH)
                if os.path.exists(INDEX_PATH):
                    rvc_infer.index_path = INDEX_PATH
                print("✅ [Voice] RVC Engine Ready.")
            except Exception as e:
                print(f"❌ [Critical] Failed to load RVC model: {e}")

    port = config['server_settings']['voice_port']
    app.run(port=port, host='127.0.0.1', debug=False)