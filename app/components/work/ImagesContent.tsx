"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { workModels, subscribePendingTab } from "../../lib/workModels";
import { trackImageView } from "../../lib/analytics";
import { usePortfolioData } from "../../lib/usePortfolioData";
import { type ImageEntry, MON } from "./types";

// ─── Images / gallery tab — enhanced lightbox with keyboard nav + zoom ─────
export function ImagesContent() {
  const { data: portfolioData } = usePortfolioData();
  const images = portfolioData.images as ImageEntry[];
  const [lightboxIdx, setLightboxIdx] = useState<number>(-1);
  const [zoomed, setZoomed]           = useState(false);

  // Consume pendingImageId from HUD
  useEffect(() => {
    const check = () => {
      if (workModels.pendingImageId && images.length > 0) {
        const id = workModels.pendingImageId;
        workModels.pendingImageId = null;
        const idx = images.findIndex(img => img.id === id);
        if (idx >= 0) setLightboxIdx(idx);
      }
    };
    check();
    const unsub = subscribePendingTab(check);
    return () => { unsub(); };
  }, [images]);

  const openLightbox = useCallback((idx: number) => {
    setLightboxIdx(idx);
    setZoomed(false);
    if (images[idx]) trackImageView(images[idx].id, images[idx].title);
  }, [images]);

  const closeLightbox = useCallback(() => {
    setLightboxIdx(-1);
    setZoomed(false);
  }, []);

  const nextImage = useCallback(() => {
    setLightboxIdx(prev => prev < images.length - 1 ? prev + 1 : 0);
    setZoomed(false);
  }, [images.length]);

  const prevImage = useCallback(() => {
    setLightboxIdx(prev => prev > 0 ? prev - 1 : images.length - 1);
    setZoomed(false);
  }, [images.length]);

  // Keyboard nav: ←/→ cycle, Escape close
  useEffect(() => {
    if (lightboxIdx < 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight") nextImage();
      else if (e.key === "ArrowLeft") prevImage();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxIdx, closeLightbox, nextImage, prevImage]);

  // Touch swipe: left/right to navigate images on mobile
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (lightboxIdx < 0) return;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY };
    };
    const onEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      touchStartRef.current = null;
      // Only horizontal swipe, threshold 50px, ignore vertical
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) nextImage();
        else prevImage();
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [lightboxIdx, nextImage, prevImage]);

  const lightboxImage = lightboxIdx >= 0 && lightboxIdx < images.length ? images[lightboxIdx] : null;

  return (
    <div style={{
      width: "100%",
      display: "flex", flexDirection: "column",
      padding: "0.5rem clamp(1rem, 4vw, 2.5rem) 2.5rem",
    }}>
      {images.length === 0 ? (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: "1rem",
        }}>
          <p style={{ ...MON, fontSize: "0.65rem", letterSpacing: "0.22em", color: "rgba(184,240,255,0.22)" }}>
            Drop images into /public/Image renders to populate this gallery
          </p>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "1rem",
          paddingBottom: "2rem",
        }}>
          {images.map((img, idx) => (
            <div
              key={img.id}
              onClick={() => openLightbox(idx)}
              className="image-grid-card"
              style={{
                cursor: "pointer",
                border: "1px solid rgba(184,240,255,0.08)",
                borderRadius: "2px",
                overflow: "hidden",
                transition: "border-color 0.3s ease, transform 0.3s ease, box-shadow 0.3s ease",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = "rgba(184,240,255,0.25)";
                el.style.transform = "scale(1.02)";
                el.style.boxShadow = "0 0 20px rgba(184,240,255,0.08)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = "rgba(184,240,255,0.08)";
                el.style.transform = "scale(1)";
                el.style.boxShadow = "none";
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={encodeURI(img.path)} alt={img.title} loading="lazy" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
              <div style={{ padding: "0.6rem 0.8rem", ...MON, fontSize: "0.65rem", letterSpacing: "0.14em", color: "rgba(184,240,255,0.55)" }}>
                {img.title}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox — full keyboard nav, zoom toggle, counter */}
      {lightboxImage && typeof document !== "undefined" && createPortal(
        <div
          onClick={(e) => {
            // Only close if clicking backdrop, not nav buttons
            if (e.target === e.currentTarget) closeLightbox();
          }}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,5,0.95)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: zoomed ? "zoom-out" : "zoom-in",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={encodeURI(lightboxImage.path)}
            alt={lightboxImage.title}
            onClick={(e) => { e.stopPropagation(); setZoomed(z => !z); }}
            style={{
              maxWidth: zoomed ? "100vw" : "90vw",
              maxHeight: zoomed ? "100vh" : "88vh",
              objectFit: "contain",
              transition: "transform 0.35s ease, max-width 0.35s ease, max-height 0.35s ease",
              transform: zoomed ? "scale(1)" : "scale(0.98)",
            }}
          />

          {/* Image counter — top left */}
          <span style={{
            position: "absolute", top: "1.4rem", left: "1.8rem",
            ...MON, fontSize: "0.55rem", letterSpacing: "0.22em",
            color: "rgba(184,240,255,0.4)",
          }}>
            {String(lightboxIdx + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}
          </span>

          {/* Close + nav hint — top right */}
          <span style={{
            position: "absolute", top: "1.4rem", right: "1.8rem",
            ...MON, fontSize: "0.5rem", letterSpacing: "0.18em",
            color: "rgba(184,240,255,0.35)", cursor: "pointer",
          }}
            onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
          >
            CLOSE
          </span>

          {/* Image title — bottom center */}
          <div style={{
            position: "absolute", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)",
            ...MON, fontSize: "0.6rem", letterSpacing: "0.16em",
            color: "rgba(184,240,255,0.5)",
            textAlign: "center",
          }}>
            {lightboxImage.title}
          </div>

          {/* Prev/Next arrows */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prevImage(); }}
                style={{
                  position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)",
                  background: "rgba(4,8,20,0.6)", border: "1px solid rgba(184,240,255,0.1)",
                  borderRadius: "3px", color: "rgba(184,240,255,0.5)", cursor: "pointer",
                  padding: "0.6rem 0.5rem", fontSize: "1rem",
                  backdropFilter: "blur(8px)", transition: "all 0.2s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.35)"; e.currentTarget.style.color = "rgba(184,240,255,0.9)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.1)"; e.currentTarget.style.color = "rgba(184,240,255,0.5)"; }}
                aria-label="Previous image"
              >
                ‹
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); nextImage(); }}
                style={{
                  position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)",
                  background: "rgba(4,8,20,0.6)", border: "1px solid rgba(184,240,255,0.1)",
                  borderRadius: "3px", color: "rgba(184,240,255,0.5)", cursor: "pointer",
                  padding: "0.6rem 0.5rem", fontSize: "1rem",
                  backdropFilter: "blur(8px)", transition: "all 0.2s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.35)"; e.currentTarget.style.color = "rgba(184,240,255,0.9)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(184,240,255,0.1)"; e.currentTarget.style.color = "rgba(184,240,255,0.5)"; }}
                aria-label="Next image"
              >
                ›
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
