import { useEffect, useRef, useState } from "react";
import { useAvatar } from "../hooks/useAvatar";
import { useVoiceChat } from "../hooks/useVoiceChat";
import "./AvatarChat.css";

export default function AvatarChat() {
    const mountRef = useRef(null);
    const chatEndRef = useRef(null);
    const isInitialLoad = useRef(true); // Track first time UI becomes visible
    
    const [config, setConfig] = useState(null);
    const [message, setMessage] = useState("");
    const [showAdmin, setShowAdmin] = useState(false);
    const [allUsers, setAllUsers] = useState([]);
    const [loadProgress, setLoadProgress] = useState(0);

    const mouthTarget = useRef({ aa: 0, oh: 0, ih: 0 });
    const emotionTarget = useRef({ happy: 0, relaxed: 0, surprised: 0, angry: 0 });
    const actionTarget = useRef({ lean: 0, blush: 0, nod: 0, tilt: 0 });

    const bridgeUrl = `http://${window.location.hostname}:3001`;

    useEffect(() => {
        fetch(`${bridgeUrl}/config`).then(res => res.json()).then(data => {
            setConfig(data);
        });
    }, [bridgeUrl]);

    // Avatar Hook (Canvas must exist in DOM for this to work)
    useAvatar(mountRef, config, "idle", mouthTarget, emotionTarget, actionTarget, (p) => setLoadProgress(p));

    const {
        chatLog, setChatLog, loading, sendMessage, chatState,
        analyserRef, isAISpeaking, isListening, toggleCallMode
    } = useVoiceChat(config, mouthTarget, emotionTarget, actionTarget);

    // --- INSTANT SCROLL LOGIC ---
    useEffect(() => {
        if (loadProgress >= 100 && chatLog.length > 0) {
            const scroll = () => {
                if (isInitialLoad.current) {
                    // First time: Instant jump
                    chatEndRef.current?.scrollIntoView({ behavior: "auto" });
                    isInitialLoad.current = false;
                } else {
                    // New messages: Smooth slide
                    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
                }
            };

            // Smallest possible timeout to ensure React has painted the message bubbles
            const timer = setTimeout(scroll, 50);
            return () => clearTimeout(timer);
        }
    }, [chatLog, loadProgress]);

    // Mouth movement logic
    useEffect(() => {
        let frame;
        const loop = () => {
            if (analyserRef.current && isAISpeaking) {
                const data = new Uint8Array(analyserRef.current.fftSize);
                analyserRef.current.getByteTimeDomainData(data);
                let sumSq = 0;
                for (let i = 0; i < data.length; i++) {
                    const amp = (data[i] - 128) / 128;
                    sumSq += amp * amp;
                }
                const volume = Math.sqrt(sumSq / data.length);
                mouthTarget.current.aa = Math.min(volume * 12.0, 0.8);
            } else {
                mouthTarget.current.aa = 0;
            }
            frame = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(frame);
    }, [isAISpeaking, analyserRef]);

    const fetchUsers = async () => {
        const res = await fetch(`${bridgeUrl}/admin/users`);
        const data = await res.json();
        setAllUsers(data);
    };

    const deleteUserData = async (id, type) => {
        const label = type === 'both' ? 'everything' : type;
        if (!window.confirm(`Wipe ${label} for this user?`)) return;
        try {
            const res = await fetch(`${bridgeUrl}/admin/delete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, type })
            });
            if (res.ok) {
                if (id === config.discord_boss_id && (type === 'history' || type === 'both')) setChatLog([]);
                fetchUsers();
            }
        } catch (err) { console.error("Delete failed:", err); }
    };

    const handleSend = () => {
        if (!message.trim()) return;
        sendMessage(message);
        setMessage("");
    };

    return (
        <div className="avatar-container">
            {/* The 3D World */}
            <div 
                ref={mountRef} 
                className="avatar-canvas" 
                style={{ opacity: loadProgress >= 100 ? 1 : 0, transition: 'opacity 1s ease' }} 
            />

            {/* Loading Overlay */}
            {loadProgress < 100 && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 999,
                    display:'flex', flexDirection:'column', justifyContent:'center', 
                    alignItems:'center', background: 'radial-gradient(circle, #1a0b2e 0%, #000 100%)'
                }}>
                    <p style={{color:'var(--nazuna-pink)', marginBottom: '15px', fontSize: '1.1rem', letterSpacing: '1px'}}>
                        {!config ? "INITIATING NIGHT..." : "SUMMONING NAZUNA..."}
                    </p>
                    <div style={{width: '240px', height: '3px', background: 'rgba(255,105,180,0.1)', borderRadius: '10px', overflow:'hidden'}}>
                        <div style={{
                            width: `${loadProgress}%`, height: '100%', 
                            background: 'var(--nazuna-pink)', transition: 'width 0.4s ease-out',
                            boxShadow: '0 0 15px var(--nazuna-pink)'
                        }} />
                    </div>
                    <p style={{color: '#444', fontSize: '0.7rem', marginTop: '8px'}}>{loadProgress}% READY</p>
                </div>
            )}

            {/* Chat Interface */}
            {config && loadProgress >= 100 && (
                <>
                    {showAdmin && (
                        <div className="admin-panel">
                            <div className="admin-header">
                                <h3>Vampire Records</h3>
                                <button className="admin-close" onClick={() => setShowAdmin(false)}>✕</button>
                            </div>
                            <div className="user-list">
                                {allUsers.map(u => (
                                    <div key={u.id} className="user-item">
                                        <div className="user-info">
                                            <span className="u-name">{u.name}</span>
                                            <span className="u-id">{u.id === config.discord_boss_id ? "BOSS (YOU)" : u.id}</span>
                                        </div>
                                        <div className="user-actions">
                                            <button onClick={() => deleteUserData(u.id, 'history')}>Chat</button>
                                            <button onClick={() => deleteUserData(u.id, 'memory')}>Facts</button>
                                            <button onClick={() => deleteUserData(u.id, 'both')}>All</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="phone-frame">
                        <div className="chat-header">
                            <div className="status-dot" />
                            <span className="header-title">Nazuna Nanakusa</span>
                            <button onClick={() => { setShowAdmin(true); fetchUsers(); }} className="admin-btn">⚙</button>
                        </div>

                        <div className="message-area">
                            {chatLog.map((c, i) => {
                                const isUser = c.role.toLowerCase() === "user";
                                return (
                                    <div key={i} className={isUser ? "user-row" : "ai-row"}>
                                        <div className={isUser ? "user-bubble" : "ai-bubble"}>
                                            {c.content.replace(/\[.*?\]/g, "").trim()}
                                        </div>
                                    </div>
                                );
                            })}
                            {loading && <div className="loading-text">thinking...</div>}
                            <div ref={chatEndRef} style={{ height: '1px', width: '100%' }} />
                        </div>

                        <div className="input-area">
                            <button onClick={(e) => toggleCallMode(e)} className={`icon-btn ${isListening ? 'active' : ''}`}>
                                <svg viewBox="0 0 24 24" fill="white"><path d={isListening ? "M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.994.994 0 010-1.41C2.75 9.21 6.92 7 12 7s9.25 2.21 11.71 4.67c.39.39.39 1.02 0 1.41l-2.48 2.48c-.18.18-.43.29-.71.29s-.53-.11-.7-.28c-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" : "M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"} /></svg>
                            </button>
                            <input className="chat-input" value={message} onChange={e => setMessage(e.target.value)} placeholder={isListening ? "Listening..." : "Message..."} onKeyDown={e => {if(e.key==="Enter") handleSend()}} />
                            <button onClick={handleSend} disabled={loading} className="send-btn">
                                <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}