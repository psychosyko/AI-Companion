import { useState, useRef, useEffect, useCallback } from "react";

export function useVoiceChat(config, mouthTarget, emotionTarget, actionTarget) {
    const [chatLog, setChatLog] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [uiCallActive, setUiCallActive] = useState(false); // Use state for the call toggle

    const audioRef = useRef(null);
    const analyserRef = useRef(null);
    const recognitionRef = useRef(null);
    const isAISpeaking = useRef(false);
    const sendMessageRef = useRef(null);

    const bridgeUrl = `http://${window.location.hostname}:3001`;

    // Sync History
    useEffect(() => {
        if (config && config.history) {
            setChatLog(config.history.map(m => ({
                role: m.role === "user" ? "user" : "Nazuna",
                content: m.content
            })));
        }
    }, [config]);

    const sendMessage = useCallback(async (msg) => {
        if (!msg || !msg.trim() || loading || !config) return;
        setLoading(true);

        setChatLog(prevLog => {
            const userEntry = { role: "user", content: msg };
            const updatedLog = [...prevLog, userEntry];

            fetch(`${bridgeUrl}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
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
                        emotionTarget.current = {
                            happy: aiText.includes("[HAPPY]") ? 1 : 0,
                            relaxed: aiText.includes("[RELAXED]") ? 1 : 0,
                            surprised: aiText.includes("[SURPRISED]") ? 1 : 0,
                            angry: aiText.includes("[ANGRY]") ? 1 : 0
                        };
                        if (actionTarget.current) {
                            actionTarget.current = {
                                lean: aiText.includes("[ACTION: LEAN]") ? 1 : 0,
                                blush: aiText.includes("[ACTION: BLUSH]") ? 1 : 0,
                                nod: aiText.includes("[ACTION: NOD]") ? 1 : 0,
                                tilt: aiText.includes("[ACTION: TILT]") ? 1 : 0
                            };
                            setTimeout(() => { actionTarget.current = { lean: 0, blush: 0, nod: 0, tilt: 0 }; }, 7000);
                        }
                        speak(aiText, aiText);
                    }
                })
                .catch(err => { console.error("Chat Error:", err); setLoading(false); });

            return updatedLog;
        });
    }, [config, loading, bridgeUrl, emotionTarget, actionTarget]);

    // Keep ref updated
    useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

    /**
     * STT SETUP
     */
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error("❌ This browser does not support Speech Recognition.");
            // Optional: Set a state to show a warning in the UI
            return;
        }
        const rec = new SpeechRecognition();
        rec.lang = "en-US";
        rec.continuous = false;
        rec.interimResults = false;

        rec.onstart = () => { setIsListening(true); console.log("🎤 Mic is recording..."); };
        rec.onend = () => {
            setIsListening(false);
            console.log("🎤 Mic session ended.");
        };

        rec.onerror = (event) => {
            console.error("STT Error:", event.error);
            if (event.error === 'not-allowed') alert("Microphone blocked. Check browser permissions.");
        };
         rec.onerror = (event) => {
            console.error("STT Error:", event.error);
            if (event.error === 'service-not-allowed' || event.error === 'network') {
                alert("Opera GX blocked the speech engine. Please use Google Chrome or Edge for voice features.");
            }
        };

        rec.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (transcript && sendMessageRef.current) {
                sendMessageRef.current(transcript);
            }
        };

        recognitionRef.current = rec;
    }, []);

    // NEW EFFECT: Handle the "Call Mode" loop based on UI state
    useEffect(() => {
        if (uiCallActive && !isListening && !isAISpeaking.current && !loading) {
            const timeout = setTimeout(() => {
                try { recognitionRef.current?.start(); } catch (e) { }
            }, 300); // Small delay to prevent rapid-fire restarts
            return () => clearTimeout(timeout);
        }
    }, [uiCallActive, isListening, loading]);

    async function speak(text, fullAiResponse) {
        try {
            const cleanText = text.replace(/\[.*?\]/g, "").trim();
            isAISpeaking.current = true;
            recognitionRef.current?.stop();

            const response = await fetch(`${bridgeUrl}/tts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: cleanText }),
            });

            const arrayBuffer = await response.arrayBuffer();
            const audio = new Audio(URL.createObjectURL(new Blob([arrayBuffer], { type: "audio/wav" })));
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
            };
            audio.play();
        } catch (err) {
            setChatLog(prev => [...prev, { role: "Nazuna", content: fullAiResponse }]);
            setLoading(false);
            isAISpeaking.current = false;
        }
    }

    const toggleCallMode = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation(); // Stop double-firing
        }
        setUiCallActive(prev => !prev);
    };

    return {
        chatLog, setChatLog, loading, sendMessage,
        analyserRef, isAISpeaking, isListening: uiCallActive, toggleCallMode
    };
}