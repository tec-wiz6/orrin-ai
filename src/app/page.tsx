"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Paperclip, X, Plus, MessageSquare, Trash2,
  ChevronDown, Download, Brain, Video, Music, Loader2,
  ExternalLink, Image as ImageIcon, Save, Bell,
  Clock, Menu,
} from "lucide-react";
import {
  loadReminders, addReminder, markFired, deleteReminder,
  clearFiredReminders, parseReminderTime, type Reminder
} from "@/lib/reminders";

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

// ── Memory ────────────────────────────────────────────────────────────────────
function loadGlobalMemory(): string {
  try { return localStorage.getItem(GLOBAL_MEMORY_KEY) || ""; } catch { return ""; }
}
function saveGlobalMemory(text: string) {
  try { localStorage.setItem(GLOBAL_MEMORY_KEY, text); } catch {}
}
function appendFacts(facts: string[]) {
  if (!facts.length) return;
  const existing = loadGlobalMemory();
  const existingLines = existing.split("\n").filter(Boolean);
  const newFacts = facts.filter(f => !existingLines.some(e => e.toLowerCase().includes(f.toLowerCase().slice(0, 20))));
  if (!newFacts.length) return;
  saveGlobalMemory([...existingLines, ...newFacts].join("\n"));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function genId() { return Math.random().toString(36).slice(2, 10); }
function formatBytes(b: number) {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / (1024 * 1024)).toFixed(2)}MB`;
}
function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}
function formatSize(bytes: number | null) {
  if (!bytes || bytes === 0) return "~";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
function getStorageInfo(): StorageInfo {
  let used = 0;
  for (const key in localStorage) {
    if (Object.prototype.hasOwnProperty.call(localStorage, key))
      used += (localStorage[key].length + key.length) * 2;
  }
  return { used, total: STORAGE_TOTAL, percent: (used / STORAGE_TOTAL) * 100 };
}
function loadChats(): Chat[] {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveChats(chats: Chat[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)); } catch {}
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
  return { id: genId(), title: "New chat", messages: [], memory: true, createdAt: Date.now() };
}

// ── Video Card ────────────────────────────────────────────────────────────────
function VideoCardUI({ card, messageId, onDownload, onDelete }: {
  card: VideoCard; messageId: string;
  onDownload: (mid: string, fmt: VideoFormat) => void;
  onDelete: (mid: string) => void;
}) {
  return (
    <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 10, overflow: "hidden", maxWidth: 400, marginTop: 10 }}>
      <div style={{ position: "relative", aspectRatio: "16/9", background: "#111" }}>
        {card.thumbnail && (
          <img
            src={card.thumbnail}
            alt={card.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }}
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        {card.duration > 0 && (
          <div style={{
            position: "absolute", bottom: 8, right: 8,
            background: "rgba(0,0,0,0.85)", borderRadius: 4,
            padding: "2px 6px", fontSize: 11, color: "#888",
            fontFamily: "'Geist Mono', monospace"
          }}>
            {formatDuration(card.duration)}
          </div>
        )}
        <div style={{
          position: "absolute", top: 8, left: 8,
          background: "rgba(0,0,0,0.75)", borderRadius: 4,
          padding: "2px 7px", fontSize: 10, color: "#555",
          fontFamily: "'Geist Mono', monospace"
        }}>
          {card.platform?.toUpperCase()}
        </div>
      </div>
      <div style={{ padding: "10px 12px 4px" }}>
        <p style={{
          fontSize: 12, fontWeight: 500, color: "#ccc", lineHeight: 1.3,
          marginBottom: 2
        }}>
          {card.title?.slice(0, 72)}{(card.title?.length || 0) > 72 ? "…" : ""}
        </p>
        <p style={{
          fontSize: 10, color: "#444", marginBottom: 10,
          fontFamily: "'Geist Mono', monospace"
        }}>
          {card.uploader}
        </p>
      </div>
      <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        <p style={{
          fontSize: 9, color: "#333", textTransform: "uppercase",
          letterSpacing: "0.08em", marginBottom: 3,
          fontFamily: "'Geist Mono', monospace"
        }}>
          Select format
        </p>
        {card.formats?.slice(0, 5).map(fmt => (
          <button
            key={fmt.format_id}
            onClick={() => onDownload(messageId, fmt)}
            disabled={!!card.downloading}
            style={{
              background: "#111", border: "1px solid #1a1a1a",
              borderRadius: 6, padding: "7px 10px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              cursor: card.downloading ? "default" : "pointer",
              opacity: card.downloading && card.downloading !== fmt.format_id ? 0.3 : 1
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {fmt.height === 0 ? <Music size={10} color="#444" /> : <Video size={10} color="#444" />}
              <span style={{ fontSize: 11, color: "#888", fontFamily: "'Geist Mono', monospace" }}>
                {fmt.label}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#333", fontFamily: "'Geist Mono', monospace" }}>
                {formatSize(fmt.filesize)}
              </span>
              {card.downloading === fmt.format_id
                ? <Loader2 size={10} color="#666" style={{ animation: "spin 1s linear infinite" }} />
                : <Download size={10} color="#333" />}
            </div>
          </button>
        ))}
      </div>
      <div style={{
        borderTop: "1px solid #141414", padding: "8px 12px", marginTop: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <a
          href={card.url}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 10, color: "#333", display: "flex",
            alignItems: "center", gap: 4, textDecoration: "none",
            fontFamily: "'Geist Mono', monospace"
          }}
        >
          <ExternalLink size={9} /> OPEN
        </a>
        <button
          onClick={() => onDelete(messageId)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 10, color: "#222", display: "flex",
            alignItems: "center", gap: 4, fontFamily: "'Geist Mono', monospace"
          }}
        >
          <Trash2 size={9} /> REMOVE
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Orrin() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState("");
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"chats" | "memory" | "reminders">("chats");
  const [fetchingVideo, setFetchingVideo] = useState(false);
  const [globalMemory, setGlobalMemory] = useState("");
  const [memoryEdited, setMemoryEdited] = useState("");
  const [memorySaved, setMemorySaved] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>("default");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isMobile, setIsMobile] = useState(false);

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
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);

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
    setReminders(loadReminders());

    if ("Notification" in window) setNotifPermission(Notification.permission);

    // Service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "GET_REMINDERS") {
          navigator.serviceWorker.controller?.postMessage({
            type: "REMINDERS_DATA",
            reminders: loadReminders(),
          });
        }
        if (event.data?.type === "MARK_FIRED") {
          markFired(event.data.reminderId);
          const updated = loadReminders();
          setReminders(updated);
          // Update cache so SW sees latest reminders
          if ("caches" in window) {
            caches.open("orrin-reminders").then(cache => {
              cache.put("reminders", new Response(JSON.stringify(updated)));
            });
          }
        }
      });
    }

    // Initial sync of reminders to Cache API for SW access
    if ("caches" in window) {
      caches.open("orrin-reminders").then(cache => {
        const allReminders = loadReminders();
        cache.put("reminders", new Response(JSON.stringify(allReminders)));
      });
    }

    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  // Keep Cache API in sync whenever reminders change
  useEffect(() => {
    if ("caches" in window) {
      caches.open("orrin-reminders").then(cache => {
        cache.put("reminders", new Response(JSON.stringify(reminders)));
      });
    }
  }, [reminders]);

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
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
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
    if (isMobile) setSidebarOpen(false);
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

  // ── Memory ─────────────────────────────────────────────────────────────────
  const saveMemory = () => {
    saveGlobalMemory(memoryEdited);
    setGlobalMemory(memoryEdited);
    setMemorySaved(true);
    setTimeout(() => setMemorySaved(false), 2000);
  };

  // ── Notifications ──────────────────────────────────────────────────────────
  const requestNotifPermission = async () => {
    if ("Notification" in window) {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
    }
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
    } catch { alert("Failed to read file."); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageBase64(result.split(",")[1]);
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
    } catch { }
  };

  // ── Video ──────────────────────────────────────────────────────────────────
  const fetchVideoCard = async (url: string, msgId: string) => {
    setFetchingVideo(true);
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 60000);
      const res = await fetch(`${HF_API}/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      updateChat(activeChatId, c => ({
        ...c,
        messages: c.messages.map(m =>
          m.id === msgId
            ? {
              ...m, videoCard: {
                url,
                title: data.title,
                thumbnail: data.thumbnail,
                duration: data.duration,
                uploader: data.uploader,
                platform: data.platform,
                formats: data.formats,
                downloading: null,
                downloaded: false,
              }
            }
            : m
        ),
      }));
    } catch { }
    setFetchingVideo(false);
  };

  const handleVideoDownload = async (messageId: string, format: VideoFormat) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.videoCard) return;
    updateChat(activeChatId, c => ({
      ...c,
      messages: c.messages.map(m =>
        m.id === messageId
          ? { ...m, videoCard: { ...m.videoCard!, downloading: format.format_id } }
          : m
      ),
    }));
    try {
      const formatId = format.type === "video_only" && format.bestAudioFormatId
        ? `${format.format_id}+${format.bestAudioFormatId}`
        : format.format_id;
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 120000);
      const res = await fetch(`${HF_API}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: msg.videoCard.url,
          format_id: formatId,
          ext: format.ext,
          title: msg.videoCard.title,
          merge: format.type === "video_only",
        }),
        signal: controller.signal,
      });
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
          m.id === messageId
            ? { ...m, videoCard: { ...m.videoCard!, downloading: null, downloaded: true } }
            : m
        ),
      }));
    } catch {
      updateChat(activeChatId, c => ({
        ...c,
        messages: c.messages.map(m =>
          m.id === messageId
            ? { ...m, videoCard: { ...m.videoCard!, downloading: null } }
            : m
        ),
      }));
    }
  };

  const deleteVideoCard = (messageId: string) => {
    updateChat(activeChatId, c => ({
      ...c,
      messages: c.messages.map(m =>
        m.id === messageId ? { ...m, videoCard: undefined } : m
      ),
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
          messages: [{ role: "user", content: `Summarize this conversation concisely:\n\n${history}` }],
        }),
      });
      const summary = await res.text();
      updateChat(activeChatId, c => ({
        ...c,
        messages: [{
          id: genId(),
          role: "assistant",
          content: `📦 **Compressed**\n\n${summary}`,
          timestamp: Date.now(),
        }],
      }));
      setStorageInfo(getStorageInfo());
    } catch { alert("Compression failed."); }
    setCompressing(false);
  };

  // ── Send ───────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !activeChatId) return;

    const isVideoUrl = VIDEO_REGEX.test(text);
    const isUrl = !isVideoUrl && URL_REGEX.test(text);
    const combinedFileContext = fileContexts.length > 0
      ? fileContexts.map(f => `--- FILE: ${f.name} ---\n${f.content}`).join("\n\n")
      : null;

    const userMsg: Message = {
      id: genId(),
      role: "user",
      content: text,
      timestamp: Date.now(),
      imagePreview: imagePreviewUrl || undefined,
    };
    const assistantId = genId();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    updateChatTitle(activeChatId, text);
    updateChat(activeChatId, c => ({
      ...c,
      messages: [...c.messages, userMsg, assistantMsg],
    }));
    setInput("");
    const curImageBase64 = imageBase64;
    const curImageMimeType = imageMimeType;
    setImageBase64(null);
    setImageMimeType(null);
    setImagePreviewUrl(null);
    setStreaming(true);
    streamingIdRef.current = assistantId;

    const history = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));
    const currentMemory = activeChat?.memory ? loadGlobalMemory() : "";

    try {
      const clientNow = Date.now();

const res = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: history,
    fileContext: combinedFileContext,
    globalMemory: currentMemory,
    imageBase64: curImageBase64,
    imageMimeType: curImageMimeType,
    clientNow, // <-- added
  }),
});

      if (!res.ok || !res.body) throw new Error("Bad response");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        let chunk = decoder.decode(value, { stream: true });

        // Parse facts
        if (chunk.includes("__FACTS__")) {
          const parts = chunk.split("__FACTS__");
          chunk = "";
          for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 1) {
              try {
                const facts = JSON.parse(parts[i]);
                if (facts.length > 0 && activeChat?.memory) {
                  appendFacts(facts);
                  const newMem = loadGlobalMemory();
                  setGlobalMemory(newMem);
                  setMemoryEdited(newMem);
                }
              } catch { }
            } else chunk += parts[i];
          }
        }

        // Parse reminder
        if (chunk.includes("__REMINDER__")) {
          const parts = chunk.split("__REMINDER__");
          chunk = "";
          for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 1) {
              try {
                const reminderData = JSON.parse(parts[i]);
                if (reminderData.isReminder && reminderData.rawTime) {
                  const time = parseReminderTime(reminderData.rawTime);
                  if (time) {
                    const newReminder: Reminder = {
                      id: genId(),
                      text: reminderData.text,
                      time,
                      fired: false,
                      createdAt: Date.now(),
                      rawInput: text,
                    };
                    addReminder(newReminder);
                    setReminders(loadReminders());
                  }
                }
              } catch { }
            } else chunk += parts[i];
          }
        }

        full += chunk;
        const id = streamingIdRef.current;
        updateChat(activeChatId, c => ({
          ...c,
          messages: c.messages.map(m =>
            m.id === id ? { ...m, content: full } : m
          ),
        }));
      }

      if (isVideoUrl) await fetchVideoCard(text, assistantId);
      else if (isUrl) await summarizeUrl(text, assistantId);
    } catch {
      const id = streamingIdRef.current;
      updateChat(activeChatId, c => ({
        ...c,
        messages: c.messages.map(m =>
          m.id === id
            ? { ...m, content: "Something went wrong. Please try again." }
            : m
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

  const pendingReminders = reminders.filter(r => !r.fired);
  const storageColor =
    storageInfo.percent > 75 ? "#ef4444" :
      storageInfo.percent > 50 ? "#f59e0b" : "#333";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "#080808",
        overflow: "hidden",
        fontFamily: "'Geist', sans-serif",
        position: "relative",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { width: 2px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 2px; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blink { 0%,80%,100% { opacity: 0.12; } 40% { opacity: 1; } }
        @keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        .msg { animation: fadeUp 0.18s ease; }
        .dot span { display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: #444; margin: 0 2px; animation: blink 1.2s infinite; }
        .dot span:nth-child(2) { animation-delay: 0.2s; }
        .dot span:nth-child(3) { animation-delay: 0.4s; }
        pre { background: #0d0d0d; border: 1px solid #1a1a1a; border-radius: 6px; padding: 10px 12px; overflow-x: auto; margin: 8px 0; }
        code { font-family: 'Geist Mono', monospace; font-size: 12px; color: #aaa; }
        strong { color: #e8e8e8; }
        h1,h2,h3 { color: #e8e8e8; margin: 8px 0 4px; font-weight: 600; }
        a { color: #555; text-decoration: underline; }
        li { margin: 3px 0; line-height: 1.6; }
        textarea { -webkit-appearance: none; }
        input { -webkit-appearance: none; }
        .memory-ta { resize: none; width: 100%; background: #0d0d0d; border: 1px solid #1a1a1a; border-radius: 6px; color: #777; font-size: 11px; font-family: 'Geist Mono', monospace; padding: 10px; outline: none; line-height: 1.7; }
        .memory-ta:focus { border-color: #2a2a2a; }
        .icon-btn { background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 0.15s; }
        .tab-btn { flex: 1; border: none; border-radius: 5px; padding: 6px 0; font-size: 10px; cursor: pointer; font-family: 'Geist Mono', monospace; letter-spacing: 0.06em; transition: all 0.15s; }
        .chat-item { border-radius: 7px; padding: 8px 10px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 6px; transition: background 0.1s; margin-bottom: 2px; }
        .chat-item:hover { background: #111 !important; }
        .fmt-btn { background: #111; border: 1px solid #1a1a1a; border-radius: 6px; padding: 7px 10px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: border-color 0.1s; width: 100%; }
        .fmt-btn:hover:not(:disabled) { border-color: #2a2a2a; }
      `}</style>

      {/* ── Sidebar Overlay (mobile) ─────────────────────────────────────────── */}
      {sidebarOpen && isMobile && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 40,
            backdropFilter: "blur(4px)",
          }}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: isMobile ? "fixed" : "relative",
          left: 0,
          top: 0,
          bottom: 0,
          width: isMobile ? "80vw" : (sidebarOpen ? 240 : 0),
          maxWidth: isMobile ? 300 : undefined,
          background: "#0a0a0a",
          borderRight: sidebarOpen ? "1px solid #111" : "none",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          zIndex: isMobile ? 50 : 1,
          transform: sidebarOpen ? "translateX(0)" : (isMobile ? "translateX(-100%)" : "translateX(0)"),
          transition: "all 0.25s ease",
          flexShrink: 0,
        }}
      >
        {/* Sidebar header */}
        <div
          style={{
            padding: "14px 12px 10px",
            borderBottom: "1px solid #0f0f0f",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.12em",
                color: "#e8e8e8",
                fontFamily: "'Geist Mono', monospace",
              }}
            >
              ORRIN
            </span>
            <button
              className="icon-btn"
              onClick={() => setSidebarOpen(false)}
              style={{ color: "#333", padding: 4 }}
            >
              <X size={13} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
            {(["chats", "memory", "reminders"] as const).map(tab => (
              <button
                key={tab}
                className="tab-btn"
                onClick={() => setSidebarTab(tab)}
                style={{
                  background: sidebarTab === tab ? "#141414" : "transparent",
                  border: `1px solid ${sidebarTab === tab ? "#1e1e1e" : "transparent"}`,
                  color: sidebarTab === tab ? "#777" : "#2a2a2a",
                }}
              >
                {tab === "reminders" ? "⏰" : tab.toUpperCase().slice(0, 3)}
              </button>
            ))}
          </div>

          {sidebarTab === "chats" && (
            <button
              onClick={newChat}
              style={{
                width: "100%",
                background: "#0f0f0f",
                border: "1px solid #1a1a1a",
                borderRadius: 7,
                padding: "8px 12px",
                color: "#555",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontFamily: "'Geist', sans-serif",
                transition: "all 0.1s",
              }}
            >
              <Plus size={12} /> New chat
            </button>
          )}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {sidebarTab === "chats" &&
            chats.map(chat => (
              <div
                key={chat.id}
                className="chat-item"
                onClick={() => {
                  setActiveChatId(chat.id);
                  if (isMobile) setSidebarOpen(false);
                }}
                style={{
                  background: chat.id === activeChatId ? "#111" : "transparent",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    minWidth: 0,
                  }}
                >
                  <MessageSquare
                    size={10}
                    color="#2a2a2a"
                    style={{ flexShrink: 0 }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      color: chat.id === activeChatId ? "#aaa" : "#444",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {chat.title}
                  </span>
                </div>
                <button
                  className="icon-btn"
                  onClick={e => {
                    e.stopPropagation();
                    deleteChat(chat.id);
                  }}
                  style={{ color: "#1e1e1e", padding: 4, flexShrink: 0 }}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}

          {sidebarTab === "memory" && (
            <div style={{ padding: "4px" }}>
              <p
                style={{
                  fontSize: 9,
                  color: "#2a2a2a",
                  fontFamily: "'Geist Mono', monospace",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                }}
              >
                WHAT ORRIN REMEMBERS ABOUT YOU
              </p>
              <textarea
                className="memory-ta"
                value={memoryEdited}
                onChange={e => setMemoryEdited(e.target.value)}
                placeholder={"No memories yet.\nOrrin learns as you chat."}
                rows={10}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button
                  onClick={saveMemory}
                  style={{
                    flex: 1,
                    background: "#111",
                    border: "1px solid #1e1e1e",
                    borderRadius: 6,
                    padding: "7px 0",
                    color: memorySaved ? "#888" : "#444",
                    fontSize: 10,
                    cursor: "pointer",
                    fontFamily: "'Geist Mono', monospace",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                  }}
                >
                  <Save size={9} /> {memorySaved ? "SAVED ✓" : "SAVE"}
                </button>
                <button
                  onClick={() => {
                    setMemoryEdited("");
                    saveGlobalMemory("");
                    setGlobalMemory("");
                  }}
                  style={{
                    background: "transparent",
                    border: "1px solid #111",
                    borderRadius: 6,
                    padding: "7px 12px",
                    color: "#2a2a2a",
                    fontSize: 10,
                    cursor: "pointer",
                    fontFamily: "'Geist Mono', monospace",
                  }}
                >
                  CLEAR
                </button>
              </div>
            </div>
          )}

          {sidebarTab === "reminders" && (
            <div style={{ padding: "4px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <p
                  style={{
                    fontSize: 9,
                    color: "#2a2a2a",
                    fontFamily: "'Geist Mono', monospace",
                    letterSpacing: "0.08em",
                  }}
                >
                  {pendingReminders.length} PENDING
                </p>
                <button
                  onClick={() => {
                    clearFiredReminders();
                    setReminders(loadReminders());
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 9,
                    color: "#2a2a2a",
                    fontFamily: "'Geist Mono', monospace",
                  }}
                >
                  CLEAR DONE
                </button>
              </div>

              {notifPermission !== "granted" && (
                <button
                  onClick={requestNotifPermission}
                  style={{
                    width: "100%",
                    background: "#0f0f0f",
                    border: "1px solid #1a1a1a",
                    borderRadius: 7,
                    padding: "8px 12px",
                    color: "#666",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    fontFamily: "'Geist', sans-serif",
                    marginBottom: 10,
                  }}
                >
                  <Bell size={11} /> Enable Notifications
                </button>
              )}

              {reminders.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "24px 0",
                    color: "#222",
                    fontSize: 11,
                    fontFamily: "'Geist Mono', monospace",
                  }}
                >
                  NO REMINDERS YET
                  <br />
                  <span
                    style={{
                      fontSize: 9,
                      marginTop: 4,
                      display: "block",
                    }}
                  >
                    Try: "remind me at 3pm to..."
                  </span>
                </div>
              ) : (
                [...reminders]
                  .sort((a, b) => a.time - b.time)
                  .map(r => (
                    <div
                      key={r.id}
                      style={{
                        background: "#0d0d0d",
                        border: "1px solid #141414",
                        borderRadius: 7,
                        padding: "10px 12px",
                        marginBottom: 6,
                        opacity: r.fired ? 0.3 : 1,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p
                            style={{
                              fontSize: 12,
                              color: r.fired ? "#444" : "#aaa",
                              marginBottom: 4,
                              lineHeight: 1.3,
                            }}
                          >
                            {r.text}
                          </p>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Clock size={8} color="#333" />
                            <span
                              style={{
                                fontSize: 9,
                                color: "#333",
                                fontFamily: "'Geist Mono', monospace",
                              }}
                            >
                              {new Date(r.time).toLocaleString("en-GB", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {r.fired && (
                              <span
                                style={{
                                  fontSize: 9,
                                  color: "#2a2a2a",
                                  fontFamily: "'Geist Mono', monospace",
                                }}
                              >
                                · DONE
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          className="icon-btn"
                          onClick={() => {
                            deleteReminder(r.id);
                            setReminders(loadReminders());
                          }}
                          style={{
                            color: "#222",
                            padding: 3,
                            flexShrink: 0,
                          }}
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}
        </div>

        {/* Storage */}
        <div
          style={{
            padding: "10px 12px 14px",
            borderTop: "1px solid #0f0f0f",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 5,
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: "#222",
                fontFamily: "'Geist Mono', monospace",
              }}
            >
              STORAGE
            </span>
            <span
              style={{
                fontSize: 9,
                color: "#222",
                fontFamily: "'Geist Mono', monospace",
              }}
            >
              {formatBytes(storageInfo.used)}/{formatBytes(storageInfo.total)}
            </span>
          </div>
          <div
            style={{
              height: 2,
              background: "#0f0f0f",
              borderRadius: 1,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(storageInfo.percent, 100)}%`,
                height: "100%",
                background: storageColor,
                borderRadius: 1,
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            flexShrink: 0,
            padding: isMobile ? "10px 12px" : "8px 16px",
            borderBottom: "1px solid #0f0f0f",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#080808",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
            }}
          >
            <button
              className="icon-btn"
              onClick={() => setSidebarOpen(p => !p)}
              style={{ color: "#333", padding: 4, flexShrink: 0 }}
            >
              <Menu size={16} />
            </button>
            <span
              style={{
                fontSize: isMobile ? 12 : 11,
                color: "#333",
                fontFamily: "'Geist Mono', monospace",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: isMobile ? 140 : 200,
              }}
            >
              {activeChat?.title || "ORRIN"}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            {/* Memory toggle */}
            {activeChat && (
              <button
                onClick={() => toggleMemory(activeChatId)}
                style={{
                  background: "none",
                  border: "1px solid #111",
                  borderRadius: 5,
                  padding: isMobile ? "5px 8px" : "4px 8px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  color: activeChat.memory ? "#555" : "#2a2a2a",
                  fontSize: 10,
                  fontFamily: "'Geist Mono', monospace",
                }}
              >
                {activeChat.memory ? (
                  <Brain size={10} />
                ) : (
                  <Brain size={10} style={{ opacity: 0.3 }} />
                )}
                {!isMobile && (activeChat.memory ? "MEM" : "OFF")}
              </button>
            )}

            {/* Reminders bell */}
            <button
              onClick={() => {
                setSidebarTab("reminders");
                setSidebarOpen(true);
              }}
              style={{
                background: "none",
                border: "1px solid #111",
                borderRadius: 5,
                padding: isMobile ? "5px 8px" : "4px 8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                color:
                  pendingReminders.length > 0 ? "#666" : "#2a2a2a",
                fontSize: 10,
                fontFamily: "'Geist Mono', monospace",
                position: "relative",
              }}
            >
              <Bell size={10} />
              {pendingReminders.length > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    background: "#333",
                    color: "#888",
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    fontSize: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "'Geist Mono', monospace",
                  }}
                >
                  {pendingReminders.length}
                </span>
              )}
            </button>

            {/* Downloader */}
            <a
              href="/downloader"
              style={{
                background: "none",
                border: "1px solid #111",
                borderRadius: 5,
                padding: isMobile ? "5px 8px" : "4px 8px",
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: "#2a2a2a",
                fontSize: 10,
                textDecoration: "none",
                fontFamily: "'Geist Mono', monospace",
              }}
            >
              <Download size={10} />
              {!isMobile && "DL"}
            </a>

            {showCompressPrompt && (
              <button
                onClick={handleCompress}
                disabled={compressing}
                style={{
                  background: "#0f0f0f",
                  border: "1px solid #1a1a1a",
                  borderRadius: 5,
                  padding: "4px 8px",
                  cursor: "pointer",
                  color: "#555",
                  fontSize: 10,
                  fontFamily: "'Geist Mono', monospace",
                }}
              >
                {compressing ? "…" : "⚠"}
              </button>
            )}
          </div>
        </div>

        {/* Chat area */}
        <div
  ref={chatRef}
  onScroll={handleScroll}
  style={{
    flex: 1,
    overflowY: "auto",
    padding: isMobile ? "12px 0" : "8px 0",
  }}
>
          {messages.length === 0 && (
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                opacity: 0.15,
              }}
            >
              <div
                style={{
                  width: 1,
                  height: 40,
                  background: "linear-gradient(to bottom, transparent, #666)",
                }}
              />
              <span
                style={{
                  fontSize: isMobile ? 11 : 10,
                  color: "#888",
                  fontFamily: "'Geist Mono', monospace",
                  letterSpacing: "0.2em",
                }}
              >
                ORRIN READY
              </span>
              <div
                style={{
                  width: 1,
                  height: 40,
                  background: "linear-gradient(to bottom, #666, transparent)",
                }}
              />
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className="msg"
              style={{
                maxWidth: isMobile ? "100%" : 720,
                width: "100%",
                margin: "0 auto",
                padding: isMobile ? "4px 12px" : "4px 24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: isMobile ? 8 : 12,
                  flexDirection: msg.role === "user" ? "row-reverse" : "row",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    flexShrink: 0,
                    background: "#0d0d0d",
                    border: "1px solid #1a1a1a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    fontWeight: 700,
                    color: "#333",
                    fontFamily: "'Geist Mono', monospace",
                    marginTop: 2,
                  }}
                >
                  {msg.role === "user" ? "U" : "AI"}
                </div>
                <div style={{ maxWidth: `calc(100% - ${isMobile ? 32 : 36}px)` }}>
                  {msg.imagePreview && (
                    <img
                      src={msg.imagePreview}
                      alt="uploaded"
                      style={{
                        maxWidth: 180,
                        maxHeight: 140,
                        borderRadius: 6,
                        objectFit: "cover",
                        marginBottom: 6,
                        border: "1px solid #1a1a1a",
                        display: "block",
                      }}
                    />
                  )}
                  <div
                    style={{
                      background:
                        msg.role === "user" ? "#0d0d0d" : "transparent",
                      border:
                        msg.role === "user"
                          ? "1px solid #141414"
                          : "none",
                      borderRadius: 8,
                      padding:
                        msg.role === "user" ? "8px 12px" : "2px 0",
                      fontSize: isMobile ? 14 : 13.5,
                      lineHeight: 1.75,
                      color: "#b8b8b8",
                    }}
                    dangerouslySetInnerHTML={{
                      __html: msg.content
                        ? renderMarkdown(msg.content)
                        : "",
                    }}
                  />
                  {msg.videoCard && (
                    <VideoCardUI
                      card={msg.videoCard}
                      messageId={msg.id}
                      onDownload={handleVideoDownload}
                      onDelete={deleteVideoCard}
                    />
                  )}
                  {fetchingVideo &&
                    msg.id === streamingIdRef.current &&
                    !msg.videoCard && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          marginTop: 8,
                          color: "#2a2a2a",
                          fontSize: 10,
                          fontFamily: "'Geist Mono', monospace",
                        }}
                      >
                        <Loader2
                          size={9}
                          style={{ animation: "spin 1s linear infinite" }}
                        />{" "}
                        FETCHING VIDEO…
                      </div>
                    )}
                </div>
              </div>
            </div>
          ))}

          {streaming &&
            messages[messages.length - 1]?.content === "" && (
              <div
                style={{
                  maxWidth: isMobile ? "100%" : 720,
                  width: "100%",
                  margin: "0 auto",
                  padding: isMobile ? "4px 12px" : "4px 24px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: isMobile ? 8 : 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      background: "#0d0d0d",
                      border: "1px solid #1a1a1a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 8,
                      color: "#333",
                      fontFamily: "'Geist Mono', monospace",
                    }}
                  >
                    AI
                  </div>
                  <div
                    style={{
                      paddingTop: 7,
                    }}
                    className="dot"
                  >
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            )}

          <div ref={bottomRef} />
        </div>

        {/* Scroll button */}
        {showScrollBtn && (
          <button
            onClick={() =>
              bottomRef.current?.scrollIntoView({ behavior: "smooth" })
            }
            style={{
              position: "fixed",
              bottom: 80,
              right: 16,
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "#111",
              border: "1px solid #1e1e1e",
              color: "#444",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
            }}
          >
            <ChevronDown size={13} />
          </button>
        )}

        {/* Input */}
        <div
          style={{
            flexShrink: 0,
            padding: isMobile ? "10px 12px 16px" : "10px 20px 14px",
            borderTop: "1px solid #0f0f0f",
            background: "#080808",
            paddingBottom: isMobile
              ? "max(16px, env(safe-area-inset-bottom))"
              : "14px",
          }}
        >
          <div
            style={{
              maxWidth: isMobile ? "100%" : 720,
              margin: "0 auto",
            }}
          >
            {/* Attachments */}
            {(fileContexts.length > 0 || imagePreviewUrl) && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 5,
                  marginBottom: 8,
                }}
              >
                {imagePreviewUrl && (
                  <div style={{ position: "relative" }}>
                    <img
                      src={imagePreviewUrl}
                      alt="preview"
                      style={{
                        height: 42,
                        width: 42,
                        objectFit: "cover",
                        borderRadius: 5,
                        border: "1px solid #1a1a1a",
                      }}
                    />
                    <button
                      className="icon-btn"
                      onClick={() => {
                        setImageBase64(null);
                        setImageMimeType(null);
                        setImagePreviewUrl(null);
                      }}
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -4,
                        background: "#1a1a1a",
                        borderRadius: "50%",
                        width: 14,
                        height: 14,
                        color: "#666",
                      }}
                    >
                      <X size={8} />
                    </button>
                  </div>
                )}
                {fileContexts.map(f => (
                  <div
                    key={f.name}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: "#0d0d0d",
                      border: "1px solid #141414",
                      borderRadius: 5,
                      padding: "3px 8px",
                      fontSize: 10,
                      color: "#333",
                      fontFamily: "'Geist Mono', monospace",
                    }}
                  >
                    <Paperclip size={8} />
                    {f.name}
                    <button
                      className="icon-btn"
                      onClick={() =>
                        setFileContexts(prev =>
                          prev.filter(x => x.name !== f.name)
                        )
                      }
                      style={{ color: "#2a2a2a" }}
                    >
                      <X size={8} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 6,
                background: "#0b0b0b",
                border: "1px solid #141414",
                borderRadius: 12,
                padding: "8px 10px",
              }}
            >
              <button
                className="icon-btn"
                onClick={() => fileRef.current?.click()}
                style={{ color: "#222", padding: 4, flexShrink: 0 }}
              >
                <Paperclip size={15} />
              </button>
              <button
                className="icon-btn"
                onClick={() => imageRef.current?.click()}
                style={{ color: "#222", padding: 4, flexShrink: 0 }}
              >
                <ImageIcon size={15} />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt"
                style={{ display: "none" }}
                onChange={handleFile}
              />
              <input
                ref={imageRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleImage}
              />

              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything…"
                rows={1}
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  outline: "none",
                  color: "#b8b8b8",
                  fontSize: isMobile ? 15 : 13.5,
                  fontFamily: "'Geist', sans-serif",
                  resize: "none",
                  lineHeight: 1.5,
                  maxHeight: 120,
                  overflowY: "auto",
                  WebkitUserSelect: "text",
                }}
              />

              <button
                onClick={sendMessage}
                disabled={!input.trim() || streaming}
                style={{
                  background:
                    input.trim() && !streaming ? "#111" : "transparent",
                  border: `1px solid ${
                    input.trim() && !streaming ? "#1e1e1e" : "#0f0f0f"
                  }`,
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor:
                    input.trim() && !streaming ? "pointer" : "default",
                  flexShrink: 0,
                  transition: "all 0.1s",
                }}
              >
                <Send
                  size={13}
                  color={input.trim() && !streaming ? "#777" : "#222"}
                />
              </button>
            </div>

            {!isMobile && (
              <p
                style={{
                  fontSize: 9,
                  color: "#141414",
                  textAlign: "center",
                  marginTop: 6,
                  fontFamily: "'Geist Mono', monospace",
                  letterSpacing: "0.06em",
                }}
              >
                ENTER TO SEND · PASTE URL TO SUMMARIZE · VIDEO LINKS
                AUTO-DETECTED
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
