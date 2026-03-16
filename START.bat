@echo off
title AI-companion Launcher
setlocal

:: Check for .env file
if not exist .env (
    echo [ERROR] No .env file found! 
    echo Please copy .env.example to .env and add your OpenAI key.
    pause
    exit /b
)

echo [1/3] Waking up the voice server...
start "Voice (Python)" cmd /k "python rvc_server.py"

timeout /t 2 >nul

echo [2/3] Connecting the bridge...
start "Bridge (Node)" cmd /k "node server.js"

timeout /t 2 >nul

echo [3/3] Opening the 3D world...
start "Frontend (Vite)" cmd /k "npm run dev"

echo.
echo 🦇 Nazuna is waking up. Keep these windows open!
echo.
pause