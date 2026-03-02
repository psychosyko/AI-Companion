import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv"; // 1. Import dotenv

dotenv.config(); // 2. Load the .env file

const app = express();
app.use(express.json());

const CONFIG_PATH = './config.json';
const MEMORY_PATH = './memory.json';
const HISTORY_PATH = './chat_history.json';

// Helper to ensure a file exists and is valid JSON
const ensureJsonFile = (path) => {
    if (!fs.existsSync(path) || fs.readFileSync(path, 'utf-8').trim() === "") {
        fs.writeFileSync(path, JSON.stringify([]));
        console.log(`Initialized empty file: ${path}`);
    }
};

// --- INITIALIZE FILES ON STARTUP ---
try {
    ensureJsonFile(MEMORY_PATH);
    ensureJsonFile(HISTORY_PATH);
} catch (e) {
    console.error("File initialization failed:", e);
}

const loadJson = (path) => {
    try {
        return JSON.parse(fs.readFileSync(path, 'utf-8'));
    } catch (e) {
        console.error(`Error parsing ${path}, resetting to empty array.`);
        return [];
    }
};

const saveJson = (path, data) => fs.writeFileSync(path, JSON.stringify(data, null, 2));

// Load main config
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
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
        const history = req.body.messages;

        const systemPrompt = `
${config.character.personality_prompt}

### USER CONTEXT
- You are talking to ${config.character.user_name}.
- Current things you remember about ${config.character.user_name}:
${memory.length > 0 ? memory.map(m => "- " + m).join("\n") : "Nothing yet."}

### LONG-TERM MEMORY INSTRUCTION
If the user shares personal details, preferences, or habits, you must save them to your permanent memory.
To do this, append the following tag to the end of your response: [MEMORY: specific fact]
Example: "I'll remember that you like rain. [MEMORY: likes rainy weather]"
This tag will be hidden from the user.
`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` // 3. Use the ENV variable
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: systemPrompt }, ...history],
                temperature: 0.8,
            })
        });

        const data = await response.json();
        let aiText = data.choices[0].message.content;

        // Extract and save memory
        const memoryMatch = aiText.match(/\[MEMORY:\s*(.*?)\]/i);
        if (memoryMatch) {
            const newFact = memoryMatch[1].trim();
            const currentMemory = loadJson(MEMORY_PATH);

            // Only add if the fact is somewhat new (case-insensitive check)
            const alreadyExists = currentMemory.some(m => m.toLowerCase() === newFact.toLowerCase());

            if (!alreadyExists) {
                currentMemory.push(newFact);
                saveJson(MEMORY_PATH, currentMemory);
                console.log(`✨ Memory Updated: ${newFact}`);
            }

            // Clean all memory tags from the final text
            aiText = aiText.replace(/\[MEMORY:.*?\]/gi, "").trim();
            data.choices[0].message.content = aiText;
        }

        // Save history
        const fullHistory = [...history, { role: "assistant", content: aiText }];
        saveJson(HISTORY_PATH, fullHistory.slice(-50));

        res.json(data);
    } catch (err) {
        console.error("Chat Error:", err);
        res.status(500).send({ error: "AI failed" });
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