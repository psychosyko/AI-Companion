import { useEffect, useRef, useState, useCallback } from "react";
import { useAvatar } from "../hooks/useAvatar";
import { useVoiceChat } from "../hooks/useVoiceChat";
import "./AvatarChat.css";

/**
 * AvatarChat Component
 * The central hub for Nazuna's 3D presence and chat interface.
 */
export default function AvatarChat() {
    // --- 1. REFS & STATE ---
    const mountRef = useRef(null);
    const chatEndRef = useRef(null);
    const isInitialLoad = useRef(true);

    const mouthTarget = useRef({ aa: 0, oh: 0, ih: 0 });
    const emotionTarget = useRef({ happy: 0, relaxed: 0, surprised: 0, angry: 0 });
    const actionTarget = useRef({ lean: 0, blush: 0, nod: 0, tilt: 0 });

    const [config, setConfig] = useState(null);
    const [message, setMessage] = useState("");
    const [showAdmin, setShowAdmin] = useState(false);
    const [allUsers, setAllUsers] = useState([]);
    const [loadProgress, setLoadProgress] = useState(0);

    const bridgeUrl = `http://${window.location.hostname}:3001`;

    // --- 2. DATA FETCHING ---
    useEffect(() => {
        fetch(`${bridgeUrl}/config`)
            .then(res => res.json())
            .then(setConfig)
            .catch(err => console.error("Bridge Connection Failed:", err));
    }, [bridgeUrl]);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch(`${bridgeUrl}/admin/users`);
            const data = await res.json();
            setAllUsers(data);
        } catch (err) { console.error("Failed to fetch users:", err); }
    }, [bridgeUrl]);

    // --- 3. CUSTOM HOOKS ---
    useAvatar(mountRef, config, "idle", mouthTarget, emotionTarget, actionTarget, setLoadProgress);

    const {
        chatLog, setChatLog, loading, sendMessage,
        analyserRef, isAISpeaking, isListening, toggleCallMode
    } = useVoiceChat(config, mouthTarget, emotionTarget, actionTarget);

    // --- 4. UI EFFECTS ---
    useEffect(() => {
        if (loadProgress >= 100 && chatLog.length > 0) {
            const behavior = isInitialLoad.current ? "auto" : "smooth";
            const timer = setTimeout(() => {
                chatEndRef.current?.scrollIntoView({ behavior });
                isInitialLoad.current = false;
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [chatLog, loadProgress]);

    useEffect(() => {
        let frame;
        const syncMouth = () => {
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
            } else { mouthTarget.current.aa = 0; }
            frame = requestAnimationFrame(syncMouth);
        };
        syncMouth();
        return () => cancelAnimationFrame(frame);
    }, [isAISpeaking, analyserRef]);

    // --- 5. HANDLERS ---
    const handleSend = () => {
        if (!message.trim() || loading) return;
        sendMessage(message);
        setMessage("");
    };

    const deleteUserData = async (id, type) => {
        if (!window.confirm(`Wipe ${type} for this user?`)) return;
        try {
            await fetch(`${bridgeUrl}/admin/delete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, type })
            });
            if (id === config.discord_boss_id && (type === 'history' || type === 'both')) setChatLog([]);
            fetchUsers();
        } catch (err) { console.error("Admin action failed:", err); }
    };

    // --- 6. SUB-RENDERERS ---
    const renderLoadingOverlay = () => (
        <div className="loading-overlay">
            <p className="loading-title">SUMMONING NAZUNA...</p>
            <div className="progress-container">
                <div className="progress-bar" style={{ width: `${loadProgress}%` }} />
            </div>
            <p className="progress-text">{loadProgress}% READY</p>
        </div>
    );

    const renderAdminPanel = () => (
        <div className="admin-panel">
            <header className="admin-header">
                <h3>Vampire Records</h3>
                <button className="admin-close" onClick={() => setShowAdmin(false)}>✕</button>
            </header>
            <div className="user-list">
                {allUsers.length === 0 ? <p className="empty-msg">No records found.</p> :
                    allUsers.map(u => (
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
                    ))
                }
            </div>
        </div>
    );

    return (
        <div className="avatar-container">
            <div ref={mountRef} className="avatar-canvas" style={{ opacity: loadProgress >= 100 ? 1 : 0 }} />

            {loadProgress < 100 && renderLoadingOverlay()}

            {config && loadProgress >= 100 && (
                <>
                    {showAdmin && renderAdminPanel()}

                    <div className="phone-frame">
                        <header className="chat-header">
                            <div className="status-dot" />
                            <span className="header-title">Nazuna Nanakusa</span>
                            {/* NEW: Clean SVG Gear Button */}
                            <button onClick={() => { setShowAdmin(true); fetchUsers(); }} className="admin-btn" title="Settings">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                </svg>
                            </button>
                        </header>

                        <main className="message-area">
                            {chatLog.map((c, i) => (
                                <div key={i} className={c.role.toLowerCase() === "user" ? "user-row" : "ai-row"}>
                                    <div className={c.role.toLowerCase() === "user" ? "user-bubble" : "ai-bubble"}>
                                        {c.content.replace(/\[.*?\]/g, "").trim()}
                                    </div>
                                </div>
                            ))}
                            {loading && <div className="loading-text">thinking...</div>}
                            <div ref={chatEndRef} className="scroll-anchor" />
                        </main>

                        <footer className="input-area">
                            <button onClick={(e) => toggleCallMode(e)} className={`icon-btn ${isListening ? 'active' : ''}`}>
                                <svg viewBox="0 0 24 24"><path d={isListening ? "M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.994.994 0 010-1.41C2.75 9.21 6.92 7 12 7s9.25 2.21 11.71 4.67c.39.39.39 1.02 0 1.41l-2.48 2.48c-.18.18-.43.29-.71.29s-.53-.11-.7-.28c-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" : "M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"} /></svg>
                            </button>
                            <input className="chat-input" value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} placeholder={isListening ? "Listening..." : "Message..."} disabled={isListening} />
                            <button onClick={handleSend} disabled={loading || isListening} className="send-btn">
                                <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                            </button>
                        </footer>
                    </div>
                </>
            )}
        </div>
    );

}