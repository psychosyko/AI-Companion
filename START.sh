#!/bin/bash

# --- COLORS FOR TERMINAL ---
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}🦇 Nazuna AI Launcher (Linux Edition)${NC}"

# 1. Check for .env file
if [ ! -f .env ]; then
    echo -e "${RED}[ERROR] No .env file found!${NC}"
    echo "Please run: cp .env.example .env"
    exit 1
fi

# 2. Cleanup Function (Kills all processes when you press Ctrl+C)
cleanup() {
    echo -e "\n${RED}Stopping Nazuna... Sending her back to the shadows.${NC}"
    kill $PYTHON_PID $NODE_PID $VITE_PID 2>/dev/null
    exit
}
trap cleanup SIGINT

# 3. Check for RVC Toggle in config.json
RVC_ENABLED=$(grep -o '"rvc_enabled": [^,]*' config.json | head -1 | cut -d' ' -f2)

# 4. Launch Voice Server (Python)
if [ "$RVC_ENABLED" = "true" ]; then
    echo -e "${GREEN}[1/3] Waking up Voice Server (Python)...${NC}"
    # Use venv if it exists, otherwise use system python
    if [ -d "venv" ]; then
        ./venv/bin/python3 rvc_server.py > /dev/null &
    else
        python3 rvc_server.py > /dev/null &
    fi
    PYTHON_PID=$!
    sleep 3
else
    echo -e "${CYAN}[-] RVC is disabled. Skipping Python Server to save CPU...${NC}"
fi

# 5. Launch Bridge (Node)
echo -e "${GREEN}[2/3] Connecting the Bridge (Node)...${NC}"
node server.js > /dev/null &
NODE_PID=$!
sleep 2

# 6. Launch Frontend (Vite)
echo -e "${GREEN}[3/3] Opening the World (Vite)...${NC}"
npm run dev -- --host > /dev/null &
VITE_PID=$!

echo -e "${CYAN}------------------------------------------${NC}"
echo -e "Nazuna is active! Open http://localhost:5173"
echo -e "KEEP THIS TERMINAL OPEN. Press Ctrl+C to stop."
echo -e "${CYAN}------------------------------------------${NC}"

# Wait for background processes to keep the script alive
wait