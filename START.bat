@echo off
title 🦇 Nazuna AI Launcher
setlocal EnableDelayedExpansion

:: Ensure we are in the correct folder
cd /d "%~dp0"

echo ==========================================
echo    🦇 NAZUNA AI COMPANION LAUNCHER
echo ==========================================

:: 1. Check for .env file
if not exist ".env" (
    echo [!] .env file missing.
    if exist ".env.example" (
        echo [OK] Creating .env from .env.example...
        copy .env.example .env
        echo [ACTION] Opening Notepad. Paste your OpenAI key and SAVE it.
        notepad .env
        echo Press any key AFTER saving and closing Notepad...
        pause >nul
    ) else (
        echo [ERROR] .env.example not found. Please create a .env file manually.
        pause
        exit /b
    )
)

:: 2. Check for Python Virtual Environment
if not exist "venv\Scripts\python.exe" (
    echo [ERROR] Virtual Environment not found in \venv\
    echo Please run: py -3.10 -m venv venv
    pause
    exit /b
)

:: 3. Check for Node Modules
if not exist "node_modules" (
    echo [ERROR] node_modules not found. 
    echo Please run: npm install
    pause
    exit /b
)

echo [1/3] Starting Voice Server (Python RVC)...
start "Nazuna Voice" cmd /c ".\venv\Scripts\python.exe rvc_server.py || pause"

timeout /t 3 >nul

echo [2/3] Starting Bridge (Node.js)...
start "Nazuna Bridge" cmd /c "node server.js || pause"

timeout /t 2 >nul

echo [3/3] Starting Frontend (Vite)...
start "Nazuna Frontend" cmd /c "npm run dev || pause"

echo.
echo 🦇 All systems starting! 
echo Check the other windows for errors.
echo Your browser should open to http://localhost:5173
echo.
echo Press any key to close this launcher (it won't stop the AI).
pause