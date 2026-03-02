import { useState, useRef, useEffect, useCallback } from "react";

export function useVoiceChat(config, mouthTarget, emotionTarget) {
    const [chatLog, setChatLog] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);

    const audioRef = useRef(null);
    const analyserRef = useRef(null);
    const recognitionRef = useRef(null);

    const isCallModeActive = useRef(false);
    const isAISpeaking = useRef(false);

    // 1. Sync History on Load
    useEffect(() => {
        if (config && config.history) {
            const formatted = config.history.map(m => ({
                role: m.role === "user" ? "User" : "Nazuna",
                content: m.content
            }));
            setChatLog(formatted);
        }
    }, [config]);

    /**
     * AI Logic: Sends user message to OpenAI via Bridge
     */
    const sendMessage = useCallback(async (msg) => {
        if (!msg || !msg.trim() || loading || !config) return;

        setLoading(true);
        const newLog = [...chatLog, { role: "User", content: msg }];
        setChatLog(newLog);

        try {
            const res = await fetch("http://localhost:3001/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: newLog.slice(-10).map(m => ({
                        role: m.role === "User" ? "user" : "assistant",
                        content: m.content
                    }))
                })
            });

            const data = await res.json();
            if (data.choices && data.choices[0]) {
                const aiText = data.choices[0].message.content;

                emotionTarget.current = {
                    happy: aiText.includes("[HAPPY]") ? 1 : 0,
                    relaxed: aiText.includes("[RELAXED]") ? 1 : 0,
                    surprised: aiText.includes("[SURPRISED]") ? 1 : 0
                };

                speak(aiText, aiText);
            }
        } catch (err) {
            console.error("Chat Error:", err);
            setLoading(false);
        }
    }, [chatLog, config, loading, emotionTarget]);

    /**
     * Voice Logic: Plays RVC Audio
     */
    async function speak(text, fullAiResponse) {
        try {
            const cleanText = text.replace(/\[.*?\]/g, "").trim();

            // Turn off mic before AI speaks to avoid feedback
            if (recognitionRef.current) recognitionRef.current.stop();
            isAISpeaking.current = true;

            const response = await fetch("http://localhost:3001/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: cleanText }),
            });

            const arrayBuffer = await response.arrayBuffer();
            const url = URL.createObjectURL(new Blob([arrayBuffer], { type: "audio/wav" }));

            if (audioRef.current) audioRef.current.pause();
            const audio = new Audio(url);
            audioRef.current = audio;

            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') await audioCtx.resume();

            const source = audioCtx.createMediaElementSource(audio);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 1024;
            source.connect(analyser);
            analyser.connect(audioCtx.destination);
            analyserRef.current = analyser;

            setChatLog(prev => [...prev, { role: "Nazuna", content: fullAiResponse }]);
            setLoading(false);

            audio.onended = () => {
                isAISpeaking.current = false;
                analyserRef.current = null;
                // Restart mic if we are in Call Mode
                if (isCallModeActive.current) {
                    try { recognitionRef.current.start(); } catch (e) { }
                }
            };
            audio.play();
        } catch (err) {
            console.error("Voice Error:", err);
            setChatLog(prev => [...prev, { role: "Nazuna", content: fullAiResponse }]);
            setLoading(false);
            isAISpeaking.current = false;
        }
    }

    /**
     * Speech Recognition (STT) Initialization
     */
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const rec = new SpeechRecognition();
            rec.lang = "en-US";
            rec.continuous = false;
            rec.interimResults = false;

            rec.onstart = () => setIsListening(true);
            rec.onend = () => setIsListening(false);

            rec.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                if (transcript) sendMessage(transcript);
            };

            recognitionRef.current = rec;
        }
    }, [sendMessage]);

    const toggleCallMode = () => {
        isCallModeActive.current = !isCallModeActive.current;
        if (isCallModeActive.current) {
            recognitionRef.current?.start();
        } else {
            recognitionRef.current?.stop();
        }
    };

    return {
        chatLog, setChatLog, loading, sendMessage,
        analyserRef, isAISpeaking, isListening, toggleCallMode
    };
}