"use client";

import { useState } from "react";
import { Download, ArrowLeft, Loader2, Music, Video, CheckCircle, ExternalLink } from "lucide-react";
import Link from "next/link";

interface Format {
  format_id: string;
  ext: string;
  height: number;
  fps: number | null;
  filesize: number | null;
  label: string;
  type?: string;
  bestAudioFormatId?: string | null;
}

interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  platform: string;
  formats: Format[];
}

const HF_API = "https://tecwiz-orrin-video-api.hf.space";

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

const ProgressModal = ({ show, percent, status }: { show: boolean; percent: number; status: string }) => {
  if (!show) return null;
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.92)",
      backdropFilter: "blur(12px)",
      zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Geist', sans-serif",
    }}>
      <div style={{
        background: "#0d0d0d",
        border: "1px solid #1e1e1e",
        borderRadius: 14,
        padding: "36px 32px",
        width: "90%", maxWidth: 380,
        boxShadow: "0 40px 80px rgba(0,0,0,0.8)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52,
            background: percent === 100 ? "#1a1a1a" : "#111",
            border: `1px solid ${percent === 100 ? "#2a2a2a" : "#1e1e1e"}`,
            borderRadius: 12,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.3s",
          }}>
            {percent === 100
              ? <CheckCircle size={22} color="#888" />
              : <Download size={22} color="#444" />
            }
          </div>
        </div>

        <p style={{
          fontSize: 14, fontWeight: 600, textAlign: "center",
          color: "#e8e8e8", marginBottom: 6, letterSpacing: "-0.2px",
        }}>
          {percent === 100 ? "Complete" : "Processing"}
        </p>

        <p style={{
          fontSize: 11, color: "#444", textAlign: "center",
          marginBottom: 24, fontFamily: "'Geist Mono', monospace",
          letterSpacing: "0.05em",
        }}>
          {status.toUpperCase()}
        </p>

        <div style={{ background: "#111", borderRadius: 99, height: 2, overflow: "hidden", marginBottom: 10 }}>
          <div style={{
            width: `${percent}%`, height: "100%",
            background: percent === 100 ? "#555" : "#333",
            borderRadius: 99, transition: "width 0.4s ease",
          }} />
        </div>

        <p style={{
          fontSize: 22, fontWeight: 600, textAlign: "center",
          color: percent === 100 ? "#888" : "#444",
          fontFamily: "'Geist Mono', monospace",
          marginBottom: 8,
        }}>
          {Math.round(percent)}%
        </p>

        {percent > 0 && percent < 90 && (
          <p style={{ fontSize: 10, color: "#2a2a2a", textAlign: "center", fontFamily: "'Geist Mono', monospace", letterSpacing: "0.05em" }}>
            LARGE FILES MAY TAKE SEVERAL MINUTES
          </p>
        )}
      </div>
    </div>
  );
};

