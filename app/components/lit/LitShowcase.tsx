"use client";
/* eslint-disable @next/next/no-img-element -- draft: plain <img> keeps true pixel sizes */

/**
 * LitShowcase — the whole site: "lit, not styled", a catalogue of lit objects.
 *
 *   contact sheet → every piece at once, true proportions, one click to open
 *   piece → fills the screen in its own light; a museum-style label beside it
 *
 * Colour comes only from the work: stills and video sit on their own edge
 * colour, 3D sits on a lit cyclorama painted from the asset's albedo. Moving
 * between pieces is an exposure change; opening one morphs it out of its tile.
 */

import dynamic from "next/dynamic";
import { flushSync } from "react-dom";
import { Component, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode, PointerEvent as RPointerEvent } from "react";
import type { Specimen, WorkCategory } from "../../lib/content";
import type { HandPose, SpecimenChannel, TexKey } from "../site/SpecimenScene";
import { useDisplayMode } from "../site/DisplayModeProvider";
import st from "./lit.module.css";

const SpecimenScene = dynamic(() => import("../site/SpecimenScene"), { ssr: false });

export type LitAsset = { id: string; title: string; summary?: string; specimen: Specimen };
/** The room a piece sits in: a deep wall (shadow → light where the light falls)
 *  and an accent in the work's own hue. See scripts/make-rooms.mjs. */
export type Room = { shadow: string; light: string; accent: string; shape?: "pool" | "low" | "rake" | "horizon" };
type VideoMedia = { kind: "video"; src: string; poster: string; w: number; h: number; fps: number; frames: number; dur: number; audio: boolean };
type ImageMedia = { kind: "image"; src: string; thumb: string; w: number; h: number };
type ModelMedia = { kind: "model"; assets: LitAsset[]; rigged: boolean };
export type LitPiece = {
  slug: string;
  no: number;
  title: string;
  cat: WorkCategory;
  year: string;
  discipline: string;
  summary: string;
  role: string[];
  tools: string[];
  media: VideoMedia | ImageMedia | ModelMedia;
  tile: { src: string; ar: number };
  field: [string, string];
  room: Room;
  /** 3D only: the asset that stands for the piece in the index. */
  cover?: number;
  /** The page title this piece uses (its SEO title). */
  seoTitle?: string;
  /** Stills: smaller renditions for srcset ("url 1280w, url 1920w"). */
  srcset?: string;
};

type Seq = "all" | WorkCategory;
type View = "sheet" | "frame";
type Nav = { view: View; seq: Seq; slug: string; asset: number; fromUrl?: boolean };
type Go = (next: Partial<Nav>) => void;
type Morph = (next: Partial<Nav>, from?: HTMLElement | null) => void;

const CATS: { id: Seq; label: string }[] = [
  { id: "all", label: "All" },
  { id: "models", label: "Models" },
  { id: "rigged", label: "Rigged Characters" },
  { id: "video", label: "Video" },
  { id: "images", label: "Images" },
];
const CAT_LABEL: Record<WorkCategory, string> = { models: "Models", rigged: "Rigged Characters", video: "Video", images: "Images" };
const VT_NAME = "lit-work";

