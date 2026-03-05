import { useState, useRef, useEffect, useCallback } from "react";

export function useVoiceChat(config, mouthTarget, emotionTarget, actionTarget) {
    const [chatLog, setChatLog] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [chatState, setChatState] = useState("idle");
    const [uiCallActive, setUiCallActive] = useState(false);
    const [isAISpeaking, setIsAISpeaking] = useState(false);

    const audioRef = useRef(null);
    const analyserRef = useRef(null);
    const audioCtxRef = useRef(null);
    const recognitionRef = useRef(null);
    const sendMessageRef = useRef(null);

    const bridgeUrl = `http://${window.location.hostname}:3001`;

    useEffect(() => {
        if (config && config.history) {
            setChatLog(config.history.map(m => ({
                role: m.role === "user" ? "user" : "Nazuna",
                content: m.content
            })));
        }
    }, [config]);

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
                if (isCallActive.current) try { recognitionRef.current.start(); } catch (e) { }
            };
            audio.play();
        } catch (err) {
            console.error("Voice Error:", err);
            setChatLog(prev => [...prev, { role: "Nazuna", content: fullAiResponse }]);
            setLoading(false);
            setIsAISpeaking(false);
        }
    };

    const sendMessage = useCallback(async (msg) => {
        if (!msg || !msg.trim() || loading || !config) return;
        setLoading(true);
        setChatState("thinking");

        setChatLog(prevLog => {
            const updatedLog = [...prevLog, { role: "user", content: msg }];
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
                    const moodMatch = aiText.match(/^\[(.*?)\]/);
                    const mood = moodMatch ? moodMatch[1].toLowerCase() : "neutral";
                    const nextEmotions = {}; Object.keys(emotionTarget.current).forEach(k => nextEmotions[k] = 0);
                    nextEmotions[mood] = 1; emotionTarget.current = nextEmotions;

                    if (actionTarget.current) {
                        actionTarget.current = {
                            lean: aiText.includes("LEAN") ? 1 : 0, blush: aiText.includes("BLUSH") ? 1 : 0,
                            nod: aiText.includes("NOD") ? 1 : 0, tilt: aiText.includes("TILT") ? 1 : 0
                        };
                        setTimeout(() => { actionTarget.current = { lean: 0, blush: 0, nod: 0, tilt: 0 }; }, 7000);
                    }
                    speak(aiText, aiText);
                }
            })
            .catch(() => { setLoading(false); setChatState("idle"); });
            return updatedLog;
        });
    }, [config, loading, bridgeUrl, emotionTarget, actionTarget]);

    useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;
        const rec = new SpeechRecognition();
        rec.lang = "en-US";
        rec.onstart = () => { setIsListening(true); setChatState("listening"); };
        rec.onend = () => setIsListening(false);
        rec.onresult = (e) => sendMessageRef.current(e.results[0][0].transcript);
        recognitionRef.current = rec;
    }, []);

    useEffect(() => {
        if (uiCallActive && !isListening && !isAISpeaking && !loading) {
            const timeout = setTimeout(() => { try { recognitionRef.current?.start(); } catch(e) {} }, 300);
            return () => clearTimeout(timeout);
        }
    }, [uiCallActive, isListening, loading, isAISpeaking]);

    return { 
        chatLog, setChatLog, loading, sendMessage, 
        analyserRef, isAISpeaking, isListening: uiCallActive, 
        toggleCallMode: (e) => { if(e){e.preventDefault(); e.stopPropagation();} setUiCallActive(p => !p); },
        chatState 
    };
}