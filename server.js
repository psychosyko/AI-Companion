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

        // 1. Define the "Engine Rules" (Mandatory technical instructions)
        const engineRules = `
# MANDATORY ENGINE RULES (Do not ignore):
- You MUST start every single response with exactly one emotion tag: [NEUTRAL], [HAPPY], [RELAXED], or [SURPRISED].
- You can move your body by adding action tags at the end of your message: [ACTION: LEAN], [ACTION: BLUSH], [ACTION: NOD], [ACTION: TILT].
- If the user shares a personal detail (likes, job, habits), you MUST save it using: [MEMORY: fact].
- NEVER use asterisks (*) for actions. Use the [ACTION: ] tags only.
- Speak casually and use the user's preferred name: ${config.character.user_name}.
        `;

        // 2. Format the Memory list
        const memoryContext = memory.length > 0 
            ? `\n# THINGS YOU REMEMBER ABOUT THE USER:\n${memory.map(m => "- " + m).join("\n")}`
            : "";

        // 3. Combine everything: Character Vibe + Engine Rules + Memory
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
                    ...history.map(m => ({
                        role: m.role.toLowerCase() === "user" ? "user" : "assistant",
                        content: m.content
                    }))
                ],
                temperature: 0.8,
            })
        });

        const data = await response.json();
        if (!data.choices) {
            console.error("OpenAI Error:", data);
            return res.status(500).send("AI failed");
        }

        let aiText = data.choices[0].message.content;

        // --- Tag Extraction Logic ---
        const memoryMatch = aiText.match(/\[MEMORY:\s*(.*?)\]/i);
        if (memoryMatch) {
            const newFact = memoryMatch[1].trim();
            const currentMemory = loadJson(MEMORY_PATH);
            if (!currentMemory.some(m => m.toLowerCase() === newFact.toLowerCase())) {
                currentMemory.push(newFact);
                saveJson(MEMORY_PATH, currentMemory);
                console.log(`✨ Learned: ${newFact}`);
            }
            aiText = aiText.replace(/\[MEMORY:.*?\]/gi, "").trim();
            data.choices[0].message.content = aiText;
        }

        const fullHistory = [...history, { role: "assistant", content: aiText }];
        saveJson(HISTORY_PATH, fullHistory.slice(-50));

        res.json(data);
    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).send("Internal Server Error");
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