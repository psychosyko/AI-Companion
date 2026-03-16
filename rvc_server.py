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
# Required for PyTorch 2.6+ to load local RVC models safely
original_load = torch.load
def patched_torch_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return original_load(*args, **kwargs)
torch.load = patched_torch_load

# --- 2. INITIALIZATION & CONFIG ---
app = Flask(__name__)

with open('config.json', 'r') as f:
    config = json.load(f)

# Config Shortcuts
VOICE_SETTINGS = config['voice_settings']
MODEL_PATH = os.path.abspath(VOICE_SETTINGS['rvc_model_path'])
INDEX_PATH = os.path.abspath(VOICE_SETTINGS['rvc_index_path'])
SAVE_LOGS = VOICE_SETTINGS.get('save_voice_files', False)

if SAVE_LOGS and not os.path.exists('voice_logs'):
    os.makedirs('voice_logs')

# Initialize RVC Engine
print("🚀 [Voice] Initializing RVC Engine...")
rvc_infer = RVCInference(device="cpu") # Change to "cuda" if you have an NVIDIA GPU

# --- 3. CORE FUNCTIONS ---

async def run_tts(text, output_path):
    """Generates the base voice using Microsoft Edge TTS."""
    speed = VOICE_SETTINGS['speed']
    voice = VOICE_SETTINGS['base_voice']
    # Format: +10% or -10%
    rate_str = f"+{int((float(speed) - 1) * 100)}%" if float(speed) >= 1 else f"-{int((1 - float(speed)) * 100)}%"
    
    # Remove ellipses for smoother flow
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
        # Step 1: Base TTS
        print(f"🎙️ [TTS] Generating base for: {text[:30]}...")
        asyncio.run(run_tts(text, temp_base))

        # Step 2: RVC Inference
        print(f"✨ [RVC] Converting to Nazuna ({request_id})...")
        rvc_infer.f0_method = "rmvpe"
        rvc_infer.index_rate = VOICE_SETTINGS['index_rate']
        rvc_infer.f0_up_key = VOICE_SETTINGS['pitch_shift']
        
        rvc_infer.infer_file(temp_base, temp_final)
        
        if not os.path.exists(temp_final):
            raise Exception("RVC output file missing")

        # Step 3: Stream from RAM
        with open(temp_final, 'rb') as f:
            audio_buffer = io.BytesIO(f.read())
        audio_buffer.seek(0)

        # Log file if enabled
        if SAVE_LOGS:
            log_name = os.path.join("voice_logs", f"nazuna_{request_id}.wav")
            shutil.copy(temp_final, log_name)

        duration = round(time.time() - start_time, 2)
        print(f"✅ [Done] Request {request_id} finished in {duration}s")

        return send_file(audio_buffer, mimetype="audio/wav")

    except Exception as e:
        print(f"❌ [Error] Pipeline failed: {e}")
        return str(e), 500

    finally:
        # STEP 4: CLEANUP (Always runs, even on error)
        for f in [temp_base, temp_final]:
            if os.path.exists(f):
                try: os.remove(f)
                except: pass

# --- 4. STARTUP ---
if __name__ == "__main__":
    print("--- Nazuna Nanakusa Voice Server ---")
    
    # Check if model exists
    if not os.path.exists(MODEL_PATH):
        print(f"❌ [Critical] Model not found at: {MODEL_PATH}")
        print("Please check your RVC_Nazuna folder.")
    else:
        try:
            rvc_infer.load_model(MODEL_PATH)
            if os.path.exists(INDEX_PATH):
                rvc_infer.index_path = INDEX_PATH
                print("✅ [Voice] Model and Index loaded successfully.")
            else:
                print("⚠️ [Voice] Index file not found. Inference will still work but quality may be lower.")
        except Exception as e:
            print(f"❌ [Critical] Failed to load model: {e}")

    port = config['server_settings']['voice_port']
    print(f"📡 [Voice] Listening on port {port}")
    app.run(port=port, host='127.0.0.1', debug=False)