const pad = (n: number) => String(n).padStart(2, "0");
const enc = (p: string) => encodeURI(p);
const fmt = (n: number) => n.toLocaleString("en-US");
const clock = (t: number, tenths = true) => {
  // Round first, then split, so 9.97 s reads 0:10.0 (not 0:010.0).
  const r = tenths ? Math.round(t * 10) / 10 : Math.round(t);
  const m = Math.floor(r / 60);
  const s = r - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${tenths ? s.toFixed(1) : s}`;
};
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const ratio = (w: number, h: number) => `${w / gcd(w, h)}:${h / gcd(w, h)}`;
const formatOf = (p: string) => (p.split(".").pop() ?? "").toUpperCase();

/** Make the film grain come alive for a moment (moves between pieces,
 *  opening, hovering the index, scrubbing). Any component can call it. */
function boil(ms = 420, soft = false) {
  window.dispatchEvent(new CustomEvent("lit:boil", { detail: { ms, soft } }));
}

/** Warm the browser cache for an image (neighbours, the next likely click). */
const preloaded = new Set<string>();
function preload(src?: string) {
  if (!src || preloaded.has(src) || typeof window === "undefined") return;
  preloaded.add(src);
  const i = new Image();
  i.decoding = "async";
  i.src = encodeURI(src);
}
/** Warm the cache for a 3D asset's files (model + maps), at low priority. */
const prefetched = new Set<string>();
function prefetchAsset(sp: Specimen) {
  const files = [sp.modelPath, sp.extraModelPath, ...Object.values(sp.textures)].filter(Boolean) as string[];
  files.forEach((f) => {
    if (prefetched.has(f)) return;
    prefetched.add(f);
    void fetch(encodeURI(f), { priority: "low" } as RequestInit).catch(() => {});
  });
}
/** What a piece shows first — its poster, thumbnail or set photograph. */
function firstImage(p: LitPiece): string | undefined {
  const m = p.media;
  if (m.kind === "video") return m.poster;
  if (m.kind === "image") return m.thumb;
  return m.assets[p.cover ?? 0].specimen.setStill?.src ?? m.assets[p.cover ?? 0].specimen.poster;
}
/** Where an index loop was when you opened its piece, so the piece's video
 *  carries on from there instead of restarting. */
const playheads = new Map<string, number>();
/** A 1×1 transparent GIF: the "no download" source for pictures in a layout
 *  that isn't showing (both index layouts are in the HTML). */
const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/** The picture standing for a piece on the index, in whichever index layout
 *  is showing (desktop: the lit layer; phone: its card). */
function tileOf(slug: string): HTMLElement | null {
  const phone = window.matchMedia("(max-width: 760px)").matches;
  return document.querySelector<HTMLElement>(phone ? `[data-ptile="${slug}"]` : `[data-tile="${slug}"]`);
}

/** The room a piece sits in; for 3D, the shown asset's set. */
const CREAM = "#f1e9dc";
function roomOf(p: LitPiece, asset?: number): Room {
  if (p.media.kind !== "model") return p.room;
  const st = p.media.assets[asset ?? p.cover ?? 0]?.specimen.stage;
  if (!st) return p.room;
  return { light: st.field[0], shadow: st.field[1], accent: st.accent ?? CREAM, shape: "pool" };
}

/** One line of dimensions, the same shape for every kind of work. */
function dimensions(m: LitPiece["media"], asset: number): string {
  if (m.kind === "image") return `${fmt(m.w)} × ${fmt(m.h)} px · ${ratio(m.w, m.h)}`;
  if (m.kind === "video") return `${fmt(m.w)} × ${fmt(m.h)} · ${m.fps} fps · ${clock(m.dur, false)} · ${fmt(m.frames)} frames`;
  const sp = m.assets[asset].specimen;
  const f = sp.facts;
  if (!f) return formatOf(sp.modelPath);
  return m.rigged
    ? `${fmt(f.triangles)} tris · ${formatOf(sp.modelPath)} · skinned`
    : `${fmt(f.triangles)} tris · ${f.maps} PBR maps · ${formatOf(sp.modelPath)}`;
}

// ── client-only plumbing (no setState-in-effect anywhere) ──
const noopSub = () => () => {};
function useIsClient() {
  return useSyncExternalStore(noopSub, () => true, () => false);
}
const subResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
function useViewport() {
  const s = useSyncExternalStore(subResize, () => `${window.innerWidth}x${window.innerHeight}`, () => "1440x900");
  const [w, h] = s.split("x").map(Number);
  return { w, h, phone: w <= 760 };
}
function useMedia(q: string) {
  const sub = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(q);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [q],
  );
  return useSyncExternalStore(sub, () => window.matchMedia(q).matches, () => false);
}
const subPop = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
/** The address bar's query. "" on the server and during hydration, so the
 *  server HTML and the first client render always match. */
function useSearch() {
  return useSyncExternalStore(subPop, () => window.location.search, () => "");
}
/** Review-only URL flags (?slow=N, ?still). */
function useFlag(name: string) {
  return new URLSearchParams(useSearch()).get(name);
}

type VTDoc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

// View-transition pseudo-elements are global by nature (a CSS module can't hold them).
const vtCss = (slow: number) => `
::view-transition-group(${VT_NAME}){animation-duration:${420 * slow}ms;animation-timing-function:cubic-bezier(.2,.7,.2,1)}
::view-transition-old(${VT_NAME}),::view-transition-new(${VT_NAME}){width:100%;height:100%;object-fit:cover}
::view-transition-old(root),::view-transition-new(root){animation-duration:${240 * slow}ms}
`;

export type LitStart = { view: View; slug?: string; seq?: Seq };
type LitProps = {
  pieces: LitPiece[];
  email: string;
  emailHref: string;
  xHref: string;
  start?: LitStart;
  intro?: string;
  /** Site title pattern, e.g. { default: "Multiscatter | …", template: "%s | Multiscatter" }. */
  titles?: { default: string; template: string };
};

export default function LitShowcase(props: LitProps) {
  return (
    <>
      <nav className={st.sr} aria-label="All work">
        <ul>
          {props.pieces.map((p) => (
            <li key={p.slug}>
              <a href={`/work/${p.slug}`}>{p.title}</a>
            </li>
          ))}
        </ul>
      </nav>
      <Lit {...props} />
    </>
  );
}

/** Where to start: the address bar's query (shared links, reloads, back/
 *  forward) wins; otherwise the route's own start (e.g. /work/[slug]). */
function readNav(pieces: LitPiece[], start: LitStart | undefined, search: string): Nav {
  const q = new URLSearchParams(search);
  const has = (s: string | null | undefined) => !!s && pieces.some((p) => p.slug === s);
  const fromQuery = q.get("v") === "frame" || q.get("v") === "sheet";
  const view: View = fromQuery ? (q.get("v") as View) : start?.view ?? "sheet";
  const seq = CATS.map((c) => c.id).find((c) => c === (fromQuery ? q.get("c") : start?.seq)) ?? "all";
  // (the index honours a category too: ?v=sheet&c=video shows it filtered)
  const slug = fromQuery && has(q.get("p")) ? (q.get("p") as string) : has(start?.slug) ? (start?.slug as string) : pieces[0].slug;
  const piece = pieces.find((p) => p.slug === slug);
  const a = Number(q.get("a"));
  const asset = fromQuery && a ? a : piece?.cover ?? 0;
  return { view, seq, slug, asset, fromUrl: true };
}

function Lit({ pieces, email, emailHref, xHref, start, intro, titles }: LitProps) {
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const vp = useViewport();
  // ?slow=N — review only: every transition runs N× slower so it can be inspected.
  const slow = Math.max(1, Number(useFlag("slow")) || 1);
  // The route decides the first render (identical on server and client); a
  // query in the address bar (a shared link, a reload) is applied once the
  // page is live — a render-time adjustment, so no effect cascade.
  const search = useSearch();
  const [nav, setNav] = useState<Nav>(() => readNav(pieces, start, ""));
  const [queryRead, setQueryRead] = useState(false);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const [alone, setAlone] = useState(false);
  const [help, setHelp] = useState(false);
  // The piece lit on the index (pointer, focus or arrow keys). `engaged`: the
  // visitor has moved through the index — only then does any video load.
  const [hot, setHotState] = useState(nav.slug);
  const [engaged, setEngaged] = useState(false);
  const setHot = useCallback((v: string | ((h: string) => string)) => {
    setHotState((h) => {
      const next = typeof v === "function" ? v(h) : v;
      if (next !== h) boil(320, true); // the room's light changes: the grain stirs softly with it
      return next;
    });
    setEngaged(true);
  }, []);
  // Read the address bar exactly once, on the first render after hydration
  // (`client`), query or not — later queries are our own mirror writing it.
  const client = useIsClient();
  if (!queryRead && client) {
    setQueryRead(true);
    const q = new URLSearchParams(search).get("v");
    if (q === "frame" || q === "sheet") {
      const n = readNav(pieces, start, search);
      setNav(n);
      setHotState(n.slug);
    }
  }
  const timers = useRef<number[]>([]);
  // A data attribute on the grain layer (React never manages it, so a
  // re-render mid-transition can't wipe it the way it would a class).
  // The live grain layer: rises when an action happens, keeps running while it
  // settles (so motion never stops dead), then pauses. Data attributes, not
  // classes, so React re-renders can't wipe them mid-transition.
  const grainRef = useRef<HTMLDivElement>(null);
  const localRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Once per visit, a moment after the page settles, the wordmark's sheen runs
  // by itself — a hint that it's alive. Then only on hover.
  const wmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      if (sessionStorage.getItem("lit-wm")) return;
      sessionStorage.setItem("lit-wm", "1");
    } catch {
      return;
    }
    const el = wmRef.current;
    const t1 = window.setTimeout(() => el && (el.dataset.intro = ""), 1400);
    const t2 = window.setTimeout(() => el && delete el.dataset.intro, 3200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);
  useEffect(() => {
    let tOff = 0;
    let tSettle = 0;
    let until = 0;
    const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const on = (e: Event) => {
      const el = grainRef.current;
      if (!el || reduce()) return;
      const { ms = 420, soft = false } = (e as CustomEvent<{ ms?: number; soft?: boolean }>).detail ?? {};
      until = Math.max(until, performance.now() + ms);
      if (!soft || el.dataset.boil !== "full") el.dataset.boil = soft ? "soft" : "full";
      el.dataset.run = "";
      window.clearTimeout(tOff);
      window.clearTimeout(tSettle);
      tOff = window.setTimeout(() => {
        delete el.dataset.boil; // the layer fades out (CSS) while still running…
        tSettle = window.setTimeout(() => delete el.dataset.run, 900); // …then rests
      }, until - performance.now());
    };
    window.addEventListener("lit:boil", on);
    // Local grain: around a mouse pointer that's over something you can click,
    // the stock stirs a little. Position via CSS vars, written once per frame.
    let raf = 0;
    let mx = 0;
    let my = 0;
    const move = (e: PointerEvent) => {
      const el = localRef.current;
      if (!el || e.pointerType !== "mouse" || reduce()) return;
      mx = e.clientX;
      my = e.clientY;
      const near = e.target instanceof Element && !!e.target.closest("a, button, [role='slider']");
      if (near) el.dataset.near = "";
      else delete el.dataset.near;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.setProperty("--mx", `${mx}px`);
          el.style.setProperty("--my", `${my}px`);
        });
      }
    };
    const leave = () => {
      if (localRef.current) delete localRef.current.dataset.near;
    };
    // Keyboard parity: the grain also gathers around whatever has keyboard focus.
    const focus = (e: FocusEvent) => {
      const el = localRef.current;
      const t = e.target;
      if (!el || reduce() || !(t instanceof Element) || !t.matches(":focus-visible")) return;
      const r = t.getBoundingClientRect();
      el.style.setProperty("--mx", `${r.left + r.width / 2}px`);
      el.style.setProperty("--my", `${r.top + r.height / 2}px`);
      el.dataset.near = "";
    };
    const blur = () => {
      if (localRef.current && !document.activeElement?.matches(":focus-visible")) delete localRef.current.dataset.near;
    };
    // Stillness: after 2 s without the pointer moving, quiet chrome (the alone
    // view's caption) fades; any movement brings it back.
    let idleT = 0;
    const wake = () => {
      const r = rootRef.current;
      if (!r) return;
      delete r.dataset.idle;
      window.clearTimeout(idleT);
      idleT = window.setTimeout(() => (r.dataset.idle = ""), 2000);
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("keydown", wake);
    document.documentElement.addEventListener("pointerleave", leave);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    wake();
    return () => {
      window.removeEventListener("lit:boil", on);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
      window.clearTimeout(idleT);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.clearTimeout(tOff);
      window.clearTimeout(tSettle);
      cancelAnimationFrame(raf);
    };
  }, []);
  const slugRef = useRef(nav.slug);
  useEffect(() => {
    slugRef.current = nav.slug;
  }, [nav.slug]);

  // Between pieces: an exposure change — the frame lifts to light (120 ms)
  // and the next one develops out of it (280 ms). Reduced motion → a cut.
  const go = useCallback<Go>(
    (next) => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      if (reduced) {
        setNav((n) => ({ ...n, ...next, fromUrl: false }));
        if (next.view) setAlone(false);
        return;
      }
      setPhase("out");
      boil(480 * slow);
      timers.current.push(
        window.setTimeout(() => {
          setNav((n) => ({ ...n, ...next, fromUrl: false }));
          if (next.view) setAlone(false); // stepping keeps the alone view; leaving it doesn't
          setPhase("in");
        }, 120 * slow),
      );
      timers.current.push(window.setTimeout(() => setPhase("idle"), 420 * slow));
    },
    [reduced, slow],
  );
  // Inside one piece (asset switch): no page transition at all.
  const swap = useCallback<Go>((next) => {
    boil(380);
    setNav((n) => ({ ...n, ...next, fromUrl: false }));
  }, []);
  // Sheet ↔ piece: the tile and the piece are one element morphing between
  // places (View Transitions); browsers without it get a plain cut.
  const morph = useCallback<Morph>(
    (next, from) => {
      const apply = () => {
        setNav((n) => ({ ...n, ...next, fromUrl: false }));
        setAlone(false);
        // Coming back lights the piece you were looking at.
        if (next.view === "sheet") setHotState(slugRef.current);
      };
      const doc = document as VTDoc;
      boil(520 * slow);
      if (reduced || !doc.startViewTransition) return apply();
      if (from) from.style.viewTransitionName = VT_NAME;
      const t = doc.startViewTransition(() => {
        flushSync(apply);
        if (next.view === "sheet") {
          const back = tileOf(slugRef.current);
          if (back) back.style.viewTransitionName = VT_NAME;
        }
      });
      t.finished.finally(() => {
        document.querySelectorAll<HTMLElement>("[data-tile]").forEach((el) => (el.style.viewTransitionName = ""));
      });
    },
    [reduced, slow],
  );
  const toggleAlone = useCallback(
    (v?: boolean) => {
      boil(360);
      const apply = () => setAlone((a) => v ?? !a);
      const doc = document as VTDoc;
      if (reduced || !doc.startViewTransition) return apply();
      doc.startViewTransition(() => flushSync(apply));
    },
    [reduced],
  );

  const list = useMemo(() => (nav.seq === "all" ? pieces : pieces.filter((p) => p.cat === nav.seq)), [nav.seq, pieces]);
  const piece = list.find((p) => p.slug === nav.slug) ?? list[0];
  const assetIdx = piece.media.kind === "model" ? Math.min(nav.asset, piece.media.assets.length - 1) : 0;

  // Address bar: left alone on arrival (a shared /work/<slug> link stays as it
  // is), then mirrors the view on "/" — shareable and reload-safe. Opening or
  // closing a piece is a history step (Back returns to the index); moving
  // between pieces replaces it. No state is set here.
  const lastView = useRef<View | null>(null);
  useEffect(() => {
    if (lastView.current === null || nav.fromUrl) {
      lastView.current = nav.view;
      return;
    }
    const u = new URL(window.location.href);
    u.pathname = "/";
    ["v", "c", "p", "a"].forEach((k) => u.searchParams.delete(k));
    if (nav.view === "frame") {
      u.searchParams.set("v", "frame");
      if (nav.seq !== "all") u.searchParams.set("c", nav.seq);
      u.searchParams.set("p", piece.slug);
      if (piece.media.kind === "model" && piece.media.assets.length > 1) u.searchParams.set("a", String(assetIdx));
    } else if (nav.seq !== "all") {
      u.searchParams.set("v", "sheet");
      u.searchParams.set("c", nav.seq);
    }
    if (lastView.current !== nav.view) window.history.pushState(null, "", u);
    else window.history.replaceState(null, "", u);
    lastView.current = nav.view;
  }, [nav.view, nav.seq, nav.fromUrl, piece, assetIdx]);
  useEffect(() => {
    const onPop = () => {
      const n = readNav(pieces, start, window.location.search);
      setNav(n);
      setAlone(false);
      setHotState(n.slug);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [pieces, start]);

  const step = useCallback(
    (d: 1 | -1) => {
      const i = list.indexOf(piece);
      const n = list[(i + d + list.length) % list.length];
      go({ slug: n.slug, asset: 0 });
    },
    [go, list, piece],
  );
  // Categories filter the index in place: matching titles stay lit, the rest
  // step back. From a piece, a category returns you to the index, filtered.
  const openCat = useCallback(
    (id: Seq) => {
      if (nav.view === "frame") return morph({ view: "sheet", seq: id });
      const first = id === "all" ? null : pieces.find((p) => p.cat === id);
      boil(320, true);
      setNav((n) => ({ ...n, seq: id, fromUrl: false }));
      if (first && pieces.find((p) => p.slug === hot)?.cat !== id) setHotState(first.slug);
    },
    [hot, morph, nav.view, pieces],
  );
  const shown = useMemo(() => (nav.seq === "all" ? pieces : pieces.filter((p) => p.cat === nav.seq)), [nav.seq, pieces]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest("[role='application'], [role='slider'], input, textarea")) return; // widgets own their arrows
      if (e.key === "?") {
        setHelp((h) => !h);
        return;
      }
      if (e.key === "Escape" && help) {
        setHelp(false);
        return;
      }
      if (/^[1-5]$/.test(e.key)) openCat(CATS[Number(e.key) - 1].id);
      else if (nav.view === "sheet") {
        const vis = shown;
        const i = Math.max(0, vis.findIndex((p) => p.slug === hot));
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const d = e.key === "ArrowDown" ? 1 : -1;
          // From the latest value, so quick repeated presses each take a step.
          setHot((h) => {
            const j = Math.max(0, vis.findIndex((p) => p.slug === h));
            return vis[(j + d + vis.length) % vis.length].slug;
          });
        } else if (e.key === "Home" || e.key === "End") {
          e.preventDefault();
          setHot(vis[e.key === "Home" ? 0 : vis.length - 1].slug);
        } else if (/^[a-z]$/i.test(e.key) && !(t instanceof HTMLInputElement)) {
          // Type-ahead: the next title (after the lit one) starting with that letter.
          const k = e.key.toLowerCase();
          const order = [...vis.slice(i + 1), ...vis.slice(0, i + 1)];
          const hit = order.find((p) => p.title.toLowerCase().startsWith(k));
          if (hit) setHot(hit.slug);
        } else if (e.key === "Enter" && !(t instanceof HTMLButtonElement)) {
          const p = vis[i] ?? vis[0];
          morph({ view: "frame", seq: nav.seq, slug: p.slug, asset: p.cover ?? 0 }, tileOf(p.slug));
        }
      } else if (nav.view === "frame") {
        if (e.key === "ArrowRight") step(1);
        else if (e.key === "ArrowLeft") step(-1);
        else if (e.key === "Escape") {
          if (alone) toggleAlone(false);
          else morph({ view: "sheet" });
        } else if (e.key === "f" || e.key === "F") toggleAlone();
        else if (e.key === " " && piece.media.kind === "video") {
          e.preventDefault();
          document.querySelector<HTMLButtonElement>("[data-play]")?.click();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alone, help, hot, morph, nav.seq, nav.view, openCat, piece.media.kind, setHot, shown, step, toggleAlone]);

  const hotPiece = pieces.find((p) => p.slug === hot) ?? pieces[0];

  // The browser tab names what you're looking at.
  useEffect(() => {
    if (!titles) return;
    document.title = nav.view === "frame" ? titles.template.replace("%s", piece.seoTitle ?? piece.title) : titles.default;
  }, [titles, nav.view, piece]);
  // Phones: a new piece (or the index) opens at its top, not the old scroll.
  const scrollKey = `${nav.view}:${nav.slug}`;
  const lastScrollKey = useRef(scrollKey);
  useEffect(() => {
    if (lastScrollKey.current === scrollKey) return;
    lastScrollKey.current = scrollKey;
    if (window.matchMedia("(max-width: 760px)").matches) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [scrollKey]);
  // Warm the cache for the likely next look: the lit piece's neighbours on the
  // index, the previous/next piece on a piece.
  useEffect(() => {
    const L = nav.view === "sheet" ? shown : list;
    const at = nav.view === "sheet" ? hotPiece : piece;
    const k = Math.max(0, L.indexOf(at));
    [L[k + 1], L[k - 1], at].forEach((p) => p && preload(firstImage(p)));
  }, [nav.view, shown, list, hotPiece, piece]);
  // A hidden tab pauses every video; coming back resumes the ones that played.
  useEffect(() => {
    const was = new Set<HTMLVideoElement>();
    const vis = () => {
      const vids = Array.from(document.querySelectorAll("video"));
      if (document.hidden) {
        vids.forEach((v) => {
          if (!v.paused) {
            was.add(v);
            v.pause();
          }
        });
      } else {
        was.forEach((v) => v.isConnected && void v.play().catch(() => {}));
        was.clear();
      }
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);
  // Phones list every piece with nothing "lit": CSS keeps that room neutral.
  const room: Room = nav.view === "sheet" ? roomOf(hotPiece) : roomOf(piece, assetIdx);
  const activeCat: Seq = nav.seq;
  // Mobile browser chrome takes the room's colour (the index on phones is neutral).
  useEffect(() => {
    let m = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!m) {
      m = document.createElement("meta");
      m.name = "theme-color";
      document.head.appendChild(m);
    }
    const phoneIndex = nav.view === "sheet" && window.matchMedia("(max-width: 760px)").matches;
    m.content = phoneIndex ? "#0e0d0c" : room.shadow;
  }, [room.shadow, nav.view]);

  return (
    <div
      ref={rootRef}
      className={`${st.root} ${phase === "out" ? st.out : phase === "in" ? st.in : ""} ${alone ? st.isAlone : ""} ${nav.view === "sheet" ? st.onIndex : ""}`}
      data-light={room.shape ?? "pool"}
      style={
        {
          "--f1": room.shadow,
          "--f2": room.shadow,
          "--accent": room.accent,
          "--room-l": room.light,
          "--slow": slow,
          "--grain": "url(/images/grain.png)",
        } as CSSProperties
      }
    >
      <style>{vtCss(slow)}</style>
      <FieldLayers room={room} />
      <div ref={grainRef} className={st.grain} aria-hidden="true" />
      <div ref={localRef} className={st.grainLocal} aria-hidden="true" />
      <header className={st.bar}>
        <button
          type="button"
          ref={wmRef}
          className={st.wm}
          onClick={() => (nav.view === "frame" ? morph({ view: "sheet", seq: "all" }) : openCat("all"))}
          aria-label="Multiscatter — all work"
        >
          <span aria-hidden="true" className={st.wmText}>
            Mult
            <span className={st.wmI}>
              ı<span className={st.tittle} />
            </span>
            scatter
          </span>
        </button>
        <nav className={st.cats} aria-label="Work">
          {CATS.map((c) => {
            const n = c.id === "all" ? pieces.length : pieces.filter((p) => p.cat === c.id).length;
            return (
              <button
                key={c.id}
                type="button"
                className={`${st.cat} ${nav.view === "frame" && activeCat !== c.id && c.id === piece.cat ? st.catHere : ""}`}
                aria-current={activeCat === c.id ? "page" : undefined}
                onClick={() => openCat(c.id)}
              >
                {c.label}
                <span className={st.count}>{pad(n)}</span>
              </button>
            );
          })}
        </nav>
        <Reach email={email} emailHref={emailHref} xHref={xHref} />
      </header>

      <main className={st.stage}>
        {nav.view === "sheet" ? (
          <Index
            pieces={pieces}
            seq={nav.seq}
            intro={intro}
            hot={hotPiece}
            setHot={setHot}
            engaged={engaged}
            onOpen={(p, el) => morph({ view: "frame", seq: nav.seq, slug: p.slug, asset: p.cover ?? 0 }, el)}
          />
        ) : (
          <Frame
            key={piece.slug}
            piece={piece}
            list={list}
            seq={nav.seq}
            asset={assetIdx}
            vp={vp}
            alone={alone}
            go={go}
            swap={swap}
            morph={morph}
            step={step}
            toggleAlone={toggleAlone}
          />
        )}
      </main>
      {help ? <Help onClose={() => setHelp(false)} /> : null}

      {vp.phone ? (
        <footer className={st.phoneReach}>
          <Reach email={email} emailHref={emailHref} xHref={xHref} full />
        </footer>
      ) : null}
    </div>
  );
}

// The keys, on "?" — small, quiet, dismissed with Esc, ? or a click.
function Help({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["↑ ↓", "Move through the index"],
    ["A–Z", "Jump to a title"],
    ["Enter", "Open the lit piece"],
    ["1–5", "Categories"],
    ["← →", "Previous / next piece"],
    ["F", "View alone"],
    ["Space", "Play / pause video"],
    ["Esc", "Back"],
  ];
  return (
    <div className={st.help} role="dialog" aria-label="Keyboard shortcuts" onClick={onClose}>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className={st.fig}>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Contact. Desktop: the bar says "Email" until you reach for it — on hover or
// focus the word becomes the address and Copy slides out beside it. Phones and
// other touch screens (no hover) always show the address. The link's accessible
// name is always the address.
function Reach({ email, emailHref, xHref, full }: { email: string; emailHref: string; xHref: string; full?: boolean }) {
  const [copied, setCopied] = useState<false | "ok" | "select">(false);
  const timer = useRef(0);
  const mailRef = useRef<HTMLAnchorElement>(null);
  // The two widths the link animates between, measured once the font is in.
  useEffect(() => {
    const a = mailRef.current;
    if (!a) return;
    const measure = () => {
      const [label, addr] = Array.from(a.children) as HTMLElement[];
      a.style.setProperty("--wl", `${label.scrollWidth}px`);
      a.style.setProperty("--wa", `${addr.scrollWidth}px`);
    };
    measure();
    void document.fonts?.ready.then(measure);
  }, [email]);
  return (
    <div className={`${st.reach} ${full ? st.reachFull : ""} ${copied ? st.reachOpen : ""} ${copied === "ok" ? st.justCopied : ""}`}>
      <span className={st.mailGroup}>
        <a ref={mailRef} className={st.mail} href={emailHref} aria-label={email}>
          <span className={st.mailLabel} aria-hidden="true">
            Email
          </span>
          <span className={st.mailAddr}>{email}</span>
        </a>
        <button
          type="button"
          className={st.copyBtn}
          onClick={async () => {
            // The clipboard API needs a secure context and permission; fall
            // back to a hidden textarea, and if even that fails, select the
            // address so ⌘C/Ctrl+C works.
            let ok = false;
            try {
              await navigator.clipboard.writeText(email);
              ok = true;
            } catch {
              const ta = document.createElement("textarea");
              ta.value = email;
              ta.setAttribute("readonly", "");
              ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
              document.body.appendChild(ta);
              ta.select();
              try {
                ok = document.execCommand("copy");
              } catch {
                ok = false;
              }
              ta.remove();
            }
            if (!ok && mailRef.current) {
              const r = document.createRange();
              r.selectNodeContents(mailRef.current.lastElementChild ?? mailRef.current);
              const sel = window.getSelection();
              sel?.removeAllRanges();
              sel?.addRange(r);
            }
            setCopied(ok ? "ok" : "select");
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), 1800);
          }}
          aria-live="polite"
        >
          {copied === "ok" ? "Copied" : copied === "select" ? "Press ⌘C" : "Copy"}
        </button>
      </span>
      <a href={xHref} target="_blank" rel="noopener noreferrer" aria-label="Multiscatter on X (opens in a new tab)">
        X ↗
      </a>
    </div>
  );
}

// ─── Index: the catalogue, one piece lit at a time ───────────────────────────
// The titles are the catalogue; the piece you point at is shown large in its
// own light, exactly where its page will put it — so opening it keeps the work
// still and only the words change.

/** Keeps the last two values so the newest can fade in over the one before. */
function useLayers<T>(value: T, key: string) {
  const [layers, setLayers] = useState([{ id: 0, key, value }]);
  if (layers[layers.length - 1].key !== key) {
    setLayers((l) => [...l.slice(-1), { id: l[l.length - 1].id + 1, key, value }]);
  }
  return layers;
}

/** The room: a deep wall with shaped light (a pool behind the work, light
 *  rising from below, or a raking sweep). Cross-fades whenever the piece
 *  changes; where the light falls is set by the layout (CSS --px/--py). */
function FieldLayers({ room }: { room: Room }) {
  const layers = useLayers(room, `${room.shadow}${room.light}${room.shape ?? ""}`);
  return (
    <>
      {layers.map((l) => (
        <div
          key={l.id}
          className={st.fieldLayer}
          data-shape={l.value.shape ?? "pool"}
          style={{ "--rs": l.value.shadow, "--rl": l.value.light } as CSSProperties}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

const subNone = () => () => {};
function Index({ pieces, seq, intro, hot, setHot, engaged, onOpen }: { pieces: LitPiece[]; seq: Seq; intro?: string; hot: LitPiece; setHot: (s: string) => void; engaged: boolean; onOpen: (p: LitPiece, el: HTMLElement | null) => void }) {
  const layers = useLayers(hot, hot.slug);
  // The "how to open" hint shows until the visitor has opened something once.
  const opened = useSyncExternalStore(subNone, () => {
    try {
      return localStorage.getItem("lit-opened") === "1";
    } catch {
      return true;
    }
  }, () => false);
  const open = (p: LitPiece, el: HTMLElement | null) => {
    try {
      localStorage.setItem("lit-opened", "1");
    } catch {}
    onOpen(p, el);
  };
  return (
    <>
      <h1 className={st.sr}>Multiscatter — selected work{seq !== "all" ? `: ${CAT_LABEL[seq]}` : ""}</h1>
      <PhoneIndex pieces={pieces} seq={seq} intro={intro} onOpen={open} />
      <DeskIndex pieces={pieces} seq={seq} intro={intro} hot={hot} setHot={setHot} engaged={engaged} onOpen={open} layers={layers} hint={!opened} />
    </>
  );
}

function PhoneIndex({ pieces, seq, intro, onOpen }: { pieces: LitPiece[]; seq: Seq; intro?: string; onOpen: (p: LitPiece, el: HTMLElement | null) => void }) {
    return (
      // onTouchStart (empty) lets iOS Safari apply :active, so taps show a pressed state.
      <section className={st.plist} aria-label="All work" onTouchStart={() => {}}>
        {intro ? <p className={st.intro}>{intro}</p> : null}
        {pieces.filter((p) => seq === "all" || p.cat === seq).map((p) => (
          <button key={p.slug} type="button" className={st.pcard} onClick={(e) => onOpen(p, e.currentTarget.querySelector<HTMLElement>("[data-ptile]"))}>
            <span className={st.pcardImg} data-ptile={p.slug} style={{ "--ar": p.tile.ar } as CSSProperties}>
              {/* Desktop never downloads the phone list's pictures. */}
              <picture>
                <source media="(min-width: 761px)" srcSet={BLANK} />
                <img src={enc(p.tile.src)} alt="" loading="lazy" decoding="async" />
              </picture>
            </span>
            <span className={st.pcardCap}>
              <span className={st.pcardTitle}>{p.title}</span>
              <span className={st.pcardKind}>
                <span className={st.fig}>{pad(p.no)}</span>
                {CAT_LABEL[p.cat]}
              </span>
            </span>
          </button>
        ))}
      </section>
    );
}

type Layer<T> = { id: number; key: string; value: T };
function DeskIndex({ pieces, seq, intro, hot, setHot, engaged, onOpen, layers, hint }: { pieces: LitPiece[]; seq: Seq; intro?: string; hot: LitPiece; setHot: (s: string) => void; engaged: boolean; onOpen: (p: LitPiece, el: HTMLElement | null) => void; layers: Layer<LitPiece>[]; hint: boolean }) {
  // Hover intent: sweeping the pointer down the list doesn't flash every piece
  // — a title lights its piece once the pointer rests on it (~70 ms).
  const intentT = useRef(0);
  const intent = useMemo(
    () => ({
      enter: (slug: string) => {
        window.clearTimeout(intentT.current);
        intentT.current = window.setTimeout(() => setHot(slug), 70);
      },
      leave: () => window.clearTimeout(intentT.current),
    }),
    [setHot],
  );
  useEffect(() => () => window.clearTimeout(intentT.current), []);
  return (
    <section className={st.index} aria-label="All work">
      {layers.map((l, k) => (
        <IndexLayer key={l.id} piece={l.value} current={k === layers.length - 1} engaged={engaged} first={l.id === 0} onOpen={onOpen} />
      ))}
      <div className={st.indexCol}>
        {intro ? <p className={st.intro}>{intro}</p> : null}
        <div>
          <ol className={st.list}>
            {pieces.map((p) => {
              const outOf = seq !== "all" && p.cat !== seq;
              return (
              <li key={p.slug}>
                <button
                  type="button"
                  className={`${st.item} ${outOf ? st.itemOut : ""}`}
                  disabled={outOf}
                  aria-current={p === hot ? "true" : undefined}
                  onPointerEnter={() => intent.enter(p.slug)}
                  onPointerLeave={intent.leave}
                  onFocus={() => setHot(p.slug)}
                  onClick={() => onOpen(p, document.querySelector<HTMLElement>(`[data-tile="${p.slug}"]`))}
                >
                  <span className={st.fig}>{pad(p.no)}</span>
                  <span className={st.itemTitle}>{p.title}</span>
                </button>
              </li>
              );
            })}
          </ol>
          <div className={st.readout} aria-live="polite">
            <p>
              {CAT_LABEL[hot.cat]} · {hot.discipline}
            </p>
            <p className={st.fig}>
              {hot.media.kind === "model" && hot.media.assets.length > 1
                ? `${hot.media.assets.length} models · PBR texture sets · ${formatOf(hot.media.assets[0].specimen.modelPath)}`
                : dimensions(hot.media, hot.cover ?? 0)}
            </p>
            {hint ? <p className={st.openHint}>Click or press Enter to open · ? for keys</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/** One lit piece on the index: 3D as its set photograph (full bleed, framed
 *  as on its page); stills and video in the work area. */
function IndexLayer({ piece, current, engaged, first, onOpen }: { piece: LitPiece; current: boolean; engaged: boolean; first: boolean; onOpen: (p: LitPiece, el: HTMLElement | null) => void }) {
  const m = piece.media;
  const cls = `${st.ixLayer} ${current ? st.ixIn : st.ixOut}`;
  // The lit picture opens its piece too (it's where the eye — and the mouse — is).
  // Mouse convenience only: the title button is the accessible control.
  const click = current
    ? (e: React.MouseEvent<HTMLElement>) => onOpen(piece, e.currentTarget.querySelector<HTMLElement>("[data-tile]") ?? e.currentTarget)
    : undefined;
  if (m.kind === "model") {
    const still = m.assets[piece.cover ?? 0].specimen.setStill;
    return (
      <div className={`${cls} ${st.ixSet}`} style={{ "--shift": 0.16 } as CSSProperties} aria-hidden={!current}>
        {still ? (
          <picture>
            <source media="(max-width: 760px)" srcSet={BLANK} />
            <img className={st.setStill} src={enc(still.src)} alt={current ? piece.title : ""} fetchPriority={first ? "high" : undefined} />
          </picture>
        ) : null}
        <span className={`${st.setBox} ${current ? st.openable : ""}`} data-tile={current ? piece.slug : undefined} data-click="" onClick={click} />
      </div>
    );
  }
  const ar = m.w / m.h;
  return (
    <div className={`${cls} ${st.ixWork}`} aria-hidden={!current}>
      <span className={st.fitBox} style={{ "--ar": ar, "--e1": piece.field[0], "--e2": piece.field[1] } as CSSProperties}>
        <span className={`${st.fit} ${current ? st.openable : ""}`} data-tile={current ? piece.slug : undefined} data-click="" onClick={click}>
          {m.kind === "video" ? (
            <IndexVideo m={m} play={engaged && current} priority={first} />
          ) : (
            <Still m={m} title={piece.title} fullAfter={500} srcset={piece.srcset} sizes="60vw" priority={first} hideOnPhone />
          )}
        </span>
      </span>
    </div>
  );
}

// Video on the index: the poster first; if you stay, the loop starts.
function IndexVideo({ m, play: allowed, priority }: { m: VideoMedia; play: boolean; priority?: boolean }) {
  const { effectiveMode } = useDisplayMode();
  const [play, setPlay] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  // No longer the lit piece: stop decoding (the layer is fading out / hidden).
  useEffect(() => {
    if (!allowed) ref.current?.pause();
    else if (ref.current?.paused) void ref.current.play().catch(() => {});
  }, [allowed]);
  useEffect(() => {
    // Reduced / Save-Data: poster only. Otherwise the loop starts only once
    // the visitor has moved through the index and rested on this piece — the
    // landing page never pulls a video on its own.
    if (effectiveMode !== "enhanced" || !allowed) return;
    const t = window.setTimeout(() => setPlay(true), 450);
    return () => window.clearTimeout(t);
  }, [effectiveMode, allowed]);
  return (
    <>
      <picture>
        <source media="(max-width: 760px)" srcSet={BLANK} />
        <img className={st.layerImg} src={enc(m.poster)} alt="" fetchPriority={priority ? "high" : undefined} />
      </picture>
      {play ? (
        <video
          ref={ref}
          className={st.layerImg}
          src={enc(m.src)}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          onTimeUpdate={(e) => playheads.set(m.src, e.currentTarget.currentTime)}
        />
      ) : null}
    </>
  );
}

// ─── Piece: one work, the whole screen, its own light ────────────────────────
function Frame({
  piece,
  list,
  seq,
  asset,
  vp,
  alone,
  go,
  swap,
  morph,
  step,
  toggleAlone,
}: {
  piece: LitPiece;
  list: LitPiece[];
  seq: Seq;
  asset: number;
  vp: { w: number; h: number; phone: boolean };
  alone: boolean;
  go: Go;
  swap: Go;
  morph: Morph;
  step: (d: 1 | -1) => void;
  toggleAlone: (v?: boolean) => void;
}) {
  const m = piece.media;
  const ar = m.kind === "model" ? 4 / 3 : m.w / m.h;
  // Wide pieces get the picture-over-label layout only when it gives them a
  // big enough picture with room for the label beneath; otherwise (short or
  // narrow windows) they sit beside the label like everything else.
  const mpx0 = Math.max(20, Math.min(56, vp.w * 0.034));
  const wideW = m.kind !== "model" ? Math.min(vp.w - 2 * mpx0, (vp.h - 96 - 76 - 200) * ar) : 0;
  const wide = m.kind !== "model" && ar > 1.3 && !vp.phone && wideW >= 880;
  const i = list.indexOf(piece);
  // Wide pieces: the column is exactly as wide as the fitted image, so the
  // label band below lines up with the picture's own left edge.
  const colW = wide ? Math.round(wideW) : 0;
  const prev = list[(i - 1 + list.length) % list.length];
  const next = list[(i + 1) % list.length];
  const asst = m.kind === "model" ? m.assets[asset] : null;

  // Phone: swipe sideways between pieces (not on the 3D set or the scrubber).
  // The piece follows the finger a little (rubber-band) before it commits.
  const sw = useRef<{ x: number; y: number; dir?: "x" | "y" } | null>(null);
  const secRef = useRef<HTMLElement>(null);
  const setDrag = (px: number, settle = false) => {
    const el = secRef.current;
    if (!el) return;
    el.style.transition = settle ? "transform 260ms cubic-bezier(0.2, 0.7, 0.2, 1)" : "none";
    el.style.transform = px ? `translate3d(${px}px, 0, 0)` : "";
  };
  const down = (e: RPointerEvent) => {
    if (e.pointerType !== "touch" || (e.target as Element).closest("[data-noswipe]")) return;
    sw.current = { x: e.clientX, y: e.clientY };
  };
  const move = (e: RPointerEvent) => {
    const s = sw.current;
    if (!s || list.length < 2) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.dir && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) s.dir = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (s.dir === "x") setDrag(Math.sign(dx) * Math.min(48, Math.abs(dx) * 0.28));
  };
  const up = (e: RPointerEvent) => {
    const s = sw.current;
    sw.current = null;
    setDrag(0, true);
    if (!s || list.length < 2 || s.dir !== "x") return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 60) step(dx < 0 ? 1 : -1);
  };

  return (
    <section
      ref={secRef}
      className={`${st.frame} ${wide ? st.wide : st.side} ${m.kind === "model" ? st.is3d : ""} ${alone ? st.alone : ""}`}
      style={wide ? ({ "--colw": `${colW}px` } as CSSProperties) : undefined}
      aria-label={piece.title}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        sw.current = null;
        setDrag(0, true);
      }}
    >
      {/* Phones: a way back without scrolling to the foot of the page. */}
      <button type="button" className={st.ptop} onClick={() => morph({ view: "sheet" })}>
        <span aria-hidden="true">←</span> All work
      </button>
      {alone ? (
        <p className={st.aloneCap} aria-hidden="true">
          <span>{piece.title}</span>
          <span className={st.fig}>
            {pad(i + 1)} / {pad(list.length)}
          </span>
          <span className={st.fig}>← → · Esc</span>
        </p>
      ) : null}
      {m.kind === "model" ? null : (
        <div className={st.work}>
          <span className={st.fitBox} style={{ "--ar": ar, "--e1": piece.field[0], "--e2": piece.field[1] } as CSSProperties}>
            <button
              type="button"
              className={st.fit}
              style={{ viewTransitionName: VT_NAME }}
              onClick={() => toggleAlone()}
              aria-label={alone ? "Back to the label" : `View ${piece.title} alone`}
            >
              {m.kind === "video" ? (
                <WorkVideo m={m} />
              ) : (
                <Still m={m} title={piece.title} srcset={piece.srcset} sizes={wide ? "90vw" : "(max-width: 760px) 100vw, 65vw"} />
              )}
            </button>
          </span>

        </div>
      )}

      <div className={st.copy}>
        <div className={st.copyHead}>
          <p className={st.idx}>
            <span className={st.fig}>{pad(piece.no)}</span>
            {CAT_LABEL[piece.cat]}
          </p>
          <h1 className={st.title}>{piece.title}</h1>
          <p className={st.what}>
            {piece.year} · {piece.discipline}
          </p>
        </div>
        <div className={st.copyBody}>
          <p className={st.sum}>{asst?.summary ?? piece.summary}</p>
          <dl className={st.label}>
            {piece.role.length ? (
              <>
                <dt>Role</dt>
                <dd>{piece.role.join(", ")}</dd>
              </>
            ) : null}
            {piece.tools.length ? (
              <>
                <dt>Made with</dt>
                <dd>{piece.tools.join(", ")}</dd>
              </>
            ) : null}
            <dt>Dimensions</dt>
            <dd className={st.fig}>{dimensions(m, asset)}</dd>
          </dl>

          {m.kind === "model" && m.assets.length > 1 ? (
            <ol className={st.assets}>
              {m.assets.map((a, k) => (
                <li key={a.id}>
                  {/* Hover shows the model's size and starts fetching it, so the switch is quick. */}
                  <button
                    type="button"
                    aria-current={k === asset ? "true" : undefined}
                    onClick={() => swap({ asset: k })}
                    onPointerEnter={() => prefetchAsset(a.specimen)}
                    onFocus={() => prefetchAsset(a.specimen)}
                  >
                    <span className={st.fig}>{pad(k + 1)}</span>
                    {a.title}
                    {a.specimen.facts ? <span className={`${st.fig} ${st.assetMeta}`}>{fmt(a.specimen.facts.triangles)} tris</span> : null}
                  </button>
                </li>
              ))}
            </ol>
          ) : null}

          {m.kind === "video" ? <VideoControls media={m} onAlone={() => toggleAlone()} /> : null}
          {m.kind === "image" ? (
            <p className={st.row}>
              <button type="button" className={st.ctl} onClick={() => toggleAlone()}>
                View alone
              </button>
              <a className={st.ctl} href={enc(m.src)} target="_blank" rel="noopener noreferrer">
                Full size ↗
              </a>
            </p>
          ) : null}
          {m.kind === "model" && asst ? <SetView asset={asst} rigged={m.rigged} phone={vp.phone} alone={alone} onAlone={() => toggleAlone()} /> : null}
        </div>
      </div>

      <footer className={st.foot}>
        <button type="button" className={st.back} onClick={() => morph({ view: "sheet" })}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <rect x="0.5" y="0.5" width="4.5" height="4.5" />
            <rect x="7" y="0.5" width="4.5" height="4.5" />
            <rect x="0.5" y="7" width="4.5" height="4.5" />
            <rect x="7" y="7" width="4.5" height="4.5" />
          </svg>
          All work
        </button>
        <span className={st.pos}>
          <span className={st.fig}>
            {pad(i + 1)} / {pad(list.length)}
          </span>
          {seq !== "all" ? CAT_LABEL[seq] : null}
        </span>
        {list.length > 1 ? (
          <div className={st.steps}>
            {/* With two pieces, previous and next are the same piece — one link. */}
            {list.length > 2 ? (
              <button type="button" className={st.stepBtn} onClick={() => step(-1)} aria-label={`Previous: ${prev.title}`}>
                <span aria-hidden="true">←</span> <span className={st.stepName}>{prev.title}</span>
              </button>
            ) : null}
            <span className={st.ticks}>
              {list.map((p) => (
                <button key={p.slug} type="button" aria-label={p.title} aria-current={p === piece ? "true" : undefined} onClick={() => go({ slug: p.slug, asset: 0 })}>
                  <span className={st.peek} aria-hidden="true">
                    <img src={enc(p.tile.src)} alt="" loading="lazy" style={{ aspectRatio: p.tile.ar }} />
                    <span>{p.title}</span>
                  </span>
                </button>
              ))}
            </span>
            <button type="button" className={st.stepBtn} onClick={() => step(1)} aria-label={`Next: ${next.title}`}>
              <span className={st.stepName}>{next.title}</span> <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : null}
      </footer>
    </section>
  );
}

// A still arrives instantly as its contact-sheet thumbnail and sharpens as the
// full-resolution file lands — never a blank field.
function Still({ m, title, fullAfter = 0, srcset, sizes, priority, hideOnPhone }: { m: ImageMedia; title: string; fullAfter?: number; srcset?: string; sizes?: string; priority?: boolean; hideOnPhone?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  // On the index, scanning past a still loads only its thumbnail; the
  // full-resolution file comes once the visitor rests on it.
  const [want, setWant] = useState(fullAfter === 0);
  useEffect(() => {
    if (want) return;
    const t = window.setTimeout(() => setWant(true), fullAfter);
    return () => window.clearTimeout(t);
  }, [want, fullAfter]);
  return (
    <>
      <picture>
        {hideOnPhone ? <source media="(max-width: 760px)" srcSet={BLANK} /> : null}
        <img className={st.layerImg} src={enc(m.thumb)} alt={want ? "" : title} aria-hidden={want ? true : undefined} fetchPriority={priority ? "high" : undefined} />
      </picture>
      {want ? (
        // Phones and smaller windows take a smaller rendition (srcset); the
        // 3840 px original only goes to screens that can show it.
        <img
          className={`${st.layerImg} ${st.full} ${loaded ? st.on : ""}`}
          src={enc(m.src)}
          srcSet={srcset ? `${srcset}, ${enc(m.src)} ${m.w}w` : undefined}
          sizes={srcset ? sizes ?? "(max-width: 760px) 100vw, 70vw" : undefined}
          alt={title}
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
      ) : null}
    </>
  );
}

// The piece's video. Picks up where the index loop was (no restart), and if
// the file can't load, keeps the poster and says so.
function WorkVideo({ m }: { m: VideoMedia }) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      <video
        src={enc(m.src)}
        poster={enc(m.poster)}
        muted
        loop
        playsInline
        autoPlay
        preload="auto"
        data-work=""
        onLoadedMetadata={(e) => {
          const t = playheads.get(m.src);
          if (t) {
            e.currentTarget.currentTime = t;
            playheads.delete(m.src);
          }
        }}
        onError={() => setFailed(true)}
      />
      {failed ? <span className={st.mediaNote}>The video couldn’t load — showing its poster.</span> : null}
    </>
  );
}

// Video: one play/pause glyph, a timeline with a tick per second, timecode in
// figures, sound only when the file has a sound track. Driven from the element
// each frame through refs (no React state per frame).
function VideoControls({ media, onAlone }: { media: VideoMedia; onAlone: () => void }) {
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const fill = useRef<HTMLSpanElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLSpanElement>(null);
  const video = () => document.querySelector<HTMLVideoElement>("video[data-work]");
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = video();
      if (v && fill.current && time.current) {
        const d = v.duration || media.dur;
        const t = v.currentTime || 0;
        fill.current.style.transform = `scaleX(${Math.min(1, t / d)})`;
        time.current.textContent = `${clock(t)} / ${clock(d)}`;
        // keep the slider's value current for assistive tech (cheap: only on change)
        const now = String(Math.round(t * 10) / 10);
        if (track.current && track.current.getAttribute("aria-valuenow") !== now) {
          track.current.setAttribute("aria-valuenow", now);
          track.current.setAttribute("aria-valuetext", `${clock(t, false)} of ${clock(d, false)}`);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [media.dur]);
  const scrub = (clientX: number) => {
    const v = video(), el = track.current;
    if (!v || !el) return;
    const r = el.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (v.duration || media.dur);
    boil(260, true); // scrubbing stirs the stock, like film running through a gate
  };
  return (
    <div className={st.transport}>
      <div className={st.tline}>
        <button
          type="button"
          data-play=""
          className={st.glyph}
          aria-label={paused ? "Play" : "Pause"}
          onClick={() => {
            const v = video();
            if (!v) return;
            if (v.paused) void v.play();
            else v.pause();
            setPaused(v.paused);
          }}
        >
          {paused ? (
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 1.5v9l7.5-4.5z" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <rect x="2.5" y="1.5" width="2.4" height="9" />
              <rect x="7.1" y="1.5" width="2.4" height="9" />
            </svg>
          )}
        </button>
        <span
          ref={track}
          data-noswipe=""
          className={st.track}
          style={{ "--ticks": media.dur } as CSSProperties}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            scrub(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons) scrub(e.clientX);
          }}
          onKeyDown={(e) => {
            // ←/→ one second (Shift: five), Home/End to the ends. The page's
            // own arrow keys (next/previous piece) don't fire from here.
            const v = video();
            if (!v) return;
            const d = v.duration || media.dur;
            const step = e.shiftKey ? 5 : 1;
            let t: number | null = null;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") t = v.currentTime + step;
            else if (e.key === "ArrowLeft" || e.key === "ArrowDown") t = v.currentTime - step;
            else if (e.key === "Home") t = 0;
            else if (e.key === "End") t = d - 0.05;
            if (t === null) return;
            e.preventDefault();
            e.stopPropagation();
            v.currentTime = Math.max(0, Math.min(d - 0.05, t));
            boil(220, true);
          }}
          role="slider"
          aria-label="Position in the video"
          aria-valuemin={0}
          aria-valuemax={media.dur}
          aria-valuenow={0}
          aria-valuetext={`0:00 of ${clock(media.dur, false)}`}
          tabIndex={0}
        >
          <span ref={fill} className={st.fill} />
        </span>
        <span ref={time} className={`${st.fig} ${st.time}`}>
          0:00.0 / {clock(media.dur)}
        </span>
      </div>
      <p className={st.row}>
        {media.audio ? (
          <button
            type="button"
            className={`${st.ctl} ${st.sound}`}
            aria-pressed={!muted}
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            onClick={() => {
              const v = video();
              if (!v) return;
              v.muted = !v.muted;
              setMuted(v.muted);
            }}
          >
            <svg viewBox="0 0 14 12" aria-hidden="true">
              <path d="M1 4h2.6L7 1v10L3.6 8H1z" />
              {muted ? (
                <path d="M9.5 4l3 4M12.5 4l-3 4" fill="none" stroke="currentColor" strokeWidth="1.1" />
              ) : (
                <path d="M9.4 3.6a3.4 3.4 0 0 1 0 4.8M11 2.2a5.4 5.4 0 0 1 0 7.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
              )}
            </svg>
            Sound
          </button>
        ) : null}
        <button type="button" className={st.ctl} onClick={onAlone}>
          View alone
        </button>
      </p>
    </div>
  );
}

// 3D: the owner's model on its lit cyclorama, full bleed behind the type. A
// photograph of the same set (same camera) covers the load, then hands over.
const TEX_LABEL: Partial<Record<TexKey, string>> = { map: "Albedo", normalMap: "Normal", roughnessMap: "Rough", metalnessMap: "Metal", transmissionMap: "Transmit" };
class SceneBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function SetView({ asset, rigged, phone, alone, onAlone }: { asset: LitAsset; rigged: boolean; phone: boolean; alone: boolean; onAlone: () => void }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const { effectiveMode } = useDisplayMode();
  const touch = useMedia("(hover: none), (pointer: coarse)");
  // ?still=1 — set-photography mode (front view held, no framing shift).
  const stillMode = useFlag("still") !== null;
  const client = useIsClient();
  const sp = asset.specimen;
  const [ready, setReady] = useState(false);
  const [clipIndex, setClipIndex] = useState(0);
  const [poseable, setPoseable] = useState(false);
  const [poseMode, setPoseMode] = useState(false);
  const [hand, setHand] = useState<HandPose>("rest");
  const [channel, setChannel] = useState<SpecimenChannel>("material");
  const [detected, setDetected] = useState<TexKey[]>([]);
  const az = useRef<HTMLSpanElement>(null);
  // A new asset streams into the same set: reset its controls (render-time
  // adjustment, per react.dev — no effect cascade).
  const [prevPath, setPrevPath] = useState(sp.modelPath);
  if (prevPath !== sp.modelPath) {
    setPrevPath(sp.modelPath);
    setReady(false);
    setChannel("material");
    setPoseMode(false);
    setDetected([]);
    setClipIndex(0);
  }
  const onReady = useCallback(() => {
    setReady(true);
    if (stillMode) (window as unknown as { __litReady?: string }).__litReady = sp.modelPath;
  }, [stillMode, sp.modelPath]);
  const onClips = useCallback((names: string[]) => {
    const k = names.indexOf("Idle");
    if (k > 0) setClipIndex(k);
  }, []);
  const onAz = useCallback((d: number) => {
    if (az.current) az.current.textContent = `${d}°`;
  }, []);
  const onStats = useCallback(
    (s: { triangles: number; maps: number }) => {
      if (stillMode) (window as unknown as { __litStats?: unknown }).__litStats = { path: sp.modelPath, triangles: s.triangles, maps: s.maps };
    },
    [stillMode, sp.modelPath],
  );
  const texIds: TexKey[] = rigged ? detected : (Object.keys(TEX_LABEL) as TexKey[]).filter((k) => sp.textures[k as keyof Specimen["textures"]]);
  const channels: { id: SpecimenChannel; label: string }[] = [
    { id: "material", label: "Shaded" },
    ...texIds.map((k) => ({ id: k as SpecimenChannel, label: TEX_LABEL[k] ?? k })),
    { id: "wireframe", label: "Wire" },
  ];
  // Live 3D only once hydrated: the server can't know the device, so its HTML
  // (and the first client render) show the set photograph.
  const failed = failedPath === sp.modelPath;
  const live = client && effectiveMode === "enhanced" && !failed;
  // Alone: the subject centres as the label steps away (the scene eases there).
  const shift = stillMode || phone || alone ? 0 : 0.16;
  const still = sp.setStill;
  const setProp = useMemo(
    () => ({
      color: sp.stage?.color ?? "#3a3633",
      viewShift: shift,
      lit: !!still && !stillMode,
      azimuth: sp.stage?.azimuth,
      // The page's grain continues onto the set's backdrop (never the model).
      grain: { src: "/images/grain.png" },
    }),
    [sp.stage?.color, sp.stage?.azimuth, shift, still, stillMode],
  );

  return (
    <>
      <div className={st.set} data-lenis-prevent="" data-noswipe="" style={{ "--shift": shift } as CSSProperties}>
        {live ? (
          <div className={st.setCanvas}>
            <SceneBoundary key={sp.modelPath} onFail={() => setFailedPath(sp.modelPath)}>
            <SpecimenScene
              specimen={sp}
              set={setProp}
              turntable={!stillMode}
              channel={channel}
              clipIndex={clipIndex}
              poseMode={poseMode}
              handPose={hand}
              allowZoom
              onReady={onReady}
              onStats={onStats}
              onClips={onClips}
              onPoseable={setPoseable}
              onChannelsDetected={setDetected}
              onAzimuth={onAz}
            />
            </SceneBoundary>
          </div>
        ) : null}
        {still && !stillMode ? (
          <img key={still.src} className={`${st.setStill} ${live && ready ? st.gone : ""}`} src={enc(still.src)} alt={live ? "" : asset.title} />
        ) : null}
        {failed ? <span className={st.mediaNote}>The live model couldn’t load — showing a photograph of it.</span> : null}
        {!live && !still ? <img className={st.setFallback} src={enc(sp.poster)} alt={asset.title} /> : null}
        {/* The 4:3 region over the subject — where a contact-sheet tile lands. */}
        <span className={st.setBox} style={{ viewTransitionName: VT_NAME } as CSSProperties} aria-hidden="true" />
      </div>
      {live ? (
        // Always laid out (hidden until the model is in) so the type above
        // never jumps when an asset swaps.
        <div className={`${st.inspect} ${ready ? "" : st.pending}`} aria-hidden={ready ? undefined : true}>
          <p className={st.row}>
            {channels.map((c) => (
              <button key={c.id} type="button" className={st.ctl} aria-pressed={channel === c.id} onClick={() => setChannel(c.id)}>
                {c.label}
              </button>
            ))}
            <button type="button" className={st.ctl} onClick={onAlone}>
              View alone
            </button>
          </p>
          {rigged ? (
            <p className={st.row}>
              <button type="button" className={st.ctl} aria-pressed={!poseMode} onClick={() => setPoseMode(false)}>
                Animate
              </button>
              <button type="button" className={st.ctl} aria-pressed={poseMode} disabled={!poseable} onClick={() => setPoseMode(true)}>
                Pose
              </button>
              {poseMode
                ? (["open", "rest", "fist"] as HandPose[]).map((h) => (
                    <button key={h} type="button" className={st.ctl} aria-pressed={hand === h} onClick={() => setHand(h)}>
                      {h[0].toUpperCase() + h.slice(1)} hand
                    </button>
                  ))
                : null}
            </p>
          ) : null}
          <p className={st.hint}>
            <span className={st.fig}>
              Az <span ref={az}>0°</span>
            </span>
            {poseMode ? "Drag the handles to pose the rig" : touch ? "Drag to turn · pinch to zoom" : "Drag to turn · scroll to zoom · double-click resets"}
          </p>
        </div>
      ) : null}
    </>
  );
}