const AudioMergeModal = ({
  show, onClose, onMerge, formatLabel,
}: {
  show: boolean;
  onClose: () => void;
  onMerge: (merge?: boolean) => void;
  formatLabel: string;
}) => {
  if (!show) return null;
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.92)",
      backdropFilter: "blur(12px)",
      zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Geist', sans-serif",
    }}>
      <div style={{
        background: "#0d0d0d",
        border: "1px solid #1e1e1e",
        borderRadius: 14,
        padding: "36px 32px",
        width: "90%", maxWidth: 400,
        boxShadow: "0 40px 80px rgba(0,0,0,0.8)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{
            width: 52, height: 52, background: "#111",
            border: "1px solid #1e1e1e", borderRadius: 12,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>
            <Music size={20} color="#444" />
          </div>
        </div>

        <p style={{ fontSize: 14, fontWeight: 600, textAlign: "center", color: "#e8e8e8", marginBottom: 8 }}>
          No Audio Track
        </p>
        <p style={{ fontSize: 12, color: "#444", textAlign: "center", marginBottom: 6, lineHeight: 1.5 }}>
          <span style={{ color: "#666" }}>{formatLabel}</span> contains no audio.
        </p>
        <p style={{ fontSize: 11, color: "#333", textAlign: "center", marginBottom: 28, fontFamily: "'Geist Mono', monospace" }}>
          MERGE WITH BEST AVAILABLE AUDIO?
        </p>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => { onClose(); onMerge(true); }}
            style={{
              flex: 1, background: "#111", border: "1px solid #222",
              borderRadius: 8, padding: "10px",
              color: "#e8e8e8", fontSize: 12, fontWeight: 500,
              cursor: "pointer", transition: "all 0.1s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#333"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#222"}
          >
            Merge with audio
          </button>
          <button
            onClick={() => { onClose(); onMerge(false); }}
            style={{
              flex: 1, background: "transparent", border: "1px solid #161616",
              borderRadius: 8, padding: "10px",
              color: "#444", fontSize: 12,
              cursor: "pointer", transition: "all 0.1s",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "#888"}
            onMouseLeave={e => e.currentTarget.style.color = "#444"}
          >
            Without audio
          </button>
        </div>
      </div>
    </div>
  );
};

export default function Downloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<Format | null>(null);

  const fetchInfo = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setInfo(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(`${HF_API}/info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setInfo(data);
    } catch (err: any) {
      setError(err.name === "AbortError" ? "Request timed out. The API may be waking up — try again." : err.message || "Failed to fetch video info.");
    }
    setLoading(false);
  };

  const startDownload = async (format: Format, mergeWithAudio = false) => {
    if (!info) return;
    setShowProgress(true);
    setProgressPercent(0);
    setProgressStatus("Starting download...");
    setDownloading(format.format_id);

    let progressInterval: NodeJS.Timeout | null = null;
    try {
      progressInterval = setInterval(() => {
        setProgressPercent(prev => {
          if (prev < 20) return prev + 2;
          if (prev < 50) return prev + 1;
          if (prev < 75) return prev + 0.5;
          if (prev < 92) return prev + 0.2;
          return prev;
        });
      }, 400);

      setProgressStatus(mergeWithAudio ? "Merging video + audio..." : "Fetching streams...");

      const formatId = mergeWithAudio && format.bestAudioFormatId
        ? `${format.format_id}+${format.bestAudioFormatId}`
        : format.format_id;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const res = await fetch(`${HF_API}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          format_id: formatId,
          ext: format.ext,
          title: info.title,
          merge: mergeWithAudio,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Download failed");
      }

      setProgressStatus("Finalizing...");
      setProgressPercent(95);

      const blob = await res.blob();
      setProgressPercent(100);
      setProgressStatus("Complete!");
      await new Promise(r => setTimeout(r, 600));

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${info.title.replace(/[^a-zA-Z0-9\s_-]/g, "").trim().slice(0, 60)}.${format.ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      setShowProgress(false);

    } catch (err: any) {
      setProgressStatus("Failed");
      setError(err.message || "Download failed.");
      setTimeout(() => setShowProgress(false), 1500);
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      setDownloading(null);
    }
  };

  const handleDownload = (format: Format) => {
    if (!info || downloading) return;
    if (format.type === "video_only" && format.bestAudioFormatId) {
      setPendingFormat(format);
      setShowAudioModal(true);
      return;
    }
    startDownload(format, false);
  };

  return (
    <>
      <div style={{
        minHeight: "100vh", overflowY: "auto",
        background: "#080808", color: "#e8e8e8",
        fontFamily: "'Geist', sans-serif",
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap');
          * { box-sizing: border-box; }
          ::-webkit-scrollbar { width: 3px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 2px; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          .fmt-row:hover { border-color: #2a2a2a !important; background: #111 !important; }
        `}</style>

        {/* Header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 10,
          background: "#080808", borderBottom: "1px solid #111",
          padding: "13px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/" style={{ display: "flex", alignItems: "center", color: "#333", textDecoration: "none" }}
              onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = "#666"}
              onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = "#333"}
            >
              <ArrowLeft size={14} />
            </Link>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.2px" }}>ORRIN</span>
            <span style={{ fontSize: 12, color: "#2a2a2a", fontFamily: "'Geist Mono', monospace" }}>/ DOWNLOADER</span>
          </div>
          <span style={{ fontSize: 10, color: "#222", fontFamily: "'Geist Mono', monospace", letterSpacing: "0.06em" }}>
            YT · TIKTOK · IG · X · FB
          </span>
        </div>

        <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px 60px" }}>

          {/* URL input */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && fetchInfo()}
              placeholder="Paste video URL…"
              style={{
                flex: 1, background: "#0d0d0d",
                border: "1px solid #161616", borderRadius: 8,
                padding: "11px 14px", color: "#c8c8c8",
                fontSize: 13, outline: "none",
                fontFamily: "'Geist', sans-serif",
                transition: "border-color 0.1s",
              }}
              onFocus={e => e.target.style.borderColor = "#2a2a2a"}
              onBlur={e => e.target.style.borderColor = "#161616"}
            />
            <button
              onClick={fetchInfo}
              disabled={loading || !url.trim()}
              style={{
                background: url.trim() && !loading ? "#111" : "transparent",
                border: `1px solid ${url.trim() && !loading ? "#1e1e1e" : "#111"}`,
                borderRadius: 8, padding: "11px 18px",
                color: url.trim() && !loading ? "#888" : "#2a2a2a",
                fontSize: 12, fontWeight: 500,
                cursor: url.trim() && !loading ? "pointer" : "default",
                display: "flex", alignItems: "center", gap: 6,
                whiteSpace: "nowrap", transition: "all 0.1s",
                fontFamily: "'Geist', sans-serif",
              }}
              onMouseEnter={e => { if (url.trim() && !loading) e.currentTarget.style.borderColor = "#2a2a2a"; }}
              onMouseLeave={e => { if (url.trim() && !loading) e.currentTarget.style.borderColor = "#1e1e1e"; }}
            >
              {loading && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
              {loading ? "Fetching…" : "Get Video"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: "#0d0d0d", border: "1px solid #1e1e1e",
              borderRadius: 8, padding: "11px 14px",
              fontSize: 12, color: "#666",
              fontFamily: "'Geist Mono', monospace",
              marginBottom: 20, letterSpacing: "0.02em",
            }}>
              ⚠ {error}
            </div>
          )}

          {/* Video card */}
          {info && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 1,
              background: "#111",
              border: "1px solid #161616",
              borderRadius: 12,
              overflow: "hidden",
            }}>
              {/* Left — thumbnail + meta */}
              <div style={{ background: "#080808" }}>
                <div style={{ position: "relative", aspectRatio: "16/9", background: "#0d0d0d" }}>
                  <img
                    src={info.thumbnail} alt={info.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }}
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  {info.duration > 0 && (
                    <div style={{
                      position: "absolute", bottom: 8, right: 8,
                      background: "rgba(0,0,0,0.85)", borderRadius: 4,
                      padding: "2px 7px", fontSize: 11, color: "#888",
                      fontFamily: "'Geist Mono', monospace",
                    }}>
                      {formatDuration(info.duration)}
                    </div>
                  )}
                  <div style={{
                    position: "absolute", top: 8, left: 8,
                    background: "rgba(0,0,0,0.75)", borderRadius: 4,
                    padding: "2px 7px", fontSize: 10, color: "#555",
                    fontFamily: "'Geist Mono', monospace", letterSpacing: "0.06em",
                  }}>
                    {info.platform.toUpperCase()}
                  </div>
                </div>
                <div style={{ padding: "14px 16px" }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "#d8d8d8", lineHeight: 1.4, marginBottom: 5 }}>
                    {info.title.slice(0, 100)}{info.title.length > 100 ? "…" : ""}
                  </p>
                  <p style={{ fontSize: 11, color: "#333", marginBottom: 10, fontFamily: "'Geist Mono', monospace" }}>
                    {info.uploader}
                  </p>
                  <a href={url} target="_blank" rel="noreferrer" style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 10, color: "#2a2a2a", textDecoration: "none",
                    fontFamily: "'Geist Mono', monospace",
                  }}
                    onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = "#555"}
                    onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = "#2a2a2a"}
                  >
                    <ExternalLink size={9} /> OPEN ORIGINAL
                  </a>
                </div>
              </div>

              {/* Right — formats */}
              <div style={{ background: "#080808", padding: "16px", overflowY: "auto", maxHeight: 420 }}>
                <p style={{
                  fontSize: 10, color: "#2a2a2a",
                  fontFamily: "'Geist Mono', monospace",
                  letterSpacing: "0.08em", marginBottom: 12,
                }}>
                  SELECT FORMAT
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {info.formats.map(fmt => (
                    <button
                      key={fmt.format_id}
                      className="fmt-row"
                      onClick={() => handleDownload(fmt)}
                      disabled={!!downloading}
                      style={{
                        background: "#0d0d0d",
                        border: "1px solid #141414",
                        borderRadius: 7, padding: "9px 11px",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        cursor: downloading ? "default" : "pointer",
                        transition: "all 0.1s",
                        opacity: downloading && downloading !== fmt.format_id ? 0.3 : 1,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {fmt.height === 0
                          ? <Music size={11} color="#333" />
                          : <Video size={11} color="#333" />
                        }
                        <span style={{ fontSize: 12, color: "#888", fontFamily: "'Geist Mono', monospace" }}>
                          {fmt.label}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, color: "#333", fontFamily: "'Geist Mono', monospace" }}>
                          {formatSize(fmt.filesize)}
                        </span>
                        {downloading === fmt.format_id
                          ? <Loader2 size={11} color="#555" style={{ animation: "spin 1s linear infinite" }} />
                          : <Download size={11} color="#2a2a2a" />
                        }
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ProgressModal show={showProgress} percent={progressPercent} status={progressStatus} />
      <AudioMergeModal
        show={showAudioModal}
        onClose={() => setShowAudioModal(false)}
        onMerge={(merge = true) => { if (pendingFormat) startDownload(pendingFormat, merge); }}
        formatLabel={pendingFormat?.label || "This format"}
      />
    </>
  );
}