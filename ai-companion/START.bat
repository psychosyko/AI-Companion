@echo off
title AI-companion Launcher
echo [1/3] Waking up the voice...
:: Change "python" to the path of your venv if needed
start "Voice (Python)" cmd /k "python rvc_server.py"

echo [2/3] Connecting the bridge...
start "Bridge (Node)" cmd /k "node server.js"

echo [3/3] Opening the world...
start "Frontend (Vite)" cmd /k "npm run dev"

echo.
echo All systems are launching in separate windows. 
echo Keep them open while talking to Nazuna!
echo.
pause