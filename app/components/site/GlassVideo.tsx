"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Format seconds as M:SS (falls back to 0:00 for NaN/Infinity during load). */
function fmt(t: number) {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SEEK_STEP = 5; // seconds, keyboard arrows
const TOUCH_HIDE_MS = 2600;

/**
 * Custom video player with glass-styled controls. Replaces native
 * <video controls> so the chrome matches the site's liquid-glass UI language.
 *
 * Controls: play/pause, scrubber, time, mute, fullscreen.
 * Keyboard (wrapper focus): Space/K play · ←/→ seek 5s · M mute · F fullscreen.
 * Touch: tap reveals the control bar (auto-hides), second tap toggles play.
 * No-JS: the native `controls` attribute is server-rendered and removed on
 * hydration, so the video stays usable if JavaScript never runs.
 */
export function GlassVideo({
  src,
  poster,
  className = "",
}: {
  src: string;
  poster?: string;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<number>(0);
  const [hydrated, setHydrated] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [touchControls, setTouchControls] = useState(false);
  // Natural aspect ratio of THIS video — set from metadata so the frame matches
  // the source instead of forcing a fixed box.
  const [ratio, setRatio] = useState<number | null>(null);

  // Swap native controls for the glass chrome only once JS is live.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHydrated(true), []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => setFailed(true));
    else v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const wrap = wrapRef.current;
    const v = videoRef.current;
    if (!wrap || !v) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    if (wrap.requestFullscreen) {
      wrap.requestFullscreen();
      return;
    }
    // iOS Safari: no Element.requestFullscreen — use the video's native path.
    const iosVideo = v as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    iosVideo.webkitEnterFullscreen?.();
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.min(Math.max(v.currentTime + delta, 0), v.duration);
    setCurrent(v.currentTime);
  }, []);

  const seek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const t = Number(e.target.value);
    v.currentTime = t;
    setCurrent(t);
  }, []);

  // Big-play hands focus to the control bar's play button so keyboard users
  // aren't stranded when the overlay unmounts.
  const bigPlay = useCallback(() => {
    togglePlay();
    requestAnimationFrame(() => playBtnRef.current?.focus());
  }, [togglePlay]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Don't double-handle keys aimed at the scrubber or buttons.
      const tag = (e.target as HTMLElement).tagName;
      const isScrubber = tag === "INPUT";
      switch (e.key) {
        case " ":
        case "k":
        case "K":
          if (tag === "BUTTON") return; // let the focused button's native click fire
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          if (isScrubber) return;
          e.preventDefault();
          seekBy(-SEEK_STEP);
          break;
        case "ArrowRight":
          if (isScrubber) return;
          e.preventDefault();
          seekBy(SEEK_STEP);
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
      }
    },
    [togglePlay, seekBy, toggleMute, toggleFullscreen],
  );

  // Touch: first tap reveals controls (with an auto-hide timer); a tap while
  // controls are visible toggles playback. Mouse clicks just toggle.
  const onSurfaceTap = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") {
        if (!touchControls) {
          setTouchControls(true);
          window.clearTimeout(hideTimer.current);
          hideTimer.current = window.setTimeout(() => setTouchControls(false), TOUCH_HIDE_MS);
          return;
        }
        window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => setTouchControls(false), TOUCH_HIDE_MS);
      }
      togglePlay();
    },
    [touchControls, togglePlay],
  );

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => {
      setPlaying(true);
      setEnded(false);
    };
    const onPause = () => setPlaying(false);
    const onTime = () => {
      setCurrent(v.currentTime);
      setBuffering(false);
    };
    const onMeta = () => {
      setDuration(v.duration);
      if (v.videoWidth > 0 && v.videoHeight > 0) setRatio(v.videoWidth / v.videoHeight);
    };
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onEnded = () => setEnded(true);
    const onError = () => setFailed(true);
    const onFs = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("stalled", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("stalled", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
      document.removeEventListener("fullscreenchange", onFs);
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const showBigPlay = hydrated && !failed && (!playing || ended);

  return (
    <div
      ref={wrapRef}
      className={[
        "glass-video",
        playing ? "is-playing" : "",
        fullscreen ? "is-fullscreen" : "",
        touchControls ? "is-controls" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      tabIndex={0}
      role="group"
      aria-label="Video player"
      onKeyDown={onKeyDown}
      style={ratio && !fullscreen ? ({ aspectRatio: String(ratio) } as React.CSSProperties) : undefined}
    >
      <video
        ref={videoRef}
        className="glass-video__media"
        preload="metadata"
        playsInline
        poster={poster}
        controls={!hydrated}
        onPointerUp={hydrated ? onSurfaceTap : undefined}
      >
        <source src={src} />
      </video>

      {failed ? (
        <p className="glass-video__error" role="alert">
          Video unavailable — try reloading the page.
        </p>
      ) : null}

      {buffering && playing && !failed ? (
        <span className="glass-video__spinner" aria-hidden="true" />
      ) : null}

      {/* Center play / replay affordance while paused or ended */}
      {showBigPlay ? (
        <button
          type="button"
          className="glass-video__big-play"
          onClick={bigPlay}
          aria-label={ended ? "Replay" : "Play"}
        >
          {ended ? (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"
                fill="currentColor"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
          )}
        </button>
      ) : null}

      {hydrated && !failed ? (
        <div className="glass-video__controls">
          <button
            ref={playBtnRef}
            type="button"
            className="glass-video__btn"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path d="M8 5v14l11-7z" fill="currentColor" />
              </svg>
            )}
          </button>

          <span className="glass-video__time">{fmt(current)}</span>

          <input
            type="range"
            className="glass-video__scrubber"
            min={0}
            max={duration || 0}
            step={1}
            value={current}
            onChange={seek}
            style={{ "--pct": `${pct}%` } as React.CSSProperties}
            aria-label="Seek"
            aria-valuetext={`${fmt(current)} of ${fmt(duration)}`}
          />

          <span className="glass-video__time glass-video__time--total">{fmt(duration)}</span>

          <button
            type="button"
            className="glass-video__btn"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path d="M4 9v6h4l5 5V4L8 9H4zm12.5 3l2.5 2.5-1 1L15.5 13 13 15.5l-1-1L14.5 12 12 9.5l1-1L15.5 11 18 8.5l1 1L16.5 12z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path d="M4 9v6h4l5 5V4L8 9H4zm11 .5a4 4 0 0 1 0 5v-5zm0-3.2a7 7 0 0 1 0 11.4l-.8-1.2a5.5 5.5 0 0 0 0-9z" fill="currentColor" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="glass-video__btn"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
