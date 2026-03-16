import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
import path from "path";
import { Client, GatewayIntentBits } from 'discord.js';

// --- INITIALIZATION ---
dotenv.config();
const app = express();
app.use(express.json());

// --- CONFIGURATION & PATHS ---
const CONFIG_PATH = './config.json';
const DIRS = {
    histories: './histories',
    memories: './memories'
};

// Ensure data directories exist
Object.values(DIRS).forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Helper: Load/Save JSON safely
const loadJson = (p) => JSON.parse(fs.readFileSync(p, 'utf-8'));
const saveJson = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2));

const config = loadJson(CONFIG_PATH);
app.use(cors({ origin: config.server_settings.frontend_url }));

// --- DATA ACCESS HELPERS ---
const paths = {
    history: (id) => path.join(DIRS.histories, `${id}.json`),
    memory: (id) => path.join(DIRS.memories, `${id}.json`)
};

const getUserHistory = (id) => fs.existsSync(paths.history(id)) ? loadJson(paths.history(id)) : [];
const getUserMemory = (id, defaultName) => {
    return fs.existsSync(paths.memory(id)) 
        ? loadJson(paths.memory(id)) 
        : { name: defaultName, facts: [], summary: "" };
};

// --- AI LOGIC: SUMMARIZATION ---
async function summarizeHistory(history, currentSummary = "") {
    console.log("🧠 [Brain] Generating background summary...");
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` 
            },
            body: JSON.stringify({
                model: config.ai_settings?.model || "gpt-4o-mini",
                messages: [
                    { role: "system", content: "Summarize the key events and user preferences of this conversation in one short paragraph. Keep it under 60 words." },
                    { role: "user", content: `Existing context: ${currentSummary}\n\nRecent logs:\n${history.map(m => `${m.role}: ${m.content}`).join("\n")}` }
                ],
                temperature: config.ai_settings?.temperature || 0.3,
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        console.error("❌ [Brain] Summarization failed:", e.message);
        return currentSummary;
    }
}

// --- AI LOGIC: CORE RESPONSE ---
async function getNazunaResponse(userMessages, senderName, senderId) {
    const { discord_boss_id, user_name: bossName, personality_prompt } = config.character;
    const isBoss = (senderId === discord_boss_id);

    const history = getUserHistory(senderId);
    const memory = getUserMemory(senderId, senderName);

    const now = new Date();
    const currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const systemPrompt = `
${personality_prompt}

### ENGINE RULES:
1. START with emotion: [NEUTRAL], [HAPPY], [RELAXED], [SURPRISED], [ANGRY], or [SAD].
2. END with action: [ACTION: LEAN], [ACTION: BLUSH], [ACTION: NOD], or [ACTION: TILT].
3. LEARN: If the user shares a fact, add [MEMORY: fact] at the very end.

### CONTEXT:
- Target: ${senderName} ${isBoss ? "(Boss/Partner)" : ""} | Time: ${currentTime}
- Ongoing Summary: ${memory.summary || "New encounter."}
- Facts Known: ${memory.facts.join(", ") || "None yet."}
    `;

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` 
            },
            body: JSON.stringify({
                model: config.ai_settings?.model || "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...history.slice(-15).map(m => ({ role: m.role, content: m.content })),
                    ...userMessages.map(m => ({ role: "user", content: m.content }))
                ],
                temperature: config.ai_settings?.temperature || 0.8,
            })
        });

        const data = await response.json();
        let aiText = data.choices[0].message.content;

        // --- Post-Processing: Memory Extraction ---
        const memoryMatch = aiText.match(/\[MEMORY:\s*(.*?)\]/i);
        if (memoryMatch) {
            const newFact = memoryMatch[1].trim().replace(/\]$/, '');
            if (!memory.facts.some(f => f.toLowerCase() === newFact.toLowerCase())) {
                memory.facts.push(newFact);
                saveJson(paths.memory(senderId), memory);
                console.log(`✨ [Memory] Logged for ${senderName}: ${newFact}`);
            }
            aiText = aiText.replace(/\[MEMORY:.*?\]/gi, "").trim();
        }

        // --- Save History & Trigger Cleanup ---
        const updatedHistory = [...history, { role: "user", content: userMessages[0].content }, { role: "assistant", content: aiText, timestamp: now.toISOString() }];
        saveJson(paths.history(senderId), updatedHistory);

        if (updatedHistory.length > 30) {
            processBackgroundCleanup(senderId, senderName, updatedHistory, memory);
        }

        return aiText;
    } catch (err) {
        console.error("❌ [AI Error]:", err.message);
        return "[SAD] I'm feeling a bit disconnected from the night right now... [ACTION: TILT]";
    }
}

