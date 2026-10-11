import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, Mic, Play, Send, Square, X, Pause, Pencil, Trash2, CheckSquare } from "lucide-react";
import api from "../../utils/api";

import { getApiOrigin } from "../../utils/apiBase";
const API_ORIGIN = getApiOrigin();

function VoiceMessage({ id }) {
  const [url, setUrl] = useState("");
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`${API_ORIGIN}/api/files/message/${id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
        });
        if (!response.ok) throw new Error("Unable to load voice message.");
        const blob = await response.blob();
        if (!blob.size) throw new Error("Empty voice file.");
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      } catch (_) {
        if (!cancelled) setError(true);
      }
    };
    load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  if (error) return <p className="theme-muted text-xs mt-2">Voice message could not be loaded.</p>;
  if (!url) return <p className="theme-muted text-xs mt-2">Loading voice message...</p>;

  return (
    <div className="flex items-center gap-2 mt-2">
      <button type="button" className="icon-btn" onClick={() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) audio.play().catch(() => setError(true)); else audio.pause();
      }} title={playing ? "Pause voice message" : "Play voice message"}>
        {playing ? <Pause size={15}/> : <Play size={15}/>} 
      </button>
      <audio ref={audioRef} controls preload="metadata" className="w-full max-w-[250px]" src={url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setError(true)} />
    </div>
  );
}

export default function MessagePanel({ role, showTrigger = true }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [recipient, setRecipient] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [selectedMessages, setSelectedMessages] = useState([]);
  const panelRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const loadUsers = async () => {
    try {
      const { data } = await api.get("/messages/users");
      setUsers(Array.isArray(data) ? data : []);
    } catch (_) {}
  };

  const loadMessages = async () => {
    try {
      const { data } = await api.get("/messages");
      setMessages(Array.isArray(data) ? data : []);
    } catch (_) {}
  };

  useEffect(() => {
    const openMessages = () => {
      setOpen(true);
      window.dispatchEvent(new CustomEvent("quickcheck:close-notifications"));
    };
    const closeMessages = () => setOpen(false);
    const handleEscape = (event) => { if (event.key === "Escape") setOpen(false); };
    const handleOutside = (event) => {
      if (open && panelRef.current && !panelRef.current.contains(event.target) && !event.target.closest(".message-float")) setOpen(false);
    };
    window.addEventListener("quickcheck:open-messages", openMessages);
    window.addEventListener("quickcheck:close-messages", closeMessages);
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleOutside);
    return () => {
      window.removeEventListener("quickcheck:open-messages", openMessages);
      window.removeEventListener("quickcheck:close-messages", closeMessages);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleOutside);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    loadUsers();
    loadMessages();
    const t = setInterval(loadMessages, 5000);
    return () => clearInterval(t);
  }, [open]);

  const sendText = async () => {
    if (!recipient || !text.trim()) return;
    setSending(true);
    try {
      await api.post("/messages", { recipient, text: text.trim() });
      setText("");
      await loadMessages();
    } catch (e) {
      alert(e.response?.data?.message || "Message failed.");
    } finally {
      setSending(false);
    }
  };

  const startEdit = (message) => {
    setEditingId(message._id);
    setEditText(message.text || "");
  };

  const saveEdit = async (id) => {
    if (!editText.trim()) return alert("Message cannot be empty.");
    try {
      await api.put(`/messages/${id}`, { text: editText.trim() });
      setEditingId(null);
      setEditText("");
      await loadMessages();
    } catch (e) {
      alert(e.response?.data?.message || "Message could not be edited.");
    }
  };

  const deleteMessage = async (id) => {
    if (!window.confirm("Delete this message?")) return;
    try {
      await api.delete(`/messages/${id}`);
      setSelectedMessages((items) => items.filter((item) => item !== id));
      await loadMessages();
    } catch (e) {
      alert(e.response?.data?.message || "Message could not be deleted.");
    }
  };

  const visible = recipient
    ? messages.filter((m) => String(m.sender?._id) === String(recipient) || String(m.recipient?._id) === String(recipient))
    : messages;
  const visibleIds = visible.map((m) => m._id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedMessages.includes(id));

  const toggleMessageSelection = (id) => {
    setSelectedMessages((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  };

  const toggleSelectAll = () => {
    setSelectedMessages((items) => allVisibleSelected
      ? items.filter((id) => !visibleIds.includes(id))
      : Array.from(new Set([...items, ...visibleIds])));
  };

  const deleteSelected = async () => {
    if (!selectedMessages.length) return;
    if (!window.confirm(`Delete ${selectedMessages.length} selected message${selectedMessages.length === 1 ? "" : "s"}?`)) return;
    try {
      await api.post("/messages/bulk-delete", { ids: selectedMessages });
      setSelectedMessages([]);
      await loadMessages();
    } catch (e) {
      alert(e.response?.data?.message || "Selected messages could not be deleted.");
    }
  };

  const clearAllMessages = async () => {
    if (!messages.length) return;
    if (!window.confirm("Clear all messages? This removes the conversation history from the system.")) return;
    try {
      await api.delete("/messages");
      setMessages([]);
      setSelectedMessages([]);
    } catch (e) {
      alert(e.response?.data?.message || "Messages could not be cleared.");
    }
  };

  const startRecording = async () => {
    if (!recipient) { alert("Select a user first."); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      alert("Voice recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorderRef.current = rec;
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (!blob.size) { alert("No audio was recorded."); return; }
        const form = new FormData();
        form.append("recipient", recipient);
        form.append("voice", blob, "voice-message.webm");
        setSending(true);
        try { await api.post("/messages/voice", form); await loadMessages(); }
        catch (e) { alert(e.response?.data?.message || "Voice message failed."); }
        finally { setSending(false); }
      };
      rec.start();
      setRecording(true);
    } catch (e) {
      alert("Microphone permission is required for voice messages.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    setRecording(false);
  };

  return <>
    {showTrigger && <button onClick={() => { const next = !open; setOpen(next); if (next) window.dispatchEvent(new CustomEvent("quickcheck:close-notifications")); }} className="message-float" title={open ? "Close messages" : "Open messages"}><MessageCircle size={20}/><span>Messages</span></button>}
    {open && <div ref={panelRef} className="message-panel" role="dialog" aria-modal="false" aria-label="Messages">
      <div className="message-panel-header flex items-center justify-between p-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <div><b>Messages</b><p className="theme-muted text-[10px]">Text and voice messages</p></div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={clearAllMessages} className="text-red-400 text-[10px] font-bold" disabled={!messages.length}>Clear All</button>
          <button type="button" onClick={() => setOpen(false)} className="icon-btn" title="Close messages" aria-label="Close messages"><X size={18}/></button>
        </div>
      </div>

      <div className="p-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <select className="qc-input" value={recipient} onChange={(e) => { setRecipient(e.target.value); setEditingId(null); setSelectedMessages([]); }}>
          <option value="">Select a user</option>
          {users.map((u) => <option key={u._id} value={u._id}>{u.name} — {u.role} — {u.email}</option>)}
        </select>
        <div className="flex items-center justify-between gap-2 mt-2">
          <button type="button" onClick={toggleSelectAll} disabled={!visibleIds.length} className="text-[10px] font-bold accent-text flex items-center gap-1 disabled:opacity-40">
            <CheckSquare size={13}/> {allVisibleSelected ? "Unselect All" : "Select All"}
          </button>
          <div className="flex items-center gap-2">
            <span className="theme-muted text-[10px]">{selectedMessages.length} selected</span>
            <button type="button" onClick={deleteSelected} disabled={!selectedMessages.length} className="text-[10px] font-bold text-red-400 disabled:opacity-40 flex items-center gap-1"><Trash2 size={13}/> Delete Selected</button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {!recipient ? <p className="theme-muted text-center py-12 text-sm">Choose a user to start a conversation.</p> :
          visible.length ? visible.map((m) => {
            const mine = Boolean(m.isMine);
            const isText = Boolean(m.text);
            const selected = selectedMessages.includes(m._id);
            return <div key={m._id} className={`p-3 rounded-2xl border ${selected || mine ? "accent-soft" : "theme-surface"}`} style={{ borderColor: selected ? "var(--accent)" : "var(--border)" }}>
              <div className="flex items-start justify-between gap-2">
                <label className="flex items-start gap-2 cursor-pointer min-w-0">
                  <input type="checkbox" checked={selected} onChange={() => toggleMessageSelection(m._id)} className="mt-0.5" style={{ accentColor: "var(--accent)" }} />
                  <p className="text-[9px] theme-muted mb-1">{mine ? "You" : (m.sender?.name || "User")} · {new Date(m.createdAt).toLocaleString()}{m.editedAt ? " · edited" : ""}</p>
                </label>
                <div className="flex gap-1">
                  {mine && isText && <button type="button" className="message-action" title="Edit message" onClick={() => startEdit(m)}><Pencil size={13}/></button>}
                  <button type="button" className="message-action danger" title="Delete message" onClick={() => deleteMessage(m._id)}><Trash2 size={13}/></button>
                </div>
              </div>
              {editingId === m._id ? <div className="space-y-2"><textarea className="qc-input" value={editText} onChange={(e) => setEditText(e.target.value)} rows={2}/><div className="flex gap-2"><button type="button" className="btn-primary text-xs" onClick={() => saveEdit(m._id)}>Save</button><button type="button" className="icon-btn text-xs" onClick={() => setEditingId(null)}>Cancel</button></div></div> : <>{isText && <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>}{m.voiceFile && <VoiceMessage id={m._id}/>}</>}
            </div>;
          }) : <p className="theme-muted text-center py-12 text-sm">No messages yet.</p>}
      </div>

      <div className="p-3 border-t flex gap-2 shrink-0" style={{ borderColor: "var(--border)" }}>
        <input className="qc-input flex-1 min-w-0" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message..." onKeyDown={(e) => { if (e.key === "Enter") sendText(); }}/>
        <button type="button" className={`icon-btn ${recording ? "accent-soft" : ""}`} onClick={recording ? stopRecording : startRecording} title={recording ? "Stop recording" : "Voice message"}>{recording ? <Square size={16}/> : <Mic size={16}/>}</button>
        <button type="button" disabled={sending} className="btn-primary px-4" onClick={sendText}><Send size={16}/></button>
      </div>
    </div>}
  </>;
}
