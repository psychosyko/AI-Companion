import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
import path from "path";
import { Client, GatewayIntentBits } from 'discord.js';

dotenv.config();
const app = express();
app.use(express.json());

const CONFIG_PATH = './config.json';
const HISTORIES_DIR = './histories';
const MEMORIES_DIR = './memories';

if (!fs.existsSync(HISTORIES_DIR)) fs.mkdirSync(HISTORIES_DIR);
if (!fs.existsSync(MEMORIES_DIR)) fs.mkdirSync(MEMORIES_DIR);

const loadJson = (p) => JSON.parse(fs.readFileSync(p, 'utf-8'));
const saveJson = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2));

const getHistoryPath = (id) => path.join(HISTORIES_DIR, `${id}.json`);
const getMemoryPath = (id) => path.join(MEMORIES_DIR, `${id}.json`);

const loadUserHistory = (id) => fs.existsSync(getHistoryPath(id)) ? loadJson(getHistoryPath(id)) : [];
const loadUserMemory = (id, def) => fs.existsSync(getMemoryPath(id)) ? loadJson(getMemoryPath(id)) : { name: def, facts: [], summary: "" };

const config = loadJson(CONFIG_PATH);
app.use(cors({ origin: config.server_settings.frontend_url }));

const discordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// --- SUMMARIZATION HELPER (Asynchronous) ---
async function summarizeHistory(history, currentSummary = "") {
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a memory assistant. Summarize the following conversation history into a single concise paragraph. Focus on key topics discussed and the user's current mood. Keep it under 60 words." },
                    { role: "user", content: `Existing Summary: ${currentSummary}\n\nNew Messages:\n${history.map(m => `${m.role}: ${m.content}`).join("\n")}` }
                ],
                temperature: 0.3,
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        console.error("❌ Background Summarization failed:", e);
        return currentSummary;
    }
}

async function getNazunaResponse(userMessages, senderName, senderId) {
    const bossId = config.character.discord_boss_id;
    const bossName = config.character.user_name;
    const isBoss = (senderId === bossId);

    let history = loadUserHistory(senderId);
    let memory = loadUserMemory(senderId, senderName);

    const now = new Date();
    const currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const engineRules = `
### CRITICAL OUTPUT INSTRUCTIONS:
1. Every response MUST start with an emotion tag: [NEUTRAL], [HAPPY], [RELAXED], [SURPRISED],[ANGRY], or [SAD].
2. Every response MUST end with an action tag:[ACTION: LEAN], [ACTION: BLUSH], [ACTION: NOD], or [ACTION: TILT].
3. **OBSERVATIONAL LEARNING:** If ${senderName} mentions a fact, append [MEMORY: specific fact] at the absolute end.

### CURRENT CONTEXT:
- Talking to: ${senderName}. ${isBoss ? "(This is your Boss/Partner, Psycho)" : ""}
- Current Time: ${currentTime}.
- Ongoing Chat Summary: ${memory.summary || "You're just starting the night together."}

### PERMANENT RECORDS FOR ${senderName.toUpperCase()}:
${memory.facts.length > 0 ? memory.facts.join(", ") : "None yet. Learn about them!"}
    `;

    // Get the response from GPT
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: `${config.character.personality_prompt}\n\n${engineRules}` },
                ...history.slice(-15).map(m => ({ role: m.role, content: m.content })),
                ...userMessages.map(m => ({ role: "user", content: m.content }))
            ],
            temperature: 0.8,
        })
    });

    const data = await response.json();
    if (!data.choices) throw new Error("AI Error");
    
    let aiText = data.choices[0].message.content;

    // Process [MEMORY:] tags
    const memoryMatch = aiText.match(/\[MEMORY:\s*(.*?)\]/i);
    if (memoryMatch) {
        const newFact = memoryMatch[1].trim().replace(/\]$/, '');
        const currentMemory = loadUserMemory(senderId, senderName);
        const alreadyKnown = currentMemory.facts.some(f => f.toLowerCase() === newFact.toLowerCase());

        if (!alreadyKnown) {
            currentMemory.facts.push(newFact);
            saveJson(getMemoryPath(senderId), currentMemory);
            console.log(`✨ Memory Logged for ${senderName}: ${newFact}`);
        }
        aiText = aiText.replace(/\[MEMORY:.*?\]/gi, "").trim();
    }

    // Save history with the current exchange
    const newHistory = [...history, { role: "user", content: userMessages[0].content }, { role: "assistant", content: aiText, timestamp: now.toISOString() }];
    saveJson(getHistoryPath(senderId), newHistory);

    // --- BACKGROUND MAINTENANCE (Non-blocking) ---
    // Trigger cleanup if history exceeds 30 items
    if (newHistory.length > 30) {
        console.log(`🧠 History for ${senderName} is long. Starting background condensation...`);
        (async () => {
            const toSummarize = newHistory.slice(0, 15);
            const remainingHistory = newHistory.slice(15);
            
            const updatedSummary = await summarizeHistory(toSummarize, memory.summary || "");
            
            // Reload to ensure we don't overwrite other memory changes
            const finalMem = loadUserMemory(senderId, senderName);
            finalMem.summary = updatedSummary;
            
            saveJson(getMemoryPath(senderId), finalMem);
            saveJson(getHistoryPath(senderId), remainingHistory);
            console.log(`✨ History condensed for ${senderName}.`);
        })();
    }

    return aiText;
}

