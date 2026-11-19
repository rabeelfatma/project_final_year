import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot, Send, X, Sparkles, Paperclip, Image as ImageIcon,
  Download, FileText, Trash2, Edit3, Plus, MessageSquare, CheckSquare,
  Pin, PinOff
} from "lucide-react";
import api from "../../utils/api";
import { getApiOrigin } from "../../utils/apiBase";
import { buildArtifactDownloadRequest } from "../../utils/artifactDownloadUrl";
import OverflowMenu from "../ui/OverflowMenu";
import SearchField from "../ui/SearchField";


const MAX_CHAT_FILES = 40;
const ACCEPTED = ".pdf,.doc,.docx,.txt,.md,.rtf,.csv,.json,.xml,.yaml,.yml,.xlsx,.xls,.ods,.pptx,.ppt,.odp,.zip,.rar,.7z,.tar,.gz,.py,.ipynb,.js,.jsx,.ts,.tsx,.cpp,.c,.h,.hpp,.java,.php,.cs,.swift,.go,.rs,.kt,.kts,.sql,.html,.htm,.css,.scss,.sass,.less,.vue,.svelte,.sh,.bat,.ps1,.rb,.r,.m,.mm,.dart,.lua,.pl,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.heic,.heif,.tif,.tiff,.mp4,.mkv,.webm,.mov,.avi,.wmv,.mpeg,.mpg,.m4v,.mp3,.wav,.ogg,.aac,.flac,.m4a";

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const getSavedChats = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
};

