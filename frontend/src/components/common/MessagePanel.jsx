import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckSquare,
  MessageCircle,
  Mic,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Search,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";
import api from "../../utils/api";
import { getApiOrigin } from "../../utils/apiBase";
import OverflowMenu from "../ui/OverflowMenu";

const API_ORIGIN = getApiOrigin();

function normalizeAudioMime(raw) {
  const value = String(raw || "").split(";")[0].trim().toLowerCase();
  if (value.startsWith("audio/") || value.startsWith("video/webm") || value === "application/ogg") {
    if (value === "video/webm") return "audio/webm";
    return value;
  }
  return "audio/webm";
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "?";
}

function roleLabel(role) {
  const value = String(role || "").toLowerCase();
  if (value === "admin") return "Admin";
  if (value === "teacher") return "Teacher";
  if (value === "student") return "Student";
  return "User";
}

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
        const buffer = await response.arrayBuffer();
        if (!buffer.byteLength) throw new Error("Empty voice file.");
        const mime = normalizeAudioMime(response.headers.get("content-type"));
        const blob = new Blob([buffer], { type: mime });
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      } catch {
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
  if (!url) return <p className="theme-muted text-xs mt-2">Loading voice message…</p>;

  return (
    <div className="qc-voice-player mt-2">
      <button
        type="button"
        className="icon-btn !p-2"
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (audio.paused) audio.play().catch(() => setError(true));
          else audio.pause();
        }}
        title={playing ? "Pause voice message" : "Play voice message"}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        className="qc-voice-audio"
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError(true)}
      />
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
  const [manageMode, setManageMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");
  const [usersStatus, setUsersStatus] = useState("idle");
  const [messagesStatus, setMessagesStatus] = useState("idle");
  const panelRef = useRef(null);
  const threadRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const loadUsers = async () => {
    setUsersStatus("loading");
    try {
      const { data } = await api.get("/messages/users");
      setUsers(Array.isArray(data) ? data : []);
      setUsersStatus("ready");
    } catch {
      setUsers([]);
      setUsersStatus("error");
    }
  };

  const loadMessages = async () => {
    setMessagesStatus("loading");
    try {
      const { data } = await api.get("/messages");
      setMessages(Array.isArray(data) ? data : []);
      setMessagesStatus("ready");
    } catch {
      setMessages([]);
      setMessagesStatus("error");
    }
  };

  const markConversationRead = async (peerId) => {
    if (!peerId) return;
    try {
      await api.put("/messages/conversation-read", { peerId });
      setUsers((rows) =>
        rows.map((user) =>
          String(user._id) === String(peerId) ? { ...user, unreadCount: 0 } : user
        )
      );
      setMessages((rows) =>
        rows.map((message) => {
          const fromPeer =
            String(message.sender?._id || message.sender) === String(peerId) &&
            !message.isMine;
          return fromPeer ? { ...message, read: true } : message;
        })
      );
    } catch {
      /* non-blocking */
    }
  };

  useEffect(() => {
    const openMessages = () => {
      setOpen(true);
      window.dispatchEvent(new CustomEvent("quickcheck:close-notifications"));
    };
    const closeMessages = () => setOpen(false);
    const handleEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handleOutside = (event) => {
      if (
        open &&
        panelRef.current &&
        !panelRef.current.contains(event.target) &&
        !event.target.closest(".message-float")
      ) {
        setOpen(false);
      }
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
    const timer = setInterval(() => {
      loadUsers();
      loadMessages();
    }, 5000);
    return () => clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !recipient) return;
    markConversationRead(recipient);
  }, [open, recipient]);

  const visible = useMemo(
    () =>
      recipient
        ? messages.filter(
            (message) =>
              String(message.sender?._id) === String(recipient) ||
              String(message.recipient?._id) === String(recipient)
          )
        : [],
    [messages, recipient]
  );

  const eligibleIds = useMemo(
    () => visible.map((message) => message._id).filter(Boolean),
    [visible]
  );

  const selectedVisibleIds = useMemo(
    () => selectedMessages.filter((id) => eligibleIds.includes(id)),
    [selectedMessages, eligibleIds]
  );

  const allVisibleSelected =
    eligibleIds.length > 0 &&
    eligibleIds.every((id) => selectedVisibleIds.includes(id));

  const selectedUser = users.find((user) => String(user._id) === String(recipient));

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      if (unreadOnly && !(Number(user.unreadCount) > 0)) return false;
      if (roleFilter !== "all" && String(user.role || "").toLowerCase() !== roleFilter) {
        return false;
      }
      if (!query) return true;
      const haystack = `${user.name || ""} ${user.role || ""} ${user.registrationNumber || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [users, searchTerm, unreadOnly, roleFilter]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [visible.length, open, recipient]);

  const eligibleKey = eligibleIds.join("|");
  useEffect(() => {
    setSelectedMessages((items) => items.filter((id) => eligibleIds.includes(id)));
    // eligibleKey tracks membership changes without depending on array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional membership key
  }, [eligibleKey]);

  const selectConversation = (peerId) => {
    setRecipient(String(peerId));
    setEditingId(null);
    setSelectedMessages([]);
    setManageMode(false);
  };

  const sendText = async () => {
    if (!recipient || !text.trim()) return;
    setSending(true);
    try {
      await api.post("/messages", { recipient, text: text.trim() });
      setText("");
      await Promise.all([loadMessages(), loadUsers()]);
    } catch (error) {
      alert(error.response?.data?.message || "Message failed.");
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
    } catch (error) {
      alert(error.response?.data?.message || "Message could not be edited.");
    }
  };

  const deleteMessage = async (id) => {
    if (!window.confirm("Delete this message?")) return;
    try {
      await api.delete(`/messages/${id}`);
      setSelectedMessages((items) => items.filter((item) => item !== id));
      await Promise.all([loadMessages(), loadUsers()]);
    } catch (error) {
      alert(error.response?.data?.message || "Message could not be deleted.");
    }
  };

  const toggleMessageSelection = (id) => {
    setSelectedMessages((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id]
    );
  };

  const toggleSelectAll = () => {
    if (!eligibleIds.length) return;
    setSelectedMessages((items) =>
      allVisibleSelected
        ? items.filter((id) => !eligibleIds.includes(id))
        : Array.from(new Set([...items.filter((id) => eligibleIds.includes(id)), ...eligibleIds]))
    );
  };

  const deleteSelected = async () => {
    if (!selectedVisibleIds.length) return;
    if (
      !window.confirm(
        `Delete ${selectedVisibleIds.length} selected message${selectedVisibleIds.length === 1 ? "" : "s"}?`
      )
    ) {
      return;
    }
    try {
      await api.post("/messages/bulk-delete", { ids: selectedVisibleIds });
      setSelectedMessages([]);
      await Promise.all([loadMessages(), loadUsers()]);
    } catch (error) {
      alert(error.response?.data?.message || "Selected messages could not be deleted.");
    }
  };

  const clearAllMessages = async () => {
    if (!messages.length) return;
    if (
      !window.confirm(
        "Clear all messages? This removes the conversation history from the system."
      )
    ) {
      return;
    }
    try {
      await api.delete("/messages");
      setMessages([]);
      setSelectedMessages([]);
      setManageMode(false);
      await loadUsers();
    } catch (error) {
      alert(error.response?.data?.message || "Messages could not be cleared.");
    }
  };

  const togglePin = async (peerId, currentlyPinned) => {
    try {
      await api.put(`/messages/pins/${encodeURIComponent(peerId)}`, {
        pinned: !currentlyPinned,
      });
      await loadUsers();
    } catch (error) {
      alert(error.response?.data?.message || "Could not update pin.");
    }
  };

  const exitManageMode = () => {
    setManageMode(false);
    setSelectedMessages([]);
  };

  const startRecording = async () => {
    if (!recipient) {
      alert("Select a user first.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      alert("Voice recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) =>
        event.data.size && chunksRef.current.push(event.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (!blob.size) {
          alert("No audio was recorded.");
          return;
        }
        const form = new FormData();
        form.append("recipient", recipient);
        form.append("voice", blob, "voice-message.webm");
        setSending(true);
        try {
          await api.post("/messages/voice", form);
          await Promise.all([loadMessages(), loadUsers()]);
        } catch (error) {
          alert(error.response?.data?.message || "Voice message failed.");
        } finally {
          setSending(false);
        }
      };
      recorder.start();
      setRecording(true);
    } catch {
      alert("Microphone permission is required for voice messages.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <>
      {showTrigger && (
        <button
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next) window.dispatchEvent(new CustomEvent("quickcheck:close-notifications"));
          }}
          className="message-float"
          title={open ? "Close messages" : "Open messages"}
        >
          <MessageCircle size={20} />
          <span>Messages</span>
        </button>
      )}
      {open && (
        <div
          ref={panelRef}
          className="message-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Messages"
        >
          <div
            className="message-panel-header flex items-center justify-between gap-3 p-4 border-b shrink-0"
            style={{ borderColor: "var(--border)" }}
          >
            <div>
              <b>Messages</b>
              <p className="theme-muted text-[10px]">
                {role ? `${role} conversations` : "Text and voice messages"}
              </p>
            </div>
            <div className="qc-list-toolbar">
              <button
                type="button"
                className={`qc-manage-toggle ${manageMode ? "is-active" : ""}`}
                onClick={() => (manageMode ? exitManageMode() : setManageMode(true))}
                aria-pressed={manageMode}
                disabled={!recipient || !eligibleIds.length}
              >
                {manageMode ? "Done" : "Manage"}
              </button>
              <OverflowMenu
                label="Message panel actions"
                items={[
                  {
                    id: "clear-all",
                    label: "Clear all conversations",
                    danger: true,
                    icon: <Trash2 size={14} />,
                    disabled: !messages.length,
                    onSelect: clearAllMessages,
                  },
                ]}
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="icon-btn"
                title="Close messages"
                aria-label="Close messages"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="message-panel-body flex min-h-0 flex-1">
            <aside
              className="message-conversation-list shrink-0 border-r flex flex-col min-h-0"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="p-2 space-y-2 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
                <label className="qc-search-field">
                  <Search size={14} aria-hidden="true" />
                  <input
                    className="qc-input !border-0 !bg-transparent !px-0 !min-h-0"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search people…"
                    aria-label="Search conversations"
                  />
                </label>
                <div className="qc-list-toolbar !gap-1.5">
                  <button
                    type="button"
                    className={`qc-filter-chip ${unreadOnly ? "is-active" : ""}`}
                    onClick={() => setUnreadOnly((value) => !value)}
                    aria-pressed={unreadOnly}
                  >
                    Unread
                  </button>
                  <select
                    className="qc-input !min-h-9 !py-1 !text-[11px] !w-auto"
                    value={roleFilter}
                    onChange={(event) => setRoleFilter(event.target.value)}
                    aria-label="Filter by role"
                  >
                    <option value="all">All roles</option>
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 p-1.5 space-y-1">
                {usersStatus === "loading" && (
                  <p className="qc-empty-panel !py-8 !text-xs">Loading conversations…</p>
                )}
                {usersStatus === "error" && (
                  <p className="qc-empty-panel !py-8 !text-xs">
                    Conversations are unavailable right now.
                  </p>
                )}
                {usersStatus === "ready" && !filteredUsers.length && (
                  <p className="qc-empty-panel !py-8 !text-xs">
                    No conversations match your filters.
                  </p>
                )}
                {filteredUsers.map((user) => {
                  const active = String(user._id) === String(recipient);
                  const unread = Number(user.unreadCount) > 0;
                  return (
                    <div
                      key={user._id}
                      className={`qc-conversation-item ${active ? "is-active" : ""} ${unread ? "is-unread" : ""}`}
                    >
                      <button
                        type="button"
                        className="qc-conversation-item__main"
                        onClick={() => selectConversation(user._id)}
                      >
                        <span className="qc-avatar" aria-hidden="true">
                          {initials(user.name)}
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[11px] font-semibold">
                              {user.name || "User"}
                            </span>
                            {user.pinned && (
                              <Pin size={10} className="accent-text shrink-0" aria-label="Pinned" />
                            )}
                          </span>
                          <span className="theme-muted text-[9px] uppercase tracking-wide">
                            {roleLabel(user.role)}
                          </span>
                          <span className="block theme-muted text-[10px] truncate mt-0.5">
                            {user.lastMessagePreview || "No messages yet"}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          {user.lastMessageAt && (
                            <span className="block theme-muted text-[9px]">
                              {new Date(user.lastMessageAt).toLocaleDateString()}
                            </span>
                          )}
                          {unread && (
                            <span className="qc-unread-dot" aria-label={`${user.unreadCount} unread`}>
                              {user.unreadCount > 9 ? "9+" : user.unreadCount}
                            </span>
                          )}
                        </span>
                      </button>
                      <OverflowMenu
                        label={`Actions for ${user.name || "conversation"}`}
                        items={[
                          {
                            id: `pin-${user._id}`,
                            label: user.pinned ? "Unpin conversation" : "Pin conversation",
                            icon: user.pinned ? <PinOff size={14} /> : <Pin size={14} />,
                            onSelect: () => togglePin(user._id, Boolean(user.pinned)),
                          },
                        ]}
                      />
                    </div>
                  );
                })}
              </div>
            </aside>

            <div className="flex-1 min-w-0 flex flex-col min-h-0">
              <div
                className="px-3 py-2 border-b shrink-0 flex items-center justify-between gap-2"
                style={{ borderColor: "var(--border)" }}
              >
                {selectedUser ? (
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{selectedUser.name}</p>
                    <p className="theme-muted text-[10px] truncate">
                      {roleLabel(selectedUser.role)}
                      {selectedUser.email ? ` · ${selectedUser.email}` : ""}
                    </p>
                  </div>
                ) : (
                  <p className="theme-muted text-xs">Select a conversation</p>
                )}
              </div>

              {manageMode && eligibleIds.length > 0 && (
                <div className="qc-chat-selection-bar mx-3 mt-2">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="qc-chat-toolbar-btn accent"
                  >
                    <CheckSquare size={13} aria-hidden="true" />
                    {allVisibleSelected ? "Deselect all" : "Select all"}
                  </button>
                  <span className="qc-chat-selection-count" aria-live="polite">
                    {selectedVisibleIds.length} selected
                  </span>
                  <button
                    type="button"
                    onClick={deleteSelected}
                    disabled={!selectedVisibleIds.length}
                    className="qc-chat-toolbar-btn danger"
                  >
                    <Trash2 size={13} aria-hidden="true" /> Delete selected
                  </button>
                </div>
              )}

              <div
                ref={threadRef}
                className="message-thread flex-1 overflow-y-auto p-3 space-y-2 min-h-0"
              >
                {!recipient ? (
                  <p className="qc-empty-panel">
                    Choose a conversation to view messages or start chatting.
                  </p>
                ) : messagesStatus === "error" ? (
                  <p className="qc-empty-panel">Messages could not be loaded.</p>
                ) : visible.length ? (
                  visible.map((message) => {
                    const mine = Boolean(message.isMine);
                    const isText = Boolean(message.text);
                    const selected = selectedVisibleIds.includes(message._id);
                    return (
                      <div
                        key={message._id}
                        className={`qc-chat-bubble ${mine ? "is-mine" : "is-theirs"} ${selected ? "is-selected" : ""}`}
                      >
                        <div className="qc-chat-bubble__meta">
                          <label className="qc-chat-select">
                            {manageMode && (
                              <input
                                type="checkbox"
                                className="qc-chat-checkbox"
                                checked={selected}
                                onChange={() => toggleMessageSelection(message._id)}
                                aria-label={`Select message from ${mine ? "you" : message.sender?.name || "user"}`}
                              />
                            )}
                            <span>
                              {mine ? "You" : message.sender?.name || selectedUser?.name || "User"}
                              {" · "}
                              {new Date(message.createdAt).toLocaleString()}
                              {message.editedAt ? " · edited" : ""}
                            </span>
                          </label>
                          <div className="qc-chat-bubble__actions">
                            {mine && isText && (
                              <button
                                type="button"
                                className="message-action"
                                title="Edit message"
                                aria-label="Edit message"
                                onClick={() => startEdit(message)}
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                            <OverflowMenu
                              label="Message actions"
                              items={[
                                {
                                  id: `delete-${message._id}`,
                                  label: "Delete message",
                                  danger: true,
                                  icon: <Trash2 size={14} />,
                                  onSelect: () => deleteMessage(message._id),
                                },
                              ]}
                            />
                          </div>
                        </div>
                        {editingId === message._id ? (
                          <div className="space-y-2">
                            <textarea
                              className="qc-input"
                              value={editText}
                              onChange={(event) => setEditText(event.target.value)}
                              rows={2}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="btn-primary text-xs"
                                onClick={() => saveEdit(message._id)}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="icon-btn text-xs"
                                onClick={() => setEditingId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {isText && <p className="qc-chat-bubble__text">{message.text}</p>}
                            {message.voiceFile && <VoiceMessage id={message._id} />}
                          </>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="qc-empty-panel">
                    No messages yet. Send a text or voice message below.
                  </p>
                )}
              </div>

              <div
                className="message-composer p-3 border-t flex gap-2 shrink-0"
                style={{ borderColor: "var(--border)" }}
              >
                <input
                  className="qc-input flex-1 min-w-0"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={
                    recipient ? "Write a message…" : "Select a conversation first"
                  }
                  disabled={!recipient || sending}
                  aria-label="Message text"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") sendText();
                  }}
                />
                <button
                  type="button"
                  className={`icon-btn ${recording ? "accent-soft" : ""}`}
                  onClick={recording ? stopRecording : startRecording}
                  disabled={!recipient || sending}
                  title={recording ? "Stop recording" : "Voice message"}
                  aria-label={recording ? "Stop recording" : "Record voice message"}
                >
                  {recording ? <Square size={16} /> : <Mic size={16} />}
                </button>
                <button
                  type="button"
                  disabled={sending || !recipient}
                  className="btn-primary px-4"
                  onClick={sendText}
                  aria-label="Send message"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