// Background task to keep the main thread fast
async function processBackgroundCleanup(id, name, history, memory) {
    const toSummarize = history.slice(0, 15);
    const newSummary = await summarizeHistory(toSummarize, memory.summary);
    
    // Refresh memory object to avoid write-conflicts
    const currentMem = getUserMemory(id, name);
    currentMem.summary = newSummary;
    saveJson(paths.memory(id), currentMem);
    saveJson(paths.history(id), history.slice(15));
    console.log(`🧹 [Cleaner] History condensed for ${name}`);
}

// --- DISCORD INTEGRATION ---
const discordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

discordClient.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const isDM = !message.guild;
    const isMentioned = message.mentions.has(discordClient.user.id);
    if (!isDM && !isMentioned) return;

    try {
        message.channel.sendTyping();
        const cleanMsg = message.content.replace(/<@!?\d+>/g, '').trim();
        const response = await getNazunaResponse([{ role: "user", content: cleanMsg }], message.member?.displayName || message.author.username, message.author.id);
        await message.reply(response.replace(/\[ACTION:.*?\]/gi, "").trim());
    } catch (err) { console.error("❌ [Discord Error]:", err.message); }
});

// --- API ENDPOINTS ---

// Admin: User Management
app.get("/admin/users", (req, res) => {
    try {
        const ids = [...new Set([...fs.readdirSync(DIRS.memories), ...fs.readdirSync(DIRS.histories)])].map(f => f.replace('.json', ''));
        const users = ids.map(id => ({ id, name: getUserMemory(id, "Unknown").name }));
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Failed to list users" }); }
});

app.post("/admin/delete", (req, res) => {
    const { id, type } = req.body;
    if (type === 'history' || type === 'both') {
        if (fs.existsSync(paths.history(id))) fs.unlinkSync(paths.history(id));
    }
    if (type === 'memory' || type === 'both') {
        if (fs.existsSync(paths.memory(id))) fs.unlinkSync(paths.memory(id));
    }
    console.log(`🗑️ [Admin] Wiped ${type} for ${id}`);
    res.json({ success: true });
});

// App: Config & Chat
app.get("/config", (req, res) => {
    const bossId = config.character.discord_boss_id;
    res.json({ 
        prompt: config.character.personality_prompt, 
        vrm: config.character.vrm_path, 
        user_name: config.character.user_name,
        discord_boss_id: bossId,
        history: getUserHistory(bossId) 
    });
});

app.post("/chat", async (req, res) => {
    try {
        const aiText = await getNazunaResponse(req.body.messages.slice(-1), config.character.user_name, config.character.discord_boss_id);
        res.json({ choices: [{ message: { content: aiText } }] });
    } catch (err) { res.status(500).send("AI Bridge Error"); }
});

app.post("/tts", async (req, res) => {
    try {
        const response = await fetch(`http://localhost:${config.server_settings.voice_port}/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: req.body.text.replace(/\[.*?\]/g, "").trim() })
        });
        const buffer = await response.arrayBuffer();
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "audio/wav");
        res.send(Buffer.from(buffer));
    } catch (err) { res.status(500).send("Voice Server Offline"); }
});

// --- STARTUP ---
if (process.env.DISCORD_TOKEN) {
    discordClient.login(process.env.DISCORD_TOKEN).catch(() => console.log("⚠️ Discord Token invalid. Running Web-only mode."));
}

app.listen(config.server_settings.bridge_port, () => {
    console.log(`
    🌙 Nazuna Bridge Active
    -----------------------
    Port: ${config.server_settings.bridge_port}
    User: ${config.character.user_name}
    -----------------------
    `);
});