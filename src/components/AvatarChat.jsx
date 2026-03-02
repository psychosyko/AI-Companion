import { useEffect, useRef, useState } from "react";
import { useAvatar } from "../hooks/useAvatar";
import { useVoiceChat } from "../hooks/useVoiceChat";
import "./AvatarChat.css";

export default function AvatarChat() {
    const mountRef = useRef();
    const chatEndRef = useRef(null);
    const [config, setConfig] = useState(null);
    const [message, setMessage] = useState("");

    useEffect(() => {
        fetch("http://localhost:3001/config").then(res => res.json()).then(setConfig);
    }, []);

    const { mouthTarget, emotionTarget } = useAvatar(mountRef, config);

    // Get everything from VoiceChat hook
    const {
        chatLog, setChatLog, loading, sendMessage,
        analyserRef, isAISpeaking, isListening, toggleCallMode
    } = useVoiceChat(config, mouthTarget, emotionTarget);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatLog]);

    // Lip Sync Animation Frame
    useEffect(() => {
        let frame;
        const loop = () => {
            if (analyserRef.current && isAISpeaking.current) {
                const data = new Uint8Array(analyserRef.current.fftSize);
                analyserRef.current.getByteTimeDomainData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += Math.abs(data[i] - 128);
                mouthTarget.current.aa = Math.min((sum / data.length) / 2, 0.7);
            } else {
                mouthTarget.current.aa = 0;
            }
            frame = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(frame);
    }, [analyserRef, isAISpeaking, mouthTarget]);

    const handleSend = () => {
        if (!message.trim()) return;
        sendMessage(message);
        setMessage("");
    };

    const clearHistory = async () => {
        if (window.confirm("Wipe memory?")) {
            const res = await fetch("http://localhost:3001/reset", { method: "POST" });
            if (res.ok) setChatLog([]);
        }
    };

    if (!config) return <div className="avatar-container"><p>Loading...</p></div>;

    return (
        <div className="avatar-container">
            <div ref={mountRef} className="avatar-canvas" />

            <div className="phone-frame">
                <div className="chat-header">
                    <div className="status-dot" />
                    <span className="header-title">Nazuna Nanakusa</span>
                    <button onClick={clearHistory} className="clear-btn">Reset</button>
                </div>

                <div className="message-area">
                    {chatLog.map((c, i) => (
                        <div key={i} className={c.role === "User" ? "user-row" : "ai-row"}>
                            <div className={c.role === "User" ? "user-bubble" : "ai-bubble"}>
                                {c.content.replace(/\[.*?\]/g, "").trim()}
                            </div>
                        </div>
                    ))}
                    {loading && <div className="loading-text">Nazuna is thinking...</div>}
                    <div ref={chatEndRef} />
                </div>

                <div className="input-area">
                    <button
                        onClick={toggleCallMode}
                        className={`icon-btn ${isListening ? 'active' : ''}`}
                    >
                        {isListening ? (
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="white"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.994.994 0 010-1.41C2.75 9.21 6.92 7 12 7s9.25 2.21 11.71 4.67c.39.39.39 1.02 0 1.41l-2.48 2.48c-.18.18-.43.29-.71.29s-.53-.11-.7-.28c-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" /></svg>
                        ) : (
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="white"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" /><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" /></svg>
                        )}
                    </button>

                    <input
                        className="chat-input"
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        placeholder={isListening ? "I'm listening..." : "Message..."}
                        onKeyDown={e => e.key === "Enter" && handleSend()}
                    />

                    <button onClick={handleSend} disabled={loading} className="send-btn">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="#ff69b4"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                    </button>
                </div>
            </div>
        </div>
    );
}