export default function AIChatbot({ role, showTrigger = true }) {
  const storageKey = `quickcheck_ai_chats_${role || "user"}`;
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [conversations, setConversations] = useState(() => getSavedChats(storageKey));
  const [activeChatId, setActiveChatId] = useState(() => getSavedChats(storageKey)[0]?.id || null);
  const [serverReady, setServerReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [selectedChats, setSelectedChats] = useState([]);
  const [manageMode, setManageMode] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const fileRef = useRef(null);
  const imageRef = useRef(null);
  const messageListRef = useRef(null);

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
    });
  }, [conversations]);

  const visibleConversations = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    if (!query) return sortedConversations;
    return sortedConversations.filter((chat) => {
      const title = String(chat.title || "").toLowerCase();
      const preview = (chat.messages || [])
        .slice(-3)
        .map((message) => String(message.text || ""))
        .join(" ")
        .toLowerCase();
      return title.includes(query) || preview.includes(query);
    });
  }, [sortedConversations, historySearch]);

  const activeChat = useMemo(
    () => conversations.find((chat) => chat.id === activeChatId) || null,
    [conversations, activeChatId]
  );
  const messages = activeChat?.messages || [];
  const visibleIds = visibleConversations.map((chat) => chat.id);
  const selectedVisibleIds = selectedChats.filter((id) => visibleIds.includes(id));
  const allChatsSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedVisibleIds.includes(id));

  const visibleIdsKey = visibleIds.join("|");
  useEffect(() => {
    setSelectedChats((previous) => previous.filter((id) => visibleIds.includes(id)));
    // visibleIdsKey tracks membership changes without depending on array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional membership key
  }, [visibleIdsKey]);

  // Load this user's chat history from MongoDB. Existing browser-only chats are
  // migrated once when the database does not yet contain chat history.
  useEffect(() => {
    let cancelled = false;
    const loadServerChats = async () => {
      if (!localStorage.getItem("token")) {
        setServerReady(true);
        return;
      }
      try {
        const { data } = await api.get("/ai-chats", { params: { role } });
        if (cancelled) return;
        const remoteChats = Array.isArray(data) ? data : [];
        if (remoteChats.length) {
          setConversations(remoteChats);
          setActiveChatId((current) => remoteChats.some((chat) => chat.id === current) ? current : (remoteChats[0]?.id || null));
        } else {
          const localChats = getSavedChats(storageKey);
          setConversations(localChats);
          setActiveChatId(localChats[0]?.id || null);
          for (const chat of localChats) {
            try { await api.put(`/ai-chats/${encodeURIComponent(chat.id)}`, { role, title: chat.title, messages: chat.messages }); } catch (error) { console.error("Could not migrate local AI chat:", error.response?.data || error.message); }
          }
        }
      } catch (error) {
        console.error("Could not load database chat history:", error.response?.data || error.message);
      } finally {
        if (!cancelled) setServerReady(true);
      }
    };
    setServerReady(false);
    loadServerChats();
    return () => { cancelled = true; };
  }, [role, storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(conversations));
    } catch (_) {
      // Browser cache is only a fallback; MongoDB is the persistent source.
    }
  }, [conversations, storageKey]);

  // Persist the active conversation after every message/chat update. The API
  // scopes every write to the authenticated user and their own role.
  useEffect(() => {
    if (!serverReady || !activeChatId || !localStorage.getItem("token")) return;
    const chat = conversations.find((item) => item.id === activeChatId);
    if (!chat) return;
    const timer = setTimeout(() => {
      api.put(`/ai-chats/${encodeURIComponent(chat.id)}`, {
        role, title: chat.title || "New chat", messages: chat.messages || []
      }).catch((error) => console.error("Could not save AI chat to database:", error.response?.data || error.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [conversations, activeChatId, role, serverReady]);

  useEffect(() => {
    const openAI = () => setOpen(true);
    window.addEventListener("quickcheck:open-ai", openAI);
    return () => window.removeEventListener("quickcheck:open-ai", openAI);
  }, []);

  useEffect(() => {
    if (activeChatId && !conversations.some((chat) => chat.id === activeChatId)) {
      setActiveChatId(conversations[0]?.id || null);
    }
  }, [conversations, activeChatId]);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, loading, open]);

  const createChat = () => {
    const chat = { id: makeId(), title: "New chat", pinned: false, messages: [], updatedAt: Date.now() };
    setConversations((previous) => [chat, ...previous]);
    setActiveChatId(chat.id);
    setQuestion("");
    setEditingMessageId(null);
    setFiles([]);
  };

  const renameChat = async (chat) => {
    const nextTitle = window.prompt("Rename chat", chat.title || "New chat");
    if (nextTitle == null) return;
    const title = String(nextTitle).trim().slice(0, 120) || "New chat";
    try {
      if (localStorage.getItem("token")) {
        await api.patch(`/ai-chats/${encodeURIComponent(chat.id)}/meta`, { title });
      }
      setConversations((previous) =>
        previous.map((item) =>
          item.id === chat.id ? { ...item, title, updatedAt: Date.now() } : item
        )
      );
    } catch (error) {
      alert(error.response?.data?.message || "Could not rename chat.");
    }
  };

  const togglePinChat = async (chat) => {
    const pinned = !chat.pinned;
    try {
      if (localStorage.getItem("token")) {
        await api.patch(`/ai-chats/${encodeURIComponent(chat.id)}/meta`, { pinned });
      }
      setConversations((previous) =>
        previous.map((item) =>
          item.id === chat.id ? { ...item, pinned, updatedAt: Date.now() } : item
        )
      );
    } catch (error) {
      alert(error.response?.data?.message || "Could not update pin.");
    }
  };

  const addFiles = (list) => {
    const incoming = Array.from(list || []);
    if (!incoming.length) return;
    setFiles((previous) => {
      const combined = [...previous, ...incoming];
      if (combined.length > MAX_CHAT_FILES) {
        alert(`Maximum ${MAX_CHAT_FILES} files/images can be attached at one time.`);
      }
      return combined.slice(0, MAX_CHAT_FILES);
    });
  };

  const deleteChat = async (id) => {
    if (!window.confirm("Delete this chat?")) return;
    try {
      if (localStorage.getItem("token")) await api.delete(`/ai-chats/${encodeURIComponent(id)}`);
    } catch (error) {
      // A locally cached chat may not have been migrated to the server yet.
      if (error.response?.status !== 404) console.error("Could not delete database chat:", error.response?.data || error.message);
    }
    setConversations((previous) => previous.filter((chat) => chat.id !== id));
    setSelectedChats((previous) => previous.filter((chatId) => chatId !== id));
    if (activeChatId === id) {
      const next = conversations.find((chat) => chat.id !== id);
      setActiveChatId(next?.id || null);
    }
  };

  const exitManageMode = () => {
    setManageMode(false);
    setSelectedChats([]);
  };

  const toggleSelectAllChats = () => {
    if (!visibleIds.length) return;
    setSelectedChats((previous) =>
      allChatsSelected
        ? previous.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...previous.filter((id) => visibleIds.includes(id)), ...visibleIds]))
    );
  };

  const deleteSelectedChats = async () => {
    if (!selectedVisibleIds.length) return;
    if (!window.confirm(`Delete ${selectedVisibleIds.length} selected chat${selectedVisibleIds.length === 1 ? "" : "s"}?`)) return;
    try {
      if (localStorage.getItem("token")) await api.post("/ai-chats/bulk-delete", { ids: selectedVisibleIds });
    } catch (error) {
      console.error("Could not delete selected database chats:", error.response?.data || error.message);
      alert("Some chats could not be deleted from the database. Please refresh and try again.");
      return;
    }
    const deletingActive = selectedVisibleIds.includes(activeChatId);
    const remaining = conversations.filter((chat) => !selectedVisibleIds.includes(chat.id));
    setConversations(remaining);
    setSelectedChats([]);
    if (deletingActive) setActiveChatId(remaining[0]?.id || null);
  };

  const downloadArtifact = async (artifact) => {
    // Only same-origin relative /api/ai/generated/... paths may receive the JWT.
    // Absolute, protocol-relative, and unexpected URLs are rejected without fetching.
    const request = buildArtifactDownloadRequest(
      artifact?.downloadUrl,
      getApiOrigin(),
      localStorage.getItem("token")
    );
    if (!request) return alert("Generated file download failed.");
    const response = await fetch(request.url, { headers: request.headers });
    if (!response.ok) return alert("Generated file download failed.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = artifact.name || "generated-file";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const ask = async (event) => {
    event?.preventDefault();
    if ((!question.trim() && files.length === 0) || loading) return;

    const q = question.trim() || "Please analyze the attached files.";
    const attachedNames = files.map((file) => file.name);
    let chatId = activeChatId;

    if (!chatId) {
      chatId = makeId();
      setActiveChatId(chatId);
      setConversations((previous) => [
        { id: chatId, title: q.slice(0, 48) || "New chat", messages: [], updatedAt: Date.now() },
        ...previous,
      ]);
    }

    const userMessageId = editingMessageId || makeId();
    const userMessage = { id: userMessageId, from: "user", text: q, attachments: attachedNames, createdAt: Date.now() };
    setConversations((previous) => {
      const existing = previous.find((chat) => chat.id === chatId);
      if (!existing) {
        return [{ id: chatId, title: q.slice(0, 48) || "New chat", messages: [userMessage], updatedAt: Date.now() }, ...previous];
      }
      let nextMessages;
      if (editingMessageId) {
        const index = existing.messages.findIndex((message) => message.id === editingMessageId);
        nextMessages = index < 0
          ? [...existing.messages, userMessage]
          : [...existing.messages.slice(0, index), userMessage];
      } else {
        nextMessages = [...existing.messages, userMessage];
      }
      return [
        { ...existing, title: existing.title === "New chat" ? q.slice(0, 48) : existing.title, messages: nextMessages, updatedAt: Date.now() },
        ...previous.filter((chat) => chat.id !== chatId),
      ];
    });

    setQuestion("");
    setEditingMessageId(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("question", q);
      files.forEach((file) => formData.append("files", file));
      const { data } = await api.post("/ai/chat", formData);
      const aiMessage = { id: makeId(), from: "ai", text: data.answer || "No answer returned.", artifacts: data.artifacts || [], createdAt: Date.now() };
      setConversations((previous) => previous.map((chat) =>
        chat.id === chatId
          ? { ...chat, messages: [...chat.messages, aiMessage], updatedAt: Date.now() }
          : chat
      ));
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      if (imageRef.current) imageRef.current.value = "";
    } catch (error) {
      const serverMessage = error.response?.data?.message;
      const aiMessage = {
        id: makeId(),
        from: "ai",
        text: serverMessage || "The AI assistant is temporarily unavailable. Please try again shortly.",
        createdAt: Date.now(),
      };
      setConversations((previous) => previous.map((chat) =>
        chat.id === chatId
          ? { ...chat, messages: [...chat.messages, aiMessage], updatedAt: Date.now() }
          : chat
      ));
    } finally {
      setLoading(false);
    }
  };

  const editMessage = (message) => {
    setQuestion(message.text || "");
    setEditingMessageId(message.id);
  };

  const suggestions = role === "student"
    ? ["How many assignments have I submitted?", "How many are still pending?", "Show my graded assignments and scores."]
    : role === "teacher"
    ? ["How many assignments have I created?", "Create a Python starter file for a new assignment.", "Create a 6-slide PPTX lesson outline and give me a download."]
    : ["How many students, teachers and assignments are in the system?", "How many assignments were created recently?", "Give me a system summary."];

  const roleLabel = role === "admin" ? "Admin" : role === "teacher" ? "Teacher" : role === "student" ? "Student" : "Workspace";

  return <>
    {showTrigger && <button onClick={() => setOpen((value) => !value)} className="ai-float" title={`${roleLabel} AI assistant`}><Bot size={20}/><span>AI</span></button>}
    {open && <div className="ai-chat-panel" role="dialog" aria-label="QuickCheck AI">
      <div className="flex items-center justify-between border-b p-4 shrink-0" style={{ borderColor: "var(--border)" }}>
        <div>
          <b className="flex items-center gap-2">
            <Sparkles size={16} className="accent-text" aria-hidden="true" />
            QuickCheck AI
          </b>
          <p className="theme-muted text-[10px]">{roleLabel} workspace assistant</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="icon-btn" title="Close AI assistant" aria-label="Close AI assistant"><X size={18}/></button>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="ai-chat-sidebar shrink-0 border-r p-2 flex flex-col gap-2 min-h-0" style={{ borderColor: "var(--border)" }}>
          <div className="qc-list-toolbar !gap-1.5">
            <button type="button" onClick={createChat} className="ai-suggestion flex-1 flex items-center justify-center gap-1 !py-2">
              <Plus size={13} aria-hidden="true" /> New chat
            </button>
            <button
              type="button"
              className={`qc-manage-toggle ${manageMode ? "is-active" : ""}`}
              onClick={() => (manageMode ? exitManageMode() : setManageMode(true))}
              aria-pressed={manageMode}
              title={manageMode ? "Exit manage mode" : "Manage chats"}
              disabled={!visibleConversations.length}
            >
              {manageMode ? "Done" : "Manage"}
            </button>
          </div>
          <SearchField
            className="!py-1.5"
            inputClassName="!text-[11px]"
            value={historySearch}
            onChange={setHistorySearch}
            placeholder="Search chats…"
            label="Search conversation history"
          />
          {manageMode && visibleConversations.length > 0 && (
            <div className="qc-chat-selection-bar !mt-0 !px-0">
              <button type="button" onClick={toggleSelectAllChats} className="qc-chat-toolbar-btn accent">
                <CheckSquare size={13} aria-hidden="true" />
                {allChatsSelected ? "Deselect all" : "Select all"}
              </button>
              <span className="qc-chat-selection-count" aria-live="polite">
                {selectedVisibleIds.length} selected
              </span>
              <button
                type="button"
                onClick={deleteSelectedChats}
                disabled={!selectedVisibleIds.length}
                className="qc-chat-toolbar-btn danger"
              >
                <Trash2 size={12} aria-hidden="true" /> Delete
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {visibleConversations.map((chat) => (
              <div
                key={chat.id}
                className={`qc-ai-chat-item ${activeChatId === chat.id ? "is-active" : ""} ${selectedVisibleIds.includes(chat.id) ? "is-selected" : ""}`}
              >
                {manageMode && (
                  <label className="qc-chat-select !mb-0">
                    <input
                      className="qc-chat-checkbox"
                      aria-label={`Select chat ${chat.title || "New chat"}`}
                      type="checkbox"
                      checked={selectedVisibleIds.includes(chat.id)}
                      onChange={(event) => setSelectedChats((previous) => event.target.checked ? [...previous, chat.id] : previous.filter((id) => id !== chat.id))}
                    />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => { setActiveChatId(chat.id); setEditingMessageId(null); setQuestion(""); }}
                  className="flex-1 min-w-0 text-left py-1"
                >
                  <span className="flex items-center gap-1">
                    {chat.pinned ? <Pin size={11} className="accent-text" aria-hidden="true" /> : <MessageSquare size={11} aria-hidden="true" />}
                    <span className="truncate text-[10px] font-semibold">{chat.title || "New chat"}</span>
                  </span>
                </button>
                <OverflowMenu
                  label={`Actions for ${chat.title || "chat"}`}
                  items={[
                    {
                      id: `rename-${chat.id}`,
                      label: "Rename",
                      icon: <Edit3 size={14} />,
                      onSelect: () => renameChat(chat),
                    },
                    {
                      id: `pin-${chat.id}`,
                      label: chat.pinned ? "Unpin" : "Pin",
                      icon: chat.pinned ? <PinOff size={14} /> : <Pin size={14} />,
                      onSelect: () => togglePinChat(chat),
                    },
                    {
                      id: `delete-${chat.id}`,
                      label: "Delete chat",
                      danger: true,
                      icon: <Trash2 size={14} />,
                      onSelect: () => deleteChat(chat.id),
                    },
                  ]}
                />
              </div>
            ))}
            {!conversations.length && (
              <p className="qc-empty-panel !py-6 !text-[10px]">No chats yet. Start a new conversation.</p>
            )}
            {conversations.length > 0 && !visibleConversations.length && (
              <p className="qc-empty-panel !py-6 !text-[10px]">No chats match your search.</p>
            )}
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="p-3 flex flex-wrap gap-2 shrink-0">
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)} className="ai-suggestion">
                {suggestion}
              </button>
            ))}
          </div>
          <div ref={messageListRef} className="ai-message-thread flex-1 overflow-y-auto px-3 pb-3 space-y-2 min-h-0">
            {messages.length === 0 && (
              <div className="theme-muted text-sm text-center py-12">Ask a question to begin this chat.</div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`qc-chat-bubble ${message.from === "user" ? "is-mine" : "is-theirs"}`}
              >
                <div className="qc-chat-bubble__meta">
                  <span className="theme-muted text-[10px]">
                    {message.from === "user" ? "You" : "Assistant"}
                    {message.createdAt ? ` · ${new Date(message.createdAt).toLocaleString()}` : ""}
                  </span>
                </div>
                <div className="qc-chat-bubble__text">{message.text}</div>
                {message.attachments?.length > 0 && (
                  <div className="theme-muted text-[10px] mt-2">Attached: {message.attachments.join(", ")}</div>
                )}
                {message.from === "user" && (
                  <div className="mt-2 flex justify-end">
                    <button type="button" onClick={() => editMessage(message)} className="theme-muted hover:accent-text text-[10px] flex items-center gap-1">
                      <Edit3 size={12} aria-hidden="true" /> Edit and resend
                    </button>
                  </div>
                )}
                {message.artifacts?.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {message.artifacts.map((artifact, index) => (
                      <button
                        key={`${artifact.name}-${index}`}
                        type="button"
                        onClick={() => downloadArtifact(artifact)}
                        className="w-full flex items-center gap-2 p-2 rounded-xl border hover:border-[var(--accent)] text-left"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <FileText size={14} className="accent-text" aria-hidden="true" />
                        <span className="flex-1 truncate text-xs font-bold">{artifact.name}</span>
                        <Download size={14} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && <div className="theme-muted text-xs px-1">Thinking…</div>}
          </div>
          {role === "teacher" && (
            <div className="px-3 pb-2 shrink-0">
              <input ref={fileRef} type="file" multiple accept={ACCEPTED} className="hidden" onChange={(event) => addFiles(event.target.files)} />
              <input ref={imageRef} type="file" multiple accept="image/*" className="hidden" onChange={(event) => addFiles(event.target.files)} />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="ai-suggestion flex items-center gap-1">
                  <Paperclip size={13} aria-hidden="true" /> Files
                </button>
                <button type="button" onClick={() => imageRef.current?.click()} className="ai-suggestion flex items-center gap-1">
                  <ImageIcon size={13} aria-hidden="true" /> Images
                </button>
                {files.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setFiles([]); if (fileRef.current) fileRef.current.value = ""; if (imageRef.current) imageRef.current.value = ""; }}
                    className="theme-muted ml-auto"
                    title="Clear attachments"
                    aria-label="Clear attachments"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {files.length > 0 && (
                <div className="mt-2 max-h-20 overflow-y-auto flex flex-wrap gap-1">
                  {files.map((file, index) => (
                    <span key={`${file.name}-${index}`} className="text-[9px] px-2 py-1 rounded-lg accent-soft max-w-[150px] truncate">
                      {file.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <form onSubmit={ask} className="message-composer p-3 border-t flex gap-2 shrink-0" style={{ borderColor: "var(--border)" }}>
            <textarea
              rows={2}
              className="qc-input ai-command-input flex-1 min-w-0 resize-y"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={editingMessageId ? "Edit message and resend…" : "Ask a question or request a file…"}
              aria-label="AI assistant message"
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  ask(event);
                }
              }}
            />
            {editingMessageId && (
              <button type="button" onClick={() => { setEditingMessageId(null); setQuestion(""); }} className="theme-muted" title="Cancel edit" aria-label="Cancel edit">
                <X size={16} />
              </button>
            )}
            <button type="submit" disabled={loading} className="btn-primary px-4" aria-label="Send to AI assistant">
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>}
  </>;
}
