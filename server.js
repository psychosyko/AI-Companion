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

// --- DIRECTORY SETUP ---
const CONFIG_PATH = './config.json';
const HISTORIES_DIR = './histories';
const MEMORIES_DIR = './memories'; // New directory for individual profiles

if (!fs.existsSync(HISTORIES_DIR)) fs.mkdirSync(HISTORIES_DIR);
if (!fs.existsSync(MEMORIES_DIR)) fs.mkdirSync(MEMORIES_DIR);

const loadJson = (path) => JSON.parse(fs.readFileSync(path, 'utf-8'));
const saveJson = (path, data) => fs.writeFileSync(path, JSON.stringify(data, null, 2));

// --- DYNAMIC PATH HELPERS ---
const getHistoryPath = (id) => path.join(HISTORIES_DIR, `${id}.json`);
const getMemoryPath = (id) => path.join(MEMORIES_DIR, `${id}.json`);

const loadUserHistory = (id) => {
    const p = getHistoryPath(id);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : [];
};

const loadUserMemory = (id, defaultName = "Unknown") => {
    const p = getMemoryPath(id);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : { name: defaultName, facts: [] };
};

const config = loadJson(CONFIG_PATH);
app.use(cors({ origin: config.server_settings.frontend_url }));

const discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

/**
 * FINAL AI LOGIC ENGINE
 * Pulls from individual History and Memory files
 */
async function getNazunaResponse(userMessages, senderName, senderId) {
    const bossId = config.character.discord_boss_id;
    const bossName = config.character.user_name;
    const isBoss = (senderId === bossId);

    // 1. Load this specific user's context
    const history = loadUserHistory(senderId);
    const memory = loadUserMemory(senderId, senderName);

    // 2. Load Boss context (for gossip/reference)
    const bossMemory = isBoss ? memory : loadUserMemory(bossId, bossName);

    const now = new Date();
    const currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const engineRules = `
# MANDATORY OUTPUT FORMAT (CRITICAL):
1. START your response with an emotion tag: [NEUTRAL], [HAPPY], [RELAXED], [SURPRISED], [ANGRY], or [SAD].
2. END your response with action tags: [ACTION: LEAN], [ACTION: BLUSH], [ACTION: NOD], or [ACTION: TILT].
3. IF you learn a personal fact (likes, job, habits, owner of something), you MUST add [MEMORY: fact] at the VERY end. 

# CURRENT CONTEXT:
- You are talking to: ${senderName}.
${isBoss ? "- This is Psycho (Boss). Be intimate." : `- ${bossName} is your Boss.`}
- Time: ${currentTime}.

# MEMORIES OF ${senderName.toUpperCase()}:
${memory.facts.length > 0 ? memory.facts.join(", ") : "None yet. ASK or LISTEN for details."}

# EXAMPLE OF PROPER TAGGING:
"Oh, you have a bike? I'll remember that. [HAPPY] [ACTION: LEAN] [MEMORY: owns a motorcycle]"
    `;

    // 3. Request from OpenAI
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
    let aiText = data.choices[0].message.content;

    // 4. Update Memory File if tag found
    const memoryMatch = aiText.match(/\[MEMORY:\s*(.*?)\]/i);
    if (memoryMatch) {
        const newFact = memoryMatch[1].trim();
        // Remove trailing bracket if regex caught it
        const cleanFact = newFact.replace(/\]$/, '');

        if (!memory.facts.some(f => f.toLowerCase() === cleanFact.toLowerCase())) {
            memory.facts.push(cleanFact);
            saveJson(getMemoryPath(senderId), memory);
            console.log(`✨ Nazuna's notebook updated for ${senderName}: ${cleanFact}`);
        }
        // Remove the tag from the spoken/displayed text
        aiText = aiText.replace(/\[MEMORY:.*?\]/gi, "").trim();
    }

    // 5. Save History File
    const updatedHistory = [...history,
    { role: "user", content: userMessages[userMessages.length - 1].content },
    { role: "assistant", content: aiText, timestamp: now.toISOString() }
    ];
    saveJson(getHistoryPath(senderId), updatedHistory.slice(-100));

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
        const senderId = message.author.id;
        const senderName = message.member?.displayName || message.author.username;
        const cleanContent = message.content.replace(/<@!?\d+>/g, '').trim();

        const responseText = await getNazunaResponse([{ role: "user", content: cleanContent }], senderName, senderId);
        await message.reply(responseText.replace(/\[ACTION:.*?\]/gi, "").trim());
    } catch (err) { console.error(err); }
});

// --- WEB APP API ---
app.get("/config", (req, res) => {
    const bossId = config.character.discord_boss_id;
    res.json({
        prompt: config.character.personality_prompt,
        vrm: config.character.vrm_path,
        user_name: config.character.user_name,
        history: loadUserHistory(bossId)
    });
});

app.post("/chat", async (req, res) => {
    try {
        const responseText = await getNazunaResponse(
            req.body.messages.slice(-1),
            config.character.user_name,
            config.character.discord_boss_id
        );
        res.json({ choices: [{ message: { content: responseText } }] });
    } catch (err) { res.status(500).send("AI Error"); }
});

app.post("/reset", (req, res) => {
    const bossId = config.character.discord_boss_id;
    const hPath = getHistoryPath(bossId);
    const mPath = getMemoryPath(bossId);
    if (fs.existsSync(hPath)) fs.unlinkSync(hPath);
    if (fs.existsSync(mPath)) fs.unlinkSync(mPath);
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

discordClient.login(process.env.DISCORD_TOKEN);
app.listen(config.server_settings.bridge_port, () => console.log("✅ Modular AI Agent Active"));