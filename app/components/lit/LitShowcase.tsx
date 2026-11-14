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
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, PointerEvent as RPointerEvent } from "react";
import type { Specimen, WorkCategory } from "../../lib/content";
import type { HandPose, SpecimenChannel, TexKey } from "../site/SpecimenScene";
import { useDisplayMode } from "../site/DisplayModeProvider";
import st from "./lit.module.css";

const SpecimenScene = dynamic(() => import("../site/SpecimenScene"), { ssr: false });

export type LitAsset = { id: string; title: string; summary?: string; specimen: Specimen };
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
  /** 3D only: the asset that stands for the piece in the index. */
  cover?: number;
};

type Seq = "all" | WorkCategory;
type View = "sheet" | "frame";
type Nav = { view: View; seq: Seq; slug: string; asset: number };
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

/** The light a piece sits in: its own edge colour, or its set for 3D. */
function fieldOf(p: LitPiece, asset?: number): [string, string] {
  if (p.media.kind !== "model") return p.field;
  const a = p.media.assets[asset ?? p.cover ?? 0];
  return a?.specimen.stage?.field ?? p.field;
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
type VTDoc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

// View-transition pseudo-elements are global by nature (a CSS module can't hold them).
const vtCss = (slow: number) => `
::view-transition-group(${VT_NAME}){animation-duration:${420 * slow}ms;animation-timing-function:cubic-bezier(.2,.7,.2,1)}
::view-transition-old(${VT_NAME}),::view-transition-new(${VT_NAME}){width:100%;height:100%;object-fit:cover}
::view-transition-old(root),::view-transition-new(root){animation-duration:${240 * slow}ms}
`;

export type LitStart = { view: View; slug?: string; seq?: Seq };
type LitProps = { pieces: LitPiece[]; email: string; emailHref: string; xHref: string; start?: LitStart };

export default function LitShowcase(props: LitProps) {
  const client = useIsClient();
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
      {client ? <Lit {...props} /> : <div className={st.blank} />}
    </>
  );
}

/** Where to start: the address bar's query (shared links, reloads, back/
 *  forward) wins; otherwise the route's own start (e.g. /work/[slug]). */
function readNav(pieces: LitPiece[], start?: LitStart): Nav {
  const q = new URLSearchParams(window.location.search);
  const has = (s: string | null | undefined) => !!s && pieces.some((p) => p.slug === s);
  const fromQuery = q.get("v") === "frame" || q.get("v") === "sheet";
  const view: View = fromQuery ? (q.get("v") as View) : start?.view ?? "sheet";
  const seq = CATS.map((c) => c.id).find((c) => c === (fromQuery ? q.get("c") : start?.seq)) ?? "all";
  const slug = fromQuery && has(q.get("p")) ? (q.get("p") as string) : has(start?.slug) ? (start?.slug as string) : pieces[0].slug;
  const piece = pieces.find((p) => p.slug === slug);
  const a = Number(q.get("a"));
  const asset = fromQuery && a ? a : piece?.cover ?? 0;
  return { view, seq, slug, asset };
}

