import os
import json
import torch
import uuid
import asyncio
import edge_tts
import shutil
import io  # <--- New import for memory handling
from rvc_python.infer import RVCInference
from flask import Flask, request, send_file

# --- INITIALIZATION & CONFIG ---
with open('config.json', 'r') as f:
    config = json.load(f)

# PyTorch 2.6 Security Bypass
original_load = torch.load
def patched_torch_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return original_load(*args, **kwargs)
torch.load = patched_torch_load

app = Flask(__name__)

# Config Paths
MODEL_PATH = os.path.abspath(config['voice_settings']['rvc_model_path'])
INDEX_PATH = os.path.abspath(config['voice_settings']['rvc_index_path'])
SAVE_VOICES = config['voice_settings'].get('save_voice_files', False)

if SAVE_VOICES and not os.path.exists('voice_logs'):
    os.makedirs('voice_logs')

# Initialize RVC 
rvc_infer = RVCInference(device="cpu")

async def generate_base_voice(text, output_path):
    speed = config['voice_settings']['speed']
    voice = config['voice_settings']['base_voice']
    rate_str = f"+{int((float(speed) - 1) * 100)}%"
    # Remove leading dots/spaces for better TTS stability
    clean_text = text.replace('...', '').strip()
    communicate = edge_tts.Communicate(clean_text, voice, rate=rate_str)
    await communicate.save(output_path)

@app.route("/tts", methods=["POST"])
def voice_pipeline():
    data = request.json
    text = data.get("text", "")
    
    request_id = str(uuid.uuid4())[:8]
    base_audio = os.path.abspath(f"base_{request_id}.wav")
    final_audio = os.path.abspath(f"nazuna_{request_id}.wav")

    try:
        # Step 1: Generate base voice
        asyncio.run(generate_base_voice(text, base_audio))

        # Step 2: Apply RVC Model
        rvc_infer.f0_method = "rmvpe"
        rvc_infer.index_rate = config['voice_settings']['index_rate']
        rvc_infer.f0_up_key = config['voice_settings']['pitch_shift']
        
        rvc_infer.infer_file(base_audio, final_audio)
        
        if not os.path.exists(final_audio):
            raise Exception("RVC failed to generate file")

        # --- NEW LOGIC: READ TO MEMORY AND CLEANUP ---
        # We read the file into RAM so we can delete the disk version immediately
        with open(final_audio, 'rb') as f:
            audio_buffer = io.BytesIO(f.read())
        audio_buffer.seek(0)

        if SAVE_VOICES:
            log_path = os.path.join("voice_logs", f"nazuna_{request_id}.wav")
            # Copy instead of move so we can still use the buffer
            shutil.copy(final_audio, log_path)
            print(f"📁 Saved voice to: {log_path}")

        # Delete the temporary files from disk now that we have the data in RAM
        if os.path.exists(base_audio): os.remove(base_audio)
        if os.path.exists(final_audio): os.remove(final_audio)
        
        print(f"✨ Voice generated and disk cleaned for {request_id}")

        # Send the audio from RAM
        return send_file(audio_buffer, mimetype="audio/wav")

    except Exception as e:
        print(f"❌ Pipeline Error: {e}")
        # Final emergency cleanup
        for f in [base_audio, final_audio]:
            if os.path.exists(f): 
                try: os.remove(f)
                except: pass
        return str(e), 500

if __name__ == "__main__":
    print(f"--- Nazuna Voice Server ---")
    try:
        rvc_infer.load_model(MODEL_PATH)
        if os.path.exists(INDEX_PATH):
            rvc_infer.index_path = INDEX_PATH
    except Exception as e:
        print(f"Critical Load Error: {e}")

    port = config['server_settings']['voice_port']
    print(f"✅ RVC Pipeline Active on port {port}")
    app.run(port=port, host='127.0.0.1', debug=False)