import { useState, useRef, useEffect, useCallback } from "react";

export function useVoiceChat(config, mouthTarget, emotionTarget, actionTarget) {
    const [chatLog, setChatLog] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);

    const audioRef = useRef(null);
    const analyserRef = useRef(null);
    const recognitionRef = useRef(null);

    const isCallActive = useRef(false);
    const isAISpeaking = useRef(false);

    const bridgeUrl = `http://${window.location.hostname}:3001`;

    useEffect(() => {
        if (config && config.history) {
            const formatted = config.history.map(m => ({
                role: m.role === "user" ? "User" : "Nazuna",
                content: m.content
            }));
            setChatLog(formatted);
        }
    }, [config]);

    const speak = async (text, fullAiResponse) => {
        try {
            const cleanText = text.replace(/\[.*?\]/g, "").trim();
            if (recognitionRef.current) recognitionRef.current.stop();
            isAISpeaking.current = true;

            const response = await fetch(`${bridgeUrl}/tts`, {
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
                if (isCallActive.current) try { recognitionRef.current.start(); } catch (e) { }
            };
            audio.play();
        } catch (err) {
            console.error("Voice Error:", err);
            setChatLog(prev => [...prev, { role: "Nazuna", content: fullAiResponse }]);
            setLoading(false);
            isAISpeaking.current = false;
        }
    };

    const sendMessage = useCallback(async (msg) => {
        // Prevent double-firing or sending empty messages
        if (!msg || !msg.trim() || loading || !config) return;


        setLoading(true);

        // 1. Create the new history entry locally
        const userEntry = { role: "user", content: msg }; // Change "User" to "user"

        // 2. Use a functional update to ensure we have the absolute latest state
        setChatLog(prevLog => {
            const updatedLog = [...prevLog, userEntry];

            fetch(`${bridgeUrl}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    // Ensure we are sending the lowercase version
                    messages: updatedLog.slice(-12).map(m => ({
                        role: m.role.toLowerCase() === "user" ? "user" : "assistant",
                        content: m.content
                    }))
                })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.choices && data.choices[0]) {
                        const aiText = data.choices[0].message.content;

                        // Update expressions
                        emotionTarget.current = {
                            happy: aiText.includes("[HAPPY]") ? 1 : 0,
                            relaxed: aiText.includes("[RELAXED]") ? 1 : 0,
                            surprised: aiText.includes("[SURPRISED]") ? 1 : 0
                        };

                        if (actionTarget.current) {
                            actionTarget.current = {
                                lean: aiText.includes("[ACTION: LEAN]") ? 1 : 0,
                                blush: aiText.includes("[ACTION: BLUSH]") ? 1 : 0,
                                nod: aiText.includes("[ACTION: NOD]") ? 1 : 0,
                                tilt: aiText.includes("[ACTION: TILT]") ? 1 : 0
                            };
                            setTimeout(() => {
                                actionTarget.current = { lean: 0, blush: 0, nod: 0, tilt: 0 };
                            }, 7000);
                        }

                        // Speak and show text
                        speak(aiText, aiText);
                    }
                })
                .catch(err => {
                    console.error("Chat Error:", err);
                    setLoading(false);
                });

            return updatedLog;
        });
    }, [config, loading, bridgeUrl, emotionTarget, actionTarget, speak]);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const rec = new SpeechRecognition();
            rec.lang = "en-US";
            rec.onstart = () => setIsListening(true);
            rec.onend = () => setIsListening(false);
            rec.onresult = (e) => { if (e.results[0][0].transcript) sendMessage(e.results[0][0].transcript); };
            recognitionRef.current = rec;
        }
    }, [sendMessage]);

    const toggleCallMode = () => {
        isCallActive.current = !isCallActive.current;
        if (isCallActive.current) recognitionRef.current?.start();
        else recognitionRef.current?.stop();
    };

    return { chatLog, setChatLog, loading, sendMessage, analyserRef, isAISpeaking, isListening, toggleCallMode };
}