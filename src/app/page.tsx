"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Paperclip, X, Plus, MessageSquare,
  Trash2, ChevronDown, Download, Brain,
  Video, Music, Loader2, ExternalLink, Image as ImageIcon,
  Link, Save, ChevronRight
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  videoCard?: VideoCard;
  imagePreview?: string;
}

interface VideoCard {
  url: string;
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  platform: string;
  formats: VideoFormat[];
  downloading?: string | null;
  downloaded?: boolean;
}

interface VideoFormat {
  format_id: string;
  ext: string;
  height: number;
  fps: number | null;
  filesize: number | null;
  label: string;
  type?: string;
  bestAudioFormatId?: string | null;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  memory: boolean;
  createdAt: number;
}

interface FileCtx {
  name: string;
  content: string;
}

interface StorageInfo {
  used: number;
  total: number;
  percent: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = "orrin_chats";
const GLOBAL_MEMORY_KEY = "orrin_global_memory";
const STORAGE_TOTAL = 5 * 1024 * 1024;
const HF_API = "https://tecwiz-orrin-video-api.hf.space";
const VIDEO_REGEX = /https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/|tiktok\.com\/@|instagram\.com\/(p|reel|tv)\/|twitter\.com\/\w+\/status|x\.com\/\w+\/status|facebook\.com\/)[^\s]+/i;
const URL_REGEX = /https?:\/\/[^\s]+/i;

// ── Memory Helpers ─────────────────────────────────────────────────────────────
function loadGlobalMemory(): string {
  try {
    return localStorage.getItem(GLOBAL_MEMORY_KEY) || "";
  } catch { return ""; }
}

function saveGlobalMemory(text: string) {
  try {
    localStorage.setItem(GLOBAL_MEMORY_KEY, text);
  } catch { console.warn("Storage full"); }
}

function appendFacts(facts: string[]) {
  if (!facts.length) return;
  const existing = loadGlobalMemory();
  const existingLines = existing.split("\n").filter(Boolean);
  const newFacts = facts.filter(f => !existingLines.some(e => e.toLowerCase().includes(f.toLowerCase().slice(0, 20))));
  if (!newFacts.length) return;
  const updated = [...existingLines, ...newFacts].join("\n");
  saveGlobalMemory(updated);
}

// ── Other Helpers ──────────────────────────────────────────────────────────────
function genId() { return Math.random().toString(36).slice(2, 10); }

