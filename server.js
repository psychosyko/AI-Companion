import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

const CONFIG_PATH = './config.json';
const MEMORY_PATH = './memory.json';
const HISTORY_PATH = './chat_history.json';

const ensureJsonFile = (path) => {
    if (!fs.existsSync(path) || fs.readFileSync(path, 'utf-8').trim() === "") {
        fs.writeFileSync(path, JSON.stringify([]));
    }
};
ensureJsonFile(MEMORY_PATH);
ensureJsonFile(HISTORY_PATH);

const loadJson = (path) => JSON.parse(fs.readFileSync(path, 'utf-8'));
const saveJson = (path, data) => fs.writeFileSync(path, JSON.stringify(data, null, 2));

const config = loadJson(CONFIG_PATH);
app.use(cors({ origin: config.server_settings.frontend_url }));

app.get("/config", (req, res) => {
    try {
        res.json({
            prompt: config.character.personality_prompt,
            vrm: config.character.vrm_path,
            user_name: config.character.user_name || "Psycho",
            history: loadJson(HISTORY_PATH)
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to serve config" });
    }
});

app.post("/chat", async (req, res) => {
    try {
        const memory = loadJson(MEMORY_PATH);
        const history = loadJson(HISTORY_PATH); // Load the actual disk history
        const userMessages = req.body.messages;

        // --- 1. GENERATE TEMPORAL CONTEXT ---
        const now = new Date();
        const currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const currentDay = now.toLocaleDateString([], { weekday: 'long' });

        // Calculate how long it's been since the last talk
        let lastSeenContext = "We haven't talked in a while.";
        if (history.length > 0 && history[history.length - 1].timestamp) {
            const lastTime = new Date(history[history.length - 1].timestamp);
            const diffInMinutes = Math.floor((now - lastTime) / 60000);

            if (diffInMinutes < 60) lastSeenContext = `We last talked ${diffInMinutes} minutes ago.`;
            else if (diffInMinutes < 1440) lastSeenContext = `We last talked ${Math.floor(diffInMinutes / 60)} hours ago.`;
            else lastSeenContext = `It's been ${Math.floor(diffInMinutes / 1440)} days since we last talked.`;
        }

        const engineRules = `
# MANDATORY ENGINE RULES:
- You MUST start every response with exactly one emotion tag: [NEUTRAL], [HAPPY], [RELAXED], [SURPRISED], or [ANGRY].
- You can move your body by adding action tags at the end of your message: [ACTION: LEAN], [ACTION: BLUSH], [ACTION: NOD], [ACTION: TILT].
- If the user shares a personal detail (likes, job, habits), you MUST save it using: [MEMORY: fact].
- NEVER use asterisks (*) for actions. Use the [ACTION: ] tags only.
- Current Time: ${currentTime} (${currentDay}).
- Status: ${lastSeenContext}
- Speak casually and use the user's preferred name: ${config.character.user_name}.
        `;

        const memoryContext = memory.length > 0
            ? `\n# THINGS YOU REMEMBER ABOUT THE USER:\n${memory.map(m => "- " + m).join("\n")}`
            : "";

        const finalSystemPrompt = `${config.character.personality_prompt}\n\n${engineRules}${memoryContext}`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: finalSystemPrompt },
                    ...userMessages.map(m => ({
                        role: m.role.toLowerCase() === "user" ? "user" : "assistant",
                        content: m.content
                    }))
                ],
                temperature: 0.8,
            })
        });

        const data = await response.json();
        let aiText = data.choices[0].message.content;

        const memoryMatch = aiText.match(/\[MEMORY:\s*(.*?)\]/i);
        if (memoryMatch) {
            const newFact = memoryMatch[1].trim();
            const currentMemory = loadJson(MEMORY_PATH);
            if (!currentMemory.some(m => m.toLowerCase() === newFact.toLowerCase())) {
                currentMemory.push(newFact);
                saveJson(MEMORY_PATH, currentMemory);
            }
            aiText = aiText.replace(/\[MEMORY:.*?\]/gi, "").trim();
            data.choices[0].message.content = aiText;
        }

        // --- 2. SAVE HISTORY WITH TIMESTAMPS ---
        const newHistoryEntry = [
            ...userMessages.slice(-1), // Just the latest user message
            { role: "assistant", content: aiText, timestamp: new Date().toISOString() }
        ];

        // Append to full history and save
        const updatedHistory = [...history, ...newHistoryEntry];
        saveJson(HISTORY_PATH, updatedHistory.slice(-100)); // Keep last 100 on disk
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Error");
    }
});

app.post("/reset", (req, res) => {
    saveJson(HISTORY_PATH, []);
    saveJson(MEMORY_PATH, []);
    res.json({ success: true });
});

app.post("/tts", async (req, res) => {
    try {
        const response = await fetch(`http://localhost:${config.server_settings.voice_port}/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: req.body.text.replace(/\[.*?\]/g, "").trim() })
        });
        res.setHeader("Content-Type", "audio/wav");
        res.send(Buffer.from(await response.arrayBuffer()));
    } catch (err) { res.status(500).send(err); }
});

app.listen(config.server_settings.bridge_port, () => console.log("✅ Bridge Active"));