function Lit({ pieces, email, emailHref, xHref, start }: LitProps) {
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const vp = useViewport();
  // ?slow=N — review only: every transition runs N× slower so it can be inspected.
  const slow = useMemo(() => Math.max(1, Number(new URLSearchParams(window.location.search).get("slow")) || 1), []);
  const [nav, setNav] = useState<Nav>(() => readNav(pieces, start));
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const [alone, setAlone] = useState(false);
  // The piece lit on the index (pointer, focus or arrow keys).
  const [hot, setHot] = useState(nav.slug);
  const timers = useRef<number[]>([]);
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
        setNav((n) => ({ ...n, ...next }));
        setAlone(false);
        return;
      }
      setPhase("out");
      timers.current.push(
        window.setTimeout(() => {
          setNav((n) => ({ ...n, ...next }));
          setAlone(false);
          setPhase("in");
        }, 120 * slow),
      );
      timers.current.push(window.setTimeout(() => setPhase("idle"), 420 * slow));
    },
    [reduced, slow],
  );
  // Inside one piece (asset switch): no page transition at all.
  const swap = useCallback<Go>((next) => setNav((n) => ({ ...n, ...next })), []);
  // Sheet ↔ piece: the tile and the piece are one element morphing between
  // places (View Transitions); browsers without it get a plain cut.
  const morph = useCallback<Morph>(
    (next, from) => {
      const apply = () => {
        setNav((n) => ({ ...n, ...next }));
        setAlone(false);
        // Coming back lights the piece you were looking at.
        if (next.view === "sheet") setHot(slugRef.current);
      };
      const doc = document as VTDoc;
      if (reduced || !doc.startViewTransition) return apply();
      if (from) from.style.viewTransitionName = VT_NAME;
      const t = doc.startViewTransition(() => {
        flushSync(apply);
        if (next.view === "sheet") {
          const back = document.querySelector<HTMLElement>(`[data-tile="${slugRef.current}"]`);
          if (back) back.style.viewTransitionName = VT_NAME;
        }
      });
      t.finished.finally(() => {
        document.querySelectorAll<HTMLElement>("[data-tile]").forEach((el) => (el.style.viewTransitionName = ""));
      });
    },
    [reduced],
  );
  const toggleAlone = useCallback(
    (v?: boolean) => {
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
  const fromPop = useRef(false);
  useEffect(() => {
    if (lastView.current === null || fromPop.current) {
      lastView.current = nav.view;
      fromPop.current = false;
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
    }
    if (lastView.current !== nav.view) window.history.pushState(null, "", u);
    else window.history.replaceState(null, "", u);
    lastView.current = nav.view;
  }, [nav.view, nav.seq, piece, assetIdx]);
  useEffect(() => {
    const onPop = () => {
      const n = readNav(pieces, start);
      fromPop.current = true;
      setNav(n);
      setAlone(false);
      setHot(n.slug);
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
  const openCat = useCallback(
    (id: Seq) => {
      if (id === "all") return nav.view === "frame" ? morph({ view: "sheet", seq: "all" }) : undefined;
      const first = pieces.find((p) => p.cat === id);
      if (first) go({ view: "frame", seq: id, slug: first.slug, asset: 0 });
    },
    [go, morph, nav.view, pieces],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest("[role='application'], input, textarea")) return; // the 3D viewer owns its arrows
      if (/^[1-5]$/.test(e.key)) openCat(CATS[Number(e.key) - 1].id);
      else if (nav.view === "sheet") {
        const i = Math.max(0, pieces.findIndex((p) => p.slug === hot));
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const d = e.key === "ArrowDown" ? 1 : -1;
          // From the latest value, so quick repeated presses each take a step.
          setHot((h) => {
            const j = Math.max(0, pieces.findIndex((p) => p.slug === h));
            return pieces[(j + d + pieces.length) % pieces.length].slug;
          });
        } else if (e.key === "Enter" && !(t instanceof HTMLButtonElement)) {
          const p = pieces[i];
          morph({ view: "frame", seq: "all", slug: p.slug, asset: p.cover ?? 0 }, document.querySelector<HTMLElement>(`[data-tile="${p.slug}"]`));
        }
      } else if (nav.view === "frame") {
        if (e.key === "ArrowRight") step(1);
        else if (e.key === "ArrowLeft") step(-1);
        else if (e.key === "Escape") {
          if (alone) toggleAlone(false);
          else morph({ view: "sheet", seq: "all" });
        } else if ((e.key === "f" || e.key === "F") && piece.media.kind !== "model") toggleAlone();
        else if (e.key === " " && piece.media.kind === "video") {
          e.preventDefault();
          document.querySelector<HTMLButtonElement>("[data-play]")?.click();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alone, hot, morph, nav.view, openCat, piece.media.kind, pieces, step, toggleAlone]);

  const hotPiece = pieces.find((p) => p.slug === hot) ?? pieces[0];
  const grain = useGrainUrl();
  // Phones list every piece at once with nothing "lit", so the room is neutral.
  const field: [string, string] =
    nav.view === "sheet" ? (vp.phone ? ["#0e0d0c", "#080706"] : fieldOf(hotPiece)) : fieldOf(piece, assetIdx);
  const activeCat: Seq = nav.view === "sheet" ? "all" : nav.seq;

  return (
    <div
      className={`${st.root} ${phase === "out" ? st.out : phase === "in" ? st.in : ""} ${alone ? st.isAlone : ""}`}
      style={{ "--f1": field[0], "--f2": field[1], "--slow": slow, "--grain": grain } as CSSProperties}
    >
      <style>{vtCss(slow)}</style>
      <FieldLayers colors={field} />
      <div className={st.grain} aria-hidden="true" />
      <header className={st.bar}>
        <button type="button" className={st.wm} onClick={() => (nav.view === "frame" ? morph({ view: "sheet", seq: "all" }) : undefined)} aria-label="Multiscatter — all work">
          <span aria-hidden="true">
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
              <button key={c.id} type="button" className={st.cat} aria-current={activeCat === c.id ? "page" : undefined} onClick={() => openCat(c.id)}>
                {c.label}
                <span className={st.count}>{pad(n)}</span>
              </button>
            );
          })}
        </nav>
        <Reach email={email} emailHref={emailHref} xHref={xHref} />
      </header>

      <div className={st.stage}>
        {nav.view === "sheet" ? (
          <Index
            pieces={pieces}
            hot={hotPiece}
            setHot={setHot}
            phone={vp.phone}
            onOpen={(p) => morph({ view: "frame", seq: "all", slug: p.slug, asset: p.cover ?? 0 }, document.querySelector<HTMLElement>(`[data-tile="${p.slug}"]`))}
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
      </div>

      {vp.phone ? (
        <footer className={st.phoneReach}>
          <Reach email={email} emailHref={emailHref} xHref={xHref} />
        </footer>
      ) : null}
    </div>
  );
}

// Contact: the address in full (mailto), plus a copy action — most people
// paste it into their own mail client.
function Reach({ email, emailHref, xHref }: { email: string; emailHref: string; xHref: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  return (
    <div className={st.reach}>
      <a className={st.mail} href={emailHref}>
        {email}
      </a>
      <button
        type="button"
        className={st.copyBtn}
        onClick={() => {
          void navigator.clipboard?.writeText(email).then(() => {
            setCopied(true);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), 1600);
          });
        }}
        aria-live="polite"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <a href={xHref} target="_blank" rel="noopener noreferrer">
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

/** The room's light: the field cross-fades whenever the piece changes. */
function FieldLayers({ colors }: { colors: [string, string] }) {
  const layers = useLayers(colors, colors.join());
  return (
    <>
      {layers.map((l) => (
        // The room is the work's own colour, held below it: a lit work in a dim room.
        <div
          key={l.id}
          className={st.fieldLayer}
          style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${l.value[0]} 62%, #050404), color-mix(in oklab, ${l.value[1]} 62%, #050404))` }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

function Index({ pieces, hot, setHot, phone, onOpen }: { pieces: LitPiece[]; hot: LitPiece; setHot: (s: string) => void; phone: boolean; onOpen: (p: LitPiece) => void }) {
  const layers = useLayers(hot, hot.slug);
  if (phone) {
    return (
      <section className={st.plist} aria-label="All work">
        <p className={st.intro}>3D generalist and technical artist — models, rigged characters, video and still renders.</p>
        {pieces.map((p) => (
          <button key={p.slug} type="button" className={st.pcard} onClick={() => onOpen(p)}>
            <span className={st.pcardImg} data-tile={p.slug} style={{ "--ar": p.tile.ar } as CSSProperties}>
              <img src={enc(p.tile.src)} alt="" loading="lazy" decoding="async" />
            </span>
            <span className={st.pcardCap}>
              <span className={st.fig}>{pad(p.no)}</span>
              <span className={st.pcardTitle}>{p.title}</span>
              <span className={st.pcardKind}>{CAT_LABEL[p.cat]}</span>
            </span>
          </button>
        ))}
      </section>
    );
  }
  return (
    <section className={st.index} aria-label="All work">
      {layers.map((l, k) => (
        <IndexLayer key={l.id} piece={l.value} current={k === layers.length - 1} />
      ))}
      <div className={st.indexCol}>
        <p className={st.intro}>3D generalist and technical artist — models, rigged characters, video and still renders.</p>
        <div>
          <ol className={st.list}>
            {pieces.map((p) => (
              <li key={p.slug}>
                <button
                  type="button"
                  className={st.item}
                  aria-current={p === hot ? "true" : undefined}
                  onPointerEnter={() => setHot(p.slug)}
                  onFocus={() => setHot(p.slug)}
                  onClick={() => onOpen(p)}
                >
                  <span className={st.fig}>{pad(p.no)}</span>
                  <span className={st.itemTitle}>{p.title}</span>
                </button>
              </li>
            ))}
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
          </div>
        </div>
      </div>
    </section>
  );
}

/** One lit piece on the index: 3D as its set photograph (full bleed, framed
 *  as on its page); stills and video in the work area. */
function IndexLayer({ piece, current }: { piece: LitPiece; current: boolean }) {
  const m = piece.media;
  const cls = `${st.ixLayer} ${current ? st.ixIn : st.ixOut}`;
  if (m.kind === "model") {
    const still = m.assets[piece.cover ?? 0].specimen.setStill;
    return (
      <div className={`${cls} ${st.ixSet}`} style={{ "--shift": 0.16 } as CSSProperties} aria-hidden={!current}>
        {still ? <img className={st.setStill} src={enc(still.src)} alt={current ? piece.title : ""} /> : null}
        <span className={st.setBox} data-tile={current ? piece.slug : undefined} />
      </div>
    );
  }
  const ar = m.w / m.h;
  return (
    <div className={`${cls} ${st.ixWork}`} aria-hidden={!current}>
      <span className={st.fitBox} style={{ "--ar": ar, "--e1": piece.field[0], "--e2": piece.field[1] } as CSSProperties}>
        <span className={st.fit} data-tile={current ? piece.slug : undefined}>
          {m.kind === "video" ? <IndexVideo m={m} /> : <Still m={m} title={piece.title} />}
        </span>
      </span>
    </div>
  );
}

// Video on the index: the poster first; if you stay, the loop starts.
function IndexVideo({ m }: { m: VideoMedia }) {
  const { effectiveMode } = useDisplayMode();
  const [play, setPlay] = useState(false);
  useEffect(() => {
    if (effectiveMode !== "enhanced") return; // reduced / Save-Data: poster only
    const t = window.setTimeout(() => setPlay(true), 350);
    return () => window.clearTimeout(t);
  }, [effectiveMode]);
  return (
    <>
      <img className={st.layerImg} src={enc(m.poster)} alt="" />
      {play ? <video className={st.layerImg} src={enc(m.src)} muted loop playsInline autoPlay preload="auto" /> : null}
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
  const wide = m.kind !== "model" && ar > 1.3 && !vp.phone;
  const i = list.indexOf(piece);
  // Wide pieces: the column is exactly as wide as the fitted image, so the
  // label band below lines up with the picture's own left edge.
  const mpx = Math.max(20, Math.min(56, vp.w * 0.034));
  const colW = wide ? Math.round(Math.min(vp.w - 2 * mpx, (vp.h - 96 - 76 - 200) * ar)) : 0;
  const prev = list[(i - 1 + list.length) % list.length];
  const next = list[(i + 1) % list.length];
  const asst = m.kind === "model" ? m.assets[asset] : null;

  // Phone: swipe sideways between pieces (not on the 3D set or the scrubber).
  const sw = useRef<{ x: number; y: number } | null>(null);
  const down = (e: RPointerEvent) => {
    if (e.pointerType !== "touch" || (e.target as Element).closest("[data-noswipe]")) return;
    sw.current = { x: e.clientX, y: e.clientY };
  };
  const up = (e: RPointerEvent) => {
    const s = sw.current;
    sw.current = null;
    if (!s || list.length < 2) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 45) step(dx < 0 ? 1 : -1);
  };

  return (
    <section
      className={`${st.frame} ${wide ? st.wide : st.side} ${m.kind === "model" ? st.is3d : ""} ${alone ? st.alone : ""}`}
      style={wide ? ({ "--colw": `${colW}px` } as CSSProperties) : undefined}
      aria-label={piece.title}
      onPointerDown={down}
      onPointerUp={up}
    >
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
                <video src={enc(m.src)} poster={enc(m.poster)} muted loop playsInline autoPlay preload="auto" data-work />
              ) : (
                <Still m={m} title={piece.title} />
              )}
            </button>
          </span>
          {alone ? <span className={st.aloneHint}>Esc · back</span> : null}
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
                  <button type="button" aria-current={k === asset ? "true" : undefined} onClick={() => swap({ asset: k })}>
                    <span className={st.fig}>{pad(k + 1)}</span>
                    {a.title}
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
          {m.kind === "model" && asst ? <SetView asset={asst} rigged={m.rigged} phone={vp.phone} /> : null}
        </div>
      </div>

      <footer className={st.foot}>
        <button type="button" className={st.back} onClick={() => morph({ view: "sheet", seq: "all" })}>
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
function Still({ m, title }: { m: ImageMedia; title: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <img className={st.layerImg} src={enc(m.thumb)} alt="" aria-hidden="true" />
      <img className={`${st.layerImg} ${st.full} ${loaded ? st.on : ""}`} src={enc(m.src)} alt={title} decoding="async" onLoad={() => setLoaded(true)} />
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
        fill.current.style.transform = `scaleX(${Math.min(1, (v.currentTime || 0) / d)})`;
        time.current.textContent = `${clock(v.currentTime || 0)} / ${clock(d)}`;
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
          role="slider"
          aria-label="Scrub"
          aria-valuemin={0}
          aria-valuemax={media.dur}
          aria-valuenow={0}
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
            className={st.ctl}
            aria-pressed={!muted}
            onClick={() => {
              const v = video();
              if (!v) return;
              v.muted = !v.muted;
              setMuted(v.muted);
            }}
          >
            {muted ? "Sound off" : "Sound on"}
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
function SetView({ asset, rigged, phone }: { asset: LitAsset; rigged: boolean; phone: boolean }) {
  const { effectiveMode } = useDisplayMode();
  const touch = useMedia("(hover: none), (pointer: coarse)");
  // ?still=1 — set-photography mode (front view held, no framing shift).
  const stillMode = useMemo(() => new URLSearchParams(window.location.search).has("still"), []);
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
  const live = effectiveMode === "enhanced";
  const shift = stillMode || phone ? 0 : 0.16;
  const still = sp.setStill;
  const setProp = useMemo(
    () => ({ color: sp.stage?.color ?? "#3a3633", viewShift: shift, lit: !!still && !stillMode, azimuth: sp.stage?.azimuth }),
    [sp.stage?.color, sp.stage?.azimuth, shift, still, stillMode],
  );

  return (
    <>
      <div className={st.set} data-lenis-prevent="" data-noswipe="" style={{ "--shift": shift } as CSSProperties}>
        {live ? (
          <div className={st.setCanvas}>
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
          </div>
        ) : null}
        {still && !stillMode ? (
          <img key={still.src} className={`${st.setStill} ${live && ready ? st.gone : ""}`} src={enc(still.src)} alt={live ? "" : asset.title} />
        ) : null}
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

// Film grain: one generated, semi-transparent tile — the shared stock. It is
// painted into the field (under the work), never over the owner's pixels.
function useGrainUrl() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 192;
    const g = c.getContext("2d");
    if (!g) return "";
    const img = g.createImageData(192, 192);
    // Seeded (mulberry32) so the tile is identical on every render — pure.
    let seed = 0x2f6b9e1;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let k = 0; k < img.data.length; k += 4) {
      const v = 128 + (rnd() - 0.5) * 255;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
      img.data[k + 3] = 15;
    }
    g.putImageData(img, 0, 0);
    return `url(${c.toDataURL("image/png")})`;
  }, []);
}