// --- DISCORD ---
discordClient.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const isDM = message.guild === null;
    const isMentioned = message.mentions.has(discordClient.user.id);
    if (!isDM && !isMentioned) return;
    try {
        message.channel.sendTyping();
        const responseText = await getNazunaResponse([{ role: "user", content: message.content.replace(/<@!?\d+>/g, '').trim() }], message.member?.displayName || message.author.username, message.author.id);
        await message.reply(responseText.replace(/\[ACTION:.*?\]/gi, "").trim());
    } catch (err) { console.error(err); }
});

// --- ADMIN API ---
app.get("/admin/users", (req, res) => {
    try {
        const memoryFiles = fs.readdirSync(MEMORIES_DIR).map(f => f.replace('.json', ''));
        const historyFiles = fs.readdirSync(HISTORIES_DIR).map(f => f.replace('.json', ''));
        const allIds = [...new Set([...memoryFiles, ...historyFiles])];
        const users = allIds.map(id => {
            const mPath = getMemoryPath(id);
            let name = "Unknown User";
            if (fs.existsSync(mPath)) {
                try {
                    const data = JSON.parse(fs.readFileSync(mPath));
                    name = data.name || name;
                } catch(e) { name = "Corrupted Profile"; }
            }
            return { id, name };
        });
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Failed to list users" }); }
});

app.post("/admin/delete", (req, res) => {
    const { id, type } = req.body;
    try {
        if (type === 'history' || type === 'both') {
            const p = getHistoryPath(id);
            if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        if (type === 'memory' || type === 'both') {
            const p = getMemoryPath(id);
            if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Delete failed" }); }
});

// --- REST API ---
app.get("/config", (req, res) => {
    const bossId = config.character.discord_boss_id;
    res.json({ 
        prompt: config.character.personality_prompt, 
        vrm: config.character.vrm_path, 
        user_name: config.character.user_name,
        discord_boss_id: config.character.discord_boss_id,
        history: loadUserHistory(bossId) 
    });
});

app.post("/chat", async (req, res) => {
    try {
        const responseText = await getNazunaResponse(req.body.messages.slice(-1), config.character.user_name, config.character.discord_boss_id);
        res.json({ choices: [{ message: { content: responseText } }] });
    } catch (err) { res.status(500).send("AI Error"); }
});

app.post("/tts", async (req, res) => {
    try {
        const response = await fetch(`http://localhost:${config.server_settings.voice_port}/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: req.body.text.replace(/\[.*?\]/g, "").trim() })
        });
        const arrayBuffer = await response.arrayBuffer();
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "audio/wav");
        res.send(Buffer.from(arrayBuffer));
    } catch (err) { res.status(500).send(err); }
});

discordClient.login(process.env.DISCORD_TOKEN);
app.listen(config.server_settings.bridge_port, () => console.log(`✅ Bridge & Admin Active on port ${config.server_settings.bridge_port}`));