function formatBytes(b: number) {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / (1024 * 1024)).toFixed(2)}MB`;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number | null) {
  if (!bytes || bytes === 0) return "~";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getStorageInfo(): StorageInfo {
  let used = 0;
  for (const key in localStorage) {
    if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
      used += (localStorage[key].length + key.length) * 2;
    }
  }
  return { used, total: STORAGE_TOTAL, percent: (used / STORAGE_TOTAL) * 100 };
}

function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveChats(chats: Chat[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch { console.warn("Storage full"); }
}

function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w+)?\n?([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^### (.*)/gm, "<h3>$1</h3>")
    .replace(/^## (.*)/gm, "<h2>$1</h2>")
    .replace(/^# (.*)/gm, "<h1>$1</h1>")
    .replace(/^- (.*)/gm, "<li>$1</li>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\n/g, "<br/>");
}

function createNewChat(): Chat {
  return {
    id: genId(),
    title: "New chat",
    messages: [],
    memory: true,
    createdAt: Date.now(),
  };
}

// ── Video Card Component ───────────────────────────────────────────────────────
function VideoCardUI({ card, messageId, onDownload, onDelete }: {
  card: VideoCard;
  messageId: string;
  onDownload: (messageId: string, format: VideoFormat) => void;
  onDelete: (messageId: string) => void;
}) {
  return (
    <div style={{
      background: "#0d0d0d", border: "1px solid #1a1a1a",
      borderRadius: 10, overflow: "hidden", maxWidth: 440, marginTop: 10,
    }}>
      <div style={{ position: "relative", aspectRatio: "16/9", background: "#111" }}>
        {card.thumbnail && (
          <img src={card.thumbnail} alt={card.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }}
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        {card.duration > 0 && (
          <div style={{
            position: "absolute", bottom: 8, right: 8,
            background: "rgba(0,0,0,0.85)", borderRadius: 4,
            padding: "2px 6px", fontSize: 11, color: "#888",
            fontFamily: "'Geist Mono', monospace",
          }}>
            {formatDuration(card.duration)}
          </div>
        )}
        <div style={{
          position: "absolute", top: 8, left: 8,
          background: "rgba(0,0,0,0.75)", borderRadius: 4,
          padding: "2px 7px", fontSize: 10, color: "#555",
          fontFamily: "'Geist Mono', monospace", letterSpacing: "0.06em",
        }}>
          {card.platform?.toUpperCase()}
        </div>
      </div>

      <div style={{ padding: "10px 12px 4px" }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: "#ccc", lineHeight: 1.3, marginBottom: 2 }}>
          {card.title?.slice(0, 72)}{(card.title?.length || 0) > 72 ? "…" : ""}
        </p>
        <p style={{ fontSize: 10, color: "#444", marginBottom: 10, fontFamily: "'Geist Mono', monospace" }}>
          {card.uploader}
        </p>
      </div>

      <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        <p style={{ fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3, fontFamily: "'Geist Mono', monospace" }}>
          Select format
        </p>
        {card.formats?.slice(0, 5).map(fmt => (
          <button key={fmt.format_id} onClick={() => onDownload(messageId, fmt)}
            disabled={!!card.downloading}
            style={{
              background: "#111", border: "1px solid #1a1a1a", borderRadius: 6,
              padding: "6px 10px", display: "flex", alignItems: "center",
              justifyContent: "space-between", cursor: card.downloading ? "default" : "pointer",
              transition: "border-color 0.1s",
              opacity: card.downloading && card.downloading !== fmt.format_id ? 0.3 : 1,
            }}
            onMouseEnter={e => { if (!card.downloading) e.currentTarget.style.borderColor = "#2a2a2a"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1a1a1a"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {fmt.height === 0 ? <Music size={10} color="#444" /> : <Video size={10} color="#444" />}
              <span style={{ fontSize: 11, color: "#888", fontFamily: "'Geist Mono', monospace" }}>{fmt.label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#333", fontFamily: "'Geist Mono', monospace" }}>{formatSize(fmt.filesize)}</span>
              {card.downloading === fmt.format_id
                ? <Loader2 size={10} color="#666" style={{ animation: "spin 1s linear infinite" }} />
                : <Download size={10} color="#333" />
              }
            </div>
          </button>
        ))}
      </div>

      <div style={{
        borderTop: "1px solid #141414", padding: "8px 12px", marginTop: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <a href={card.url} target="_blank" rel="noreferrer"
          style={{ fontSize: 10, color: "#333", display: "flex", alignItems: "center", gap: 4, textDecoration: "none", fontFamily: "'Geist Mono', monospace" }}
          onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = "#666"}
          onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = "#333"}
        >
          <ExternalLink size={9} /> OPEN ORIGINAL
        </a>
        <button onClick={() => onDelete(messageId)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#222", display: "flex", alignItems: "center", gap: 4, fontFamily: "'Geist Mono', monospace" }}
          onMouseEnter={e => e.currentTarget.style.color = "#666"}
          onMouseLeave={e => e.currentTarget.style.color = "#222"}
        >
          <Trash2 size={9} /> REMOVE
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Orrin() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>("");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [fileContexts, setFileContexts] = useState<FileCtx[]>([]);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({ used: 0, total: STORAGE_TOTAL, percent: 0 });
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showCompressPrompt, setShowCompressPrompt] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"chats" | "memory">("chats");
  const [fetchingVideo, setFetchingVideo] = useState(false);
  const [globalMemory, setGlobalMemory] = useState("");
  const [memoryEdited, setMemoryEdited] = useState("");
  const [memorySaved, setMemorySaved] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamingIdRef = useRef<string | null>(null);

  const activeChat = chats.find(c => c.id === activeChatId) || null;
  const messages = activeChat?.messages || [];

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = loadChats();
    if (saved.length === 0) {
      const first = createNewChat();
      setChats([first]);
      setActiveChatId(first.id);
      saveChats([first]);
    } else {
      setChats(saved);
      setActiveChatId(saved[0].id);
    }
    const mem = loadGlobalMemory();
    setGlobalMemory(mem);
    setMemoryEdited(mem);
    setStorageInfo(getStorageInfo());
  }, []);

  useEffect(() => {
    if (chats.length > 0) {
      saveChats(chats);
      const info = getStorageInfo();
      setStorageInfo(info);
      if (info.percent >= 75) setShowCompressPrompt(true);
    }
  }, [chats]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [input]);

  // ── Chat Management ────────────────────────────────────────────────────────
  const updateChat = useCallback((id: string, updater: (c: Chat) => Chat) => {
    setChats(prev => prev.map(c => c.id === id ? updater(c) : c));
  }, []);

  const newChat = () => {
    const chat = createNewChat();
    setChats(prev => [chat, ...prev]);
    setActiveChatId(chat.id);
    setInput("");
    setFileContexts([]);
    setImageBase64(null);
    setImagePreviewUrl(null);
  };

  const deleteChat = (id: string) => {
    setChats(prev => {
      const next = prev.filter(c => c.id !== id);
      if (id === activeChatId) {
        if (next.length === 0) {
          const fresh = createNewChat();
          setActiveChatId(fresh.id);
          return [fresh];
        }
        setActiveChatId(next[0].id);
      }
      return next;
    });
  };

  const toggleMemory = (id: string) => {
    updateChat(id, c => ({ ...c, memory: !c.memory }));
  };

  const updateChatTitle = (id: string, msg: string) => {
    const title = msg.slice(0, 36) + (msg.length > 36 ? "…" : "");
    updateChat(id, c => c.title === "New chat" ? { ...c, title } : c);
  };

  // ── Memory Management ──────────────────────────────────────────────────────
  const saveMemory = () => {
    saveGlobalMemory(memoryEdited);
    setGlobalMemory(memoryEdited);
    setMemorySaved(true);
    setTimeout(() => setMemorySaved(false), 2000);
  };

  // ── File Handling ──────────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileContexts.find(f => f.name === file.name)) return;
    try {
      let content = "";
      if (file.type === "application/pdf") {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const c = await page.getTextContent();
          content += c.items.map((s: any) => s.str).join(" ") + "\n";
        }
        content = content.slice(0, 8000);
      } else if (file.name.endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        content = result.value.slice(0, 8000);
      } else if (file.type === "text/plain") {
        content = (await file.text()).slice(0, 8000);
      } else {
        alert("Supported: PDF, DOCX, TXT");
        return;
      }
      setFileContexts(prev => [...prev, { name: file.name, content }]);
    } catch (err) {
      console.error("File read error:", err);
      alert("Failed to read file.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      setImageBase64(base64);
      setImageMimeType(file.type);
      setImagePreviewUrl(result);
    };
    reader.readAsDataURL(file);
    if (imageRef.current) imageRef.current.value = "";
  };

  // ── URL Summarizer ─────────────────────────────────────────────────────────
  const summarizeUrl = async (url: string, msgId: string) => {
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.summary) {
        updateChat(activeChatId, c => ({
          ...c,
          messages: c.messages.map(m =>
            m.id === msgId ? { ...m, content: m.content + "\n\n" + data.summary } : m
          ),
        }));
      }
    } catch (err) {
      console.error("Summarize error:", err);
    }
  };

  // ── Video Detection & Fetch ────────────────────────────────────────────────
  const fetchVideoCard = async (url: string, msgId: string) => {
    setFetchingVideo(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(`${HF_API}/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const card: VideoCard = {
        url, title: data.title, thumbnail: data.thumbnail,
        duration: data.duration, uploader: data.uploader,
        platform: data.platform, formats: data.formats,
        downloading: null, downloaded: false,
      };

      updateChat(activeChatId, c => ({
        ...c,
        messages: c.messages.map(m => m.id === msgId ? { ...m, videoCard: card } : m),
      }));
    } catch (err: any) {
      console.error("Video fetch error:", err);
    }
    setFetchingVideo(false);
  };

  // ── Video Download ─────────────────────────────────────────────────────────
  const handleVideoDownload = async (messageId: string, format: VideoFormat) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.videoCard) return;

    updateChat(activeChatId, c => ({
      ...c,
      messages: c.messages.map(m =>
        m.id === messageId ? { ...m, videoCard: { ...m.videoCard!, downloading: format.format_id } } : m
      ),
    }));

    try {
      const formatId = format.type === "video_only" && format.bestAudioFormatId
        ? `${format.format_id}+${format.bestAudioFormatId}` : format.format_id;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const res = await fetch(`${HF_API}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: msg.videoCard.url, format_id: formatId,
          ext: format.ext, title: msg.videoCard.title,
          merge: format.type === "video_only",
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${msg.videoCard.title.replace(/[^a-zA-Z0-9\s_-]/g, "").trim().slice(0, 60)}.${format.ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);

      updateChat(activeChatId, c => ({
        ...c,
        messages: c.messages.map(m =>
          m.id === messageId ? { ...m, videoCard: { ...m.videoCard!, downloading: null, downloaded: true } } : m
        ),
      }));
    } catch {
      updateChat(activeChatId, c => ({
        ...c,
        messages: c.messages.map(m =>
          m.id === messageId ? { ...m, videoCard: { ...m.videoCard!, downloading: null } } : m
        ),
      }));
      alert("Download failed.");
    }
  };

  const deleteVideoCard = (messageId: string) => {
    updateChat(activeChatId, c => ({
      ...c,
      messages: c.messages.map(m => m.id === messageId ? { ...m, videoCard: undefined } : m),
    }));
  };

  // ── Compress ───────────────────────────────────────────────────────────────
  const handleCompress = async () => {
    if (!activeChat) return;
    setCompressing(true);
    setShowCompressPrompt(false);
    const history = messages.map(m => `${m.role}: ${m.content}`).join("\n");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `Summarize this conversation concisely, keeping all key facts:\n\n${history}` }],
        }),
      });
      const summary = await res.text();
      const summaryMsg: Message = {
        id: genId(), role: "assistant",
        content: `📦 **Conversation compressed**\n\n${summary}`,
        timestamp: Date.now(),
      };
      updateChat(activeChatId, c => ({ ...c, messages: [summaryMsg] }));
      setStorageInfo(getStorageInfo());
    } catch { alert("Compression failed."); }
    setCompressing(false);
  };

  // ── Send Message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !activeChatId) return;

    const isVideoUrl = VIDEO_REGEX.test(text);
    const isUrl = !isVideoUrl && URL_REGEX.test(text);
    const combinedFileContext = fileContexts.length > 0
      ? fileContexts.map(f => `--- FILE: ${f.name} ---\n${f.content}`).join("\n\n") : null;

    const userMsg: Message = {
      id: genId(), role: "user", content: text, timestamp: Date.now(),
      imagePreview: imagePreviewUrl || undefined,
    };
    const assistantId = genId();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", timestamp: Date.now() };

    updateChatTitle(activeChatId, text);
    updateChat(activeChatId, c => ({ ...c, messages: [...c.messages, userMsg, assistantMsg] }));
    setInput("");
    const currentImageBase64 = imageBase64;
    const currentImageMimeType = imageMimeType;
    setImageBase64(null);
    setImageMimeType(null);
    setImagePreviewUrl(null);
    setStreaming(true);
    streamingIdRef.current = assistantId;

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
    const currentMemory = activeChat?.memory ? loadGlobalMemory() : "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          fileContext: combinedFileContext,
          globalMemory: currentMemory,
          imageBase64: currentImageBase64,
          imageMimeType: currentImageMimeType,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Bad response");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let factsBuffer = "";
      let inFacts = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // Parse facts metadata out of stream
        if (chunk.includes("__FACTS__")) {
          const parts = chunk.split("__FACTS__");
          for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 1) {
              // This is facts JSON
              try {
                const facts = JSON.parse(parts[i]);
                if (facts.length > 0 && activeChat?.memory) {
                  appendFacts(facts);
                  const newMem = loadGlobalMemory();
                  setGlobalMemory(newMem);
                  setMemoryEdited(newMem);
                }
              } catch {}
            } else {
              full += parts[i];
            }
          }
        } else {
          full += chunk;
        }

        const id = streamingIdRef.current;
        // updateChat is sufficient to update the streaming message content
        updateChat(activeChatId, c => ({
          ...c,
          messages: c.messages.map(m => m.id === id ? { ...m, content: full } : m),
        }));
      }

      // After response — handle URL summarization or video card
      if (isVideoUrl) {
        await fetchVideoCard(text, assistantId);
      } else if (isUrl) {
        await summarizeUrl(text, assistantId);
      }

    } catch {
      const id = streamingIdRef.current;
      updateChat(activeChatId, c => ({
        ...c,
        messages: c.messages.map(m =>
          m.id === id ? { ...m, content: "Something went wrong. Please try again." } : m
        ),
      }));
    }

    setStreaming(false);
    streamingIdRef.current = null;
  }, [input, messages, streaming, activeChatId, fileContexts, imageBase64, imageMimeType, activeChat]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleScroll = () => {
    if (!chatRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 200);
  };

  const storageColor = storageInfo.percent > 75 ? "#ef4444" : storageInfo.percent > 50 ? "#f59e0b" : "#333";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: "100vh", display: "flex", background: "#080808", overflow: "hidden", fontFamily: "'Geist', sans-serif" }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blink { 0%,80%,100% { opacity: 0.15; } 40% { opacity: 1; } }
        .msg { animation: fadeUp 0.18s ease; }
        .dot span { display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: #444; margin: 0 2px; animation: blink 1.2s infinite; }
        .dot span:nth-child(2) { animation-delay: 0.2s; }
        .dot span:nth-child(3) { animation-delay: 0.4s; }
        .sidebar-item:hover { background: #111 !important; }
        pre { background: #0d0d0d; border: 1px solid #1a1a1a; border-radius: 6px; padding: 12px; overflow-x: auto; margin: 8px 0; }
        code { font-family: 'Geist Mono', monospace; font-size: 12px; color: #aaa; }
        strong { color: #e8e8e8; }
        h1,h2,h3 { color: #e8e8e8; margin: 8px 0 4px; font-weight: 600; }
        a { color: #666; text-decoration: underline; }
        li { margin: 3px 0; line-height: 1.6; }
        .memory-textarea { resize: none; width: 100%; background: #0d0d0d; border: 1px solid #1a1a1a; border-radius: 6px; color: #888; font-size: 11px; font-family: 'Geist Mono', monospace; padding: 10px; outline: none; line-height: 1.7; }
        .memory-textarea:focus { border-color: #2a2a2a; }
      `}</style>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div style={{
          width: 230, flexShrink: 0,
          background: "#0a0a0a", borderRight: "1px solid #111",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Sidebar header */}
          <div style={{ padding: "14px 12px 10px", borderBottom: "1px solid #111" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: "#e8e8e8", fontFamily: "'Geist Mono', monospace" }}>ORRIN</span>
              <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#2a2a2a", display: "flex" }}
                onMouseEnter={e => e.currentTarget.style.color = "#666"}
                onMouseLeave={e => e.currentTarget.style.color = "#2a2a2a"}
              >
                <X size={12} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
              {(["chats", "memory"] as const).map(tab => (
                <button key={tab} onClick={() => setSidebarTab(tab)} style={{
                  flex: 1, background: sidebarTab === tab ? "#141414" : "transparent",
                  border: `1px solid ${sidebarTab === tab ? "#1e1e1e" : "transparent"}`,
                  borderRadius: 5, padding: "5px 0",
                  color: sidebarTab === tab ? "#888" : "#333",
                  fontSize: 10, cursor: "pointer",
                  fontFamily: "'Geist Mono', monospace", letterSpacing: "0.06em",
                  transition: "all 0.1s",
                }}>
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>

            {sidebarTab === "chats" && (
              <button onClick={newChat} style={{
                width: "100%", background: "#0f0f0f", border: "1px solid #1a1a1a",
                borderRadius: 6, padding: "7px 10px", color: "#555", fontSize: 11,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                fontFamily: "'Geist', sans-serif", transition: "all 0.1s",
              }}
                onMouseEnter={e => { e.currentTarget.style.color = "#999"; e.currentTarget.style.borderColor = "#222"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "#555"; e.currentTarget.style.borderColor = "#1a1a1a"; }}
              >
                <Plus size={11} /> New chat
              </button>
            )}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {sidebarTab === "chats" ? (
              chats.map(chat => (
                <div key={chat.id} className="sidebar-item"
                  onClick={() => setActiveChatId(chat.id)}
                  style={{
                    borderRadius: 6, padding: "7px 9px", marginBottom: 2,
                    cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: 6, transition: "background 0.1s",
                    background: chat.id === activeChatId ? "#111" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <MessageSquare size={10} color="#2a2a2a" style={{ flexShrink: 0 }} />
                    <span style={{
                      fontSize: 11, color: chat.id === activeChatId ? "#aaa" : "#444",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {chat.title}
                    </span>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteChat(chat.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#1e1e1e", flexShrink: 0, display: "flex" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#555"}
                    onMouseLeave={e => e.currentTarget.style.color = "#1e1e1e"}
                  >
                    <Trash2 size={9} />
                  </button>
                </div>
              ))
            ) : (
              <div style={{ padding: "4px 4px" }}>
                <p style={{ fontSize: 9, color: "#2a2a2a", fontFamily: "'Geist Mono', monospace", letterSpacing: "0.08em", marginBottom: 8 }}>
                  WHAT ORRIN REMEMBERS ABOUT YOU
                </p>
                <textarea
                  className="memory-textarea"
                  value={memoryEdited}
                  onChange={e => setMemoryEdited(e.target.value)}
                  placeholder={"No memories yet.\nOrrin will learn about you as you chat."}
                  rows={12}
                />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button onClick={saveMemory} style={{
                    flex: 1, background: "#111", border: "1px solid #1e1e1e",
                    borderRadius: 5, padding: "6px 0",
                    color: memorySaved ? "#666" : "#444",
                    fontSize: 10, cursor: "pointer",
                    fontFamily: "'Geist Mono', monospace",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    transition: "all 0.1s",
                  }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "#2a2a2a"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "#1e1e1e"}
                  >
                    <Save size={9} /> {memorySaved ? "SAVED" : "SAVE"}
                  </button>
                  <button onClick={() => { setMemoryEdited(""); saveGlobalMemory(""); setGlobalMemory(""); }} style={{
                    background: "transparent", border: "1px solid #111",
                    borderRadius: 5, padding: "6px 10px",
                    color: "#2a2a2a", fontSize: 10, cursor: "pointer",
                    fontFamily: "'Geist Mono', monospace", transition: "all 0.1s",
                  }}
                    onMouseEnter={e => e.currentTarget.style.color = "#555"}
                    onMouseLeave={e => e.currentTarget.style.color = "#2a2a2a"}
                  >
                    CLEAR
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Storage */}
          <div style={{ padding: "10px 12px 12px", borderTop: "1px solid #0f0f0f" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: "#2a2a2a", fontFamily: "'Geist Mono', monospace" }}>STORAGE</span>
              <span style={{ fontSize: 9, color: "#2a2a2a", fontFamily: "'Geist Mono', monospace" }}>
                {formatBytes(storageInfo.used)}/{formatBytes(storageInfo.total)}
              </span>
            </div>
            <div style={{ height: 2, background: "#0f0f0f", borderRadius: 1, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(storageInfo.percent, 100)}%`, height: "100%", background: storageColor, borderRadius: 1, transition: "width 0.3s" }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{
          flexShrink: 0, padding: "11px 20px",
          borderBottom: "1px solid #0f0f0f",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#080808",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#2a2a2a", display: "flex" }}
                onMouseEnter={e => e.currentTarget.style.color = "#666"}
                onMouseLeave={e => e.currentTarget.style.color = "#2a2a2a"}
              >
                <ChevronRight size={14} />
              </button>
            )}
            <span style={{ fontSize: 11, fontWeight: 600, color: "#333", fontFamily: "'Geist Mono', monospace", letterSpacing: "0.1em" }}>
              {activeChat?.title || "ORRIN"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {activeChat && (
              <button onClick={() => toggleMemory(activeChatId)} title={activeChat.memory ? "Memory on" : "Memory off"} style={{
                background: "none", border: "1px solid #111", borderRadius: 5,
                padding: "4px 8px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
                color: activeChat.memory ? "#555" : "#2a2a2a",
                fontSize: 10, transition: "all 0.1s",
                fontFamily: "'Geist Mono', monospace",
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#1e1e1e"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#111"}
              >
                {activeChat.memory ? <Brain size={10} /> : <Brain size={10} />}
                {activeChat.memory ? "MEM ON" : "MEM OFF"}
              </button>
            )}

            <a href="/downloader" style={{
              background: "none", border: "1px solid #111", borderRadius: 5,
              padding: "4px 8px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5,
              color: "#2a2a2a", fontSize: 10, textDecoration: "none",
              fontFamily: "'Geist Mono', monospace", transition: "all 0.1s",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#666"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "#1e1e1e"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#2a2a2a"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "#111"; }}
            >
              <Download size={10} /> DOWNLOADER
            </a>

            {showCompressPrompt && (
              <button onClick={handleCompress} disabled={compressing} style={{
                background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 5,
                padding: "4px 8px", cursor: "pointer", color: "#555",
                fontSize: 10, fontFamily: "'Geist Mono', monospace",
              }}>
                {compressing ? "COMPRESSING…" : "⚠ COMPRESS"}
              </button>
            )}
          </div>
        </div>

        {/* Chat area */}
        <div ref={chatRef} onScroll={handleScroll} style={{ flex: 1, overflowY: "auto", padding: "20px 0" }}>
          {messages.length === 0 && (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, opacity: 0.2 }}>
              <div style={{ width: 1, height: 32, background: "linear-gradient(to bottom, transparent, #555)" }} />
              <span style={{ fontSize: 10, color: "#666", fontFamily: "'Geist Mono', monospace", letterSpacing: "0.2em" }}>ORRIN READY</span>
              <div style={{ width: 1, height: 32, background: "linear-gradient(to bottom, #555, transparent)" }} />
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className="msg" style={{ maxWidth: 720, width: "100%", margin: "0 auto", padding: "4px 24px" }}>
              <div style={{ display: "flex", gap: 12, flexDirection: msg.role === "user" ? "row-reverse" : "row", alignItems: "flex-start" }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                  background: "#0d0d0d", border: "1px solid #1a1a1a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, fontWeight: 700, color: "#333",
                  fontFamily: "'Geist Mono', monospace", marginTop: 3,
                }}>
                  {msg.role === "user" ? "U" : "AI"}
                </div>
                <div style={{ maxWidth: "calc(100% - 34px)" }}>
                  {/* Image preview */}
                  {msg.imagePreview && (
                    <img src={msg.imagePreview} alt="uploaded"
                      style={{ maxWidth: 220, maxHeight: 160, borderRadius: 6, objectFit: "cover", marginBottom: 6, border: "1px solid #1a1a1a", display: "block" }}
                    />
                  )}
                  <div style={{
                    background: msg.role === "user" ? "#0d0d0d" : "transparent",
                    border: msg.role === "user" ? "1px solid #141414" : "none",
                    borderRadius: 8,
                    padding: msg.role === "user" ? "8px 12px" : "2px 0",
                    fontSize: 13.5, lineHeight: 1.75, color: "#b8b8b8",
                  }}
                    dangerouslySetInnerHTML={{ __html: msg.content ? renderMarkdown(msg.content) : "" }}
                  />
                  {msg.videoCard && (
                    <VideoCardUI card={msg.videoCard} messageId={msg.id} onDownload={handleVideoDownload} onDelete={deleteVideoCard} />
                  )}
                  {fetchingVideo && msg.id === streamingIdRef.current && !msg.videoCard && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, color: "#2a2a2a", fontSize: 10, fontFamily: "'Geist Mono', monospace" }}>
                      <Loader2 size={9} style={{ animation: "spin 1s linear infinite" }} /> FETCHING VIDEO INFO…
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {streaming && messages[messages.length - 1]?.content === "" && (
            <div style={{ maxWidth: 720, width: "100%", margin: "0 auto", padding: "4px 24px" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, background: "#0d0d0d", border: "1px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#333", fontFamily: "'Geist Mono', monospace" }}>AI</div>
                <div style={{ paddingTop: 7 }} className="dot"><span /><span /><span /></div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Scroll button */}
        {showScrollBtn && (
          <button onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })} style={{
            position: "fixed", bottom: 80, right: 18, width: 28, height: 28, borderRadius: "50%",
            background: "#0f0f0f", border: "1px solid #1a1a1a", color: "#444",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ChevronDown size={12} />
          </button>
        )}

        {/* Input */}
        <div style={{ flexShrink: 0, padding: "10px 20px 14px", borderTop: "1px solid #0f0f0f", background: "#080808" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>

            {/* Attachments row */}
            {(fileContexts.length > 0 || imagePreviewUrl) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                {imagePreviewUrl && (
                  <div style={{ position: "relative", display: "inline-flex" }}>
                    <img src={imagePreviewUrl} alt="preview" style={{ height: 44, width: 44, objectFit: "cover", borderRadius: 5, border: "1px solid #1a1a1a" }} />
                    <button onClick={() => { setImageBase64(null); setImageMimeType(null); setImagePreviewUrl(null); }}
                      style={{ position: "absolute", top: -4, right: -4, background: "#1a1a1a", border: "none", borderRadius: "50%", width: 14, height: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
                      <X size={8} />
                    </button>
                  </div>
                )}
                {fileContexts.map(f => (
                  <div key={f.name} style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    background: "#0d0d0d", border: "1px solid #141414",
                    borderRadius: 5, padding: "3px 8px",
                    fontSize: 10, color: "#333", fontFamily: "'Geist Mono', monospace",
                  }}>
                    <Paperclip size={8} />{f.name}
                    <button onClick={() => setFileContexts(prev => prev.filter(x => x.name !== f.name))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#2a2a2a", display: "flex" }}>
                      <X size={8} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{
              display: "flex", alignItems: "flex-end", gap: 7,
              background: "#0b0b0b", border: "1px solid #141414",
              borderRadius: 10, padding: "8px 10px",
            }}>
              {/* File attach */}
              <button onClick={() => fileRef.current?.click()}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#222", display: "flex", padding: 3, flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = "#555"}
                onMouseLeave={e => e.currentTarget.style.color = "#222"}
                title="Attach file"
              >
                <Paperclip size={14} />
              </button>

              {/* Image attach */}
              <button onClick={() => imageRef.current?.click()}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#222", display: "flex", padding: 3, flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = "#555"}
                onMouseLeave={e => e.currentTarget.style.color = "#222"}
                title="Attach image"
              >
                <ImageIcon size={14} />
              </button>

              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" style={{ display: "none" }} onChange={handleFile} />
              <input ref={imageRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImage} />

              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Orrin anything… paste a URL to summarize · drop a video link to download"
                rows={1}
                style={{
                  flex: 1, background: "none", border: "none", outline: "none",
                  color: "#b8b8b8", fontSize: 13, fontFamily: "'Geist', sans-serif",
                  resize: "none", lineHeight: 1.6, maxHeight: 140, overflowY: "auto",
                }}
              />

              <button onClick={sendMessage} disabled={!input.trim() || streaming} style={{
                background: input.trim() && !streaming ? "#111" : "transparent",
                border: `1px solid ${input.trim() && !streaming ? "#1e1e1e" : "#0f0f0f"}`,
                borderRadius: 6, width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: input.trim() && !streaming ? "pointer" : "default",
                flexShrink: 0, transition: "all 0.1s",
              }}
                onMouseEnter={e => { if (input.trim() && !streaming) e.currentTarget.style.borderColor = "#2a2a2a"; }}
                onMouseLeave={e => { if (input.trim() && !streaming) e.currentTarget.style.borderColor = "#1e1e1e"; }}
              >
                <Send size={12} color={input.trim() && !streaming ? "#777" : "#222"} />
              </button>
            </div>

            <p style={{ fontSize: 9, color: "#161616", textAlign: "center", marginTop: 6, fontFamily: "'Geist Mono', monospace", letterSpacing: "0.06em" }}>
              ENTER TO SEND · SHIFT+ENTER NEW LINE · PASTE URL TO SUMMARIZE · VIDEO LINKS AUTO-DETECTED
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}