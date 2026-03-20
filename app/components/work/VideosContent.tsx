"use client";

import { useEffect, useRef, useState } from "react";
import { workModels, subscribePendingTab } from "../../lib/workModels";
import { trackVideoPlay } from "../../lib/analytics";
import { usePortfolioData } from "../../lib/usePortfolioData";
import { type VideoEntry, MON } from "./types";

// ─── Video player tab ───────────────────────────────────────────────────────
export function VideosContent({ visible, isNarrow }: { visible: boolean; isNarrow?: boolean }) {
  const { data: portfolioData } = usePortfolioData();
  const videos = portfolioData.videos as VideoEntry[];
  const [activeId, setActiveId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Set initial active video when data loads
  useEffect(() => {
    if (videos.length > 0 && activeId === null) {
      setActiveId(videos[0].id);
    }
  }, [videos, activeId]);

  // Pause when tab is hidden; don't autoplay on tab switch
  useEffect(() => {
    if (!videoRef.current) return;
    if (!visible) videoRef.current.pause();
  }, [visible]);

  // Consume pendingVideoId from HUD
  useEffect(() => {
    if (!visible) return;
    const check = () => {
      if (workModels.pendingVideoId && videos.length > 0) {
        const id = workModels.pendingVideoId;
        workModels.pendingVideoId = null;
        setActiveId(id);
        setTimeout(() => videoRef.current?.play().catch(() => {}), 80);
      }
    };
    check();
    const unsub = subscribePendingTab(check);
    return () => { unsub(); };
  }, [visible, videos]);

  const active = videos.find(v => v.id === activeId);
  const columnLayout = isNarrow;

  // Video list (shared between desktop-left and mobile-bottom)
  const videoNav = (
    <nav style={{
      flexShrink: 0,
      width: columnLayout ? "100%" : "clamp(160px, 18vw, 240px)",
      maxHeight: columnLayout ? "22vh" : "none",
      overflowY: columnLayout ? "hidden" : "visible",
      overflowX: columnLayout ? "auto" : "hidden",
      marginRight: columnLayout ? 0 : "2.5rem",
      padding: columnLayout ? "0.5rem clamp(1rem, 4vw, 2rem) 0.5rem" : "0.75rem 0.5rem",
      display: "flex",
      flexDirection: columnLayout ? "row" : "column",
      gap: columnLayout ? "0.5rem" : "1.4rem",
      zIndex: 2,
      flexWrap: "nowrap",
      ...(!columnLayout ? {
        background: "rgba(8, 14, 32, 0.50)",
        borderRight: "1px solid rgba(184,240,255,0.08)",
        borderRadius: "2px",
      } : {}),
    }}>
      {videos.map((v, i) => {
        const on = v.id === activeId;
        return (
          <button
            key={v.id}
            onClick={() => {
              setActiveId(v.id);
              trackVideoPlay(v.id, v.title);
              setTimeout(() => videoRef.current?.play().catch(() => {}), 80);
            }}
            style={{
              background: "none",
              border: columnLayout ? `1px solid rgba(184,240,255,${on ? 0.3 : 0.12})` : "none",
              borderLeft: !columnLayout && on ? "1px solid rgba(184,240,255,0.55)" : undefined,
              borderRadius: columnLayout ? "3px" : undefined,
              cursor: "pointer",
              padding: columnLayout ? "0.5rem 0.75rem" : 0,
              paddingLeft: !columnLayout ? "0.65rem" : undefined,
              textAlign: "left",
              flexShrink: 0,
              display: "flex", flexDirection: "column", gap: "0.2rem",
            }}
          >
            <span style={{ ...MON, fontSize: "0.55rem", letterSpacing: "0.2em", color: on ? "rgba(184,240,255,0.6)" : "rgba(184,240,255,0.4)", transition: "color 0.3s" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span style={{
              ...MON, fontSize: columnLayout ? "0.72rem" : "0.75rem", letterSpacing: "0.08em",
              color: on ? "rgba(220,245,255,0.95)" : "rgba(184,240,255,0.55)",
              transition: "color 0.3s",
            }}>
              {v.title}
            </span>
          </button>
        );
      })}
      {videos.length === 0 && (
        <span style={{ ...MON, fontSize: "0.65rem", color: "rgba(184,240,255,0.4)" }}>No videos found</span>
      )}
    </nav>
  );

  return (
    <div style={{
      display: "flex",
      flexDirection: columnLayout ? "column" : "row",
      width: "100%",
      height: "100%",
      alignItems: "center",
      overflow: "hidden",
    }}>
      {/* Desktop: video list on the LEFT (matching model selection placement) */}
      {!columnLayout && videoNav}

      {/* Video player */}
      <div style={{
        flex: 1,
        minWidth: 0,
        minHeight: columnLayout ? "min(50vh, 320px)" : 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: columnLayout ? "0 clamp(1rem, 4vw, 2rem)" : "0 1.5rem",
        height: columnLayout ? "auto" : "100%",
        overflow: "hidden",
      }}>
        {active && (
          <div style={{
            position: "relative",
            width: "100%",
            maxHeight: columnLayout ? "min(55vh, 400px)" : "calc(100vh - 200px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}>
            <div style={{
              position: "absolute", inset: "-1px",
              border: "1px solid rgba(184,240,255,0.12)",
              borderRadius: "3px",
              boxShadow: "0 0 0 1px rgba(184,240,255,0.04) inset, 0 30px 80px rgba(0,0,0,0.85)",
              pointerEvents: "none",
            }} />
            <video
              ref={videoRef}
              key={active.path}
              src={active.path}
              controls
              loop
              playsInline
              style={{
                maxWidth: "100%",
                maxHeight: columnLayout ? "min(50vh, 360px)" : "calc(100vh - 240px)",
                width: "auto",
                height: "auto",
                objectFit: "contain",
                borderRadius: "2px",
                display: "block",
                background: "#000",
              }}
            />
            <div style={{
              marginTop: "0.6rem",
              alignSelf: "flex-start",
              display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap",
            }}>
              <span style={{ ...MON, fontSize: "0.68rem", letterSpacing: "0.18em", color: "rgba(184,240,255,0.6)" }}>
                {active.title}
              </span>
              <span style={{ ...MON, fontSize: "0.58rem", letterSpacing: "0.12em", color: "rgba(184,240,255,0.4)" }}>
                BLENDER · FINAL RENDER
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Mobile: video list at BOTTOM (like model chip strip) */}
      {columnLayout && (
        <div style={{
          width: "100%",
          overflowX: "auto",
          overflowY: "hidden",
          flexShrink: 0,
          borderTop: "1px solid rgba(184,240,255,0.06)",
          background: "rgba(0,4,16,0.60)",
          backdropFilter: "blur(10px)",
        }}>
          {videoNav}
        </div>
      )}
    </div>
  );
}
