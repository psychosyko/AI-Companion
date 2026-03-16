import { useState, useRef, useEffect, useCallback } from "react";

/**
 * useVoiceChat Hook
 * Manages the conversation flow: sending text to the bridge, 
 * parsing AI moods/actions, and handling the TTS audio stream.
 */
export function useVoiceChat(config, mouthTarget, emotionTarget, actionTarget) {
    const [chatLog, setChatLog] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uiCallActive, setUiCallActive] = useState(false);
    const [isAISpeaking, setIsAISpeaking] = useState(false);
    const [chatState, setChatState] = useState("idle");

    const audioRef = useRef(null);
    const analyserRef = useRef(null);
    const audioCtxRef = useRef(null);
    const recognitionRef = useRef(null);
    const bridgeUrl = `http://${window.location.hostname}:3001`;

    // Initialize History from Config
    useEffect(() => {
        if (config?.history) {
            setChatLog(config.history.map(m => ({
                role: m.role === "user" ? "user" : "Nazuna",
                content: m.content
            })));
        }
    }, [config]);

    // --- HELPER: Parse Moods & Actions ---
    const processAIVisuals = (text) => {
        // 1. Extract Mood [HAPPY]
        const moodMatch = text.match(/^\[(.*?)\]/);
        const mood = moodMatch ? moodMatch[1].toLowerCase() : "neutral";
        
        const nextEmotions = {}; 
        Object.keys(emotionTarget.current).forEach(k => nextEmotions[k] = 0);
        if (nextEmotions.hasOwnProperty(mood)) nextEmotions[mood] = 1;
        emotionTarget.current = nextEmotions;

        // 2. Extract Actions [ACTION: LEAN]
        if (actionTarget.current) {
            actionTarget.current = {
                lean: text.includes("LEAN") ? 1 : 0,
                blush: text.includes("BLUSH") ? 1 : 0,
                nod: text.includes("NOD") ? 1 : 0,
                tilt: text.includes("TILT") ? 1 : 0
            };
            // Reset actions after 7 seconds
            setTimeout(() => {
                actionTarget.current = { lean: 0, blush: 0, nod: 0, tilt: 0 };
            }, 7000);
        }
    };

    // --- CORE: TTS PLAYBACK ---
    const speak = async (text, fullAiResponse) => {
        try {
            const cleanText = text.replace(/\[.*?\]/g, "").trim();
            if (recognitionRef.current) recognitionRef.current.stop();
            setChatState("talking");

            const response = await fetch(`${bridgeUrl}/tts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: cleanText }),
            });

            const arrayBuffer = await response.arrayBuffer();
            const url = URL.createObjectURL(new Blob([arrayBuffer], { type: "audio/wav" }));

            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            if (audioRef.current) audioRef.current.pause();
            const audio = new Audio(url);
            audio.crossOrigin = "anonymous";
            audioRef.current = audio;

            const source = audioCtxRef.current.createMediaElementSource(audio);
            const analyser = audioCtxRef.current.createAnalyser();
            analyser.fftSize = 1024;
            source.connect(analyser);
            analyser.connect(audioCtxRef.current.destination);
            analyserRef.current = analyser;

            if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();

            setChatLog(prev => [...prev, { role: "Nazuna", content: fullAiResponse }]);
            setLoading(false);
            setIsAISpeaking(true);

            audio.onended = () => {
                setIsAISpeaking(false);
                setChatState("idle");
                source.disconnect();
                analyser.disconnect();
                if (uiCallActive) try { recognitionRef.current.start(); } catch (e) { }
            };
            audio.play();
        } catch (err) {
            console.error("❌ [Voice Hook] Error:", err);
            setLoading(false);
            setChatState("idle");
        }
    };

    // --- CORE: SEND MESSAGE ---
    const sendMessage = useCallback(async (msg) => {
        if (!msg?.trim() || loading || !config) return;
        
        setLoading(true);
        setChatState("thinking");

        // Add user message to UI immediately
        setChatLog(prev => [...prev, { role: "user", content: msg }]);

        try {
            const response = await fetch(`${bridgeUrl}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [{ role: "user", content: msg }]
                })
            });

            const data = await response.json();
            if (data.choices?.[0]?.message) {
                const aiText = data.choices[0].message.content;
                processAIVisuals(aiText);
                speak(aiText, aiText);
            }
        } catch (err) {
            console.error("❌ [Chat Hook] Error:", err);
            setLoading(false);
            setChatState("idle");
        }
    }, [config, loading, bridgeUrl]);

    // --- SPEECH RECOGNITION SETUP ---
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const rec = new SpeechRecognition();
        rec.lang = "en-US";
        rec.continuous = false;
        
        rec.onstart = () => { setChatState("listening"); };
        rec.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            sendMessage(transcript);
        };
        
        recognitionRef.current = rec;
    }, [sendMessage]);

    // Auto-restart listening if in Call Mode
    useEffect(() => {
        if (uiCallActive && !isAISpeaking && !loading && chatState !== "listening") {
            const timer = setTimeout(() => {
                try { recognitionRef.current?.start(); } catch(e) {}
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [uiCallActive, isAISpeaking, loading, chatState]);

    return { 
        chatLog, setChatLog, loading, sendMessage, 
        analyserRef, isAISpeaking, isListening: uiCallActive, 
        toggleCallMode: (e) => { 
            if(e) { e.preventDefault(); e.stopPropagation(); }
            setUiCallActive(prev => !prev); 
        },
        chatState 
    };
}