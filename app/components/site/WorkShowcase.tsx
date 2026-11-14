"use client";

/**
 * WorkShowcase — the work, all at once, then one piece at a time.
 *
 * Opens on **All**: a wall of every piece in its own colours and proportions,
 * in curated `sortOrder` (strongest first), so the range reads in one glance.
 * Picking a tile opens that piece IN PLACE in the stage below the same tabs —
 * it never navigates to /work/[slug] (standing owner rule).
 *
 * The four categories (Models · Rigged Characters · Video · Images) stay as
 * the organising structure for a growing body of work. Selecting one shows a
 * typographic info panel on the left and the asset presentation on the right,
 * stepping through that category's slides. Collection entries
 * (asset packs) expand into one slide per asset, so a pack is browsed inside
 * the same stepping model. Models present the interactive WebGL inspector
 * (poster fallback in reduced/low tiers); video and images present their
 * media directly.
 *
 * Content-driven: receives entries pre-grouped by category from the server.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { PackAsset, WorkCategory, WorkEntry } from "../../lib/content";
import { DecodeText } from "./DecodeText";
import { SpecimenViewer } from "./SpecimenViewer";
import { GlassVideo } from "./GlassVideo";
import { WORK_FOCUS_EVENT } from "./HeroSpecimenCue";
import { lenisInstance } from "../SmoothScroll";

// Inlined (not imported from content.ts) so this client component never pulls
// the node:fs-backed content loader into the browser bundle.
const TABS: { id: WorkCategory; label: string }[] = [
  { id: "models", label: "Models" },
  { id: "rigged", label: "Rigged Characters" },
  { id: "video", label: "Video" },
  { id: "images", label: "Images" },
];

/** The showcase view: the All-work wall, or one category's stage. */
type View = WorkCategory | "all";
const VIEWS: { id: View; label: string }[] = [{ id: "all", label: "All" }, ...TABS];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** One steppable unit: a whole entry, or one named asset of a pack entry. */
type Slide = { entry: WorkEntry; asset?: PackAsset };

function toSlides(entries: WorkEntry[]): Slide[] {
  return entries.flatMap((entry) =>
    entry.assets?.length
      ? entry.assets.map((asset) => ({ entry, asset }))
      : [{ entry }],
  );
}

/** Poster/thumb source for a slide — pack assets use their specimen poster. */
function slideThumb(slide: Slide): string {
  return slide.asset?.specimen.poster ?? slide.entry.thumbnail.src;
}

function slideTitle(slide: Slide): string {
  return slide.asset ? slide.asset.title : slide.entry.title;
}

/** A still-image slide's own width/height ratio (null for models and video).
 *  The stage takes this shape, so a wide render isn't letterboxed inside a
 *  fixed 4:3 box. */
function stillRatio(slide: Slide): number | null {
  const { entry } = slide;
  if (slide.asset || entry.specimen || entry.heroMedia.kind !== "image") return null;
  const { width, height } = entry.heroMedia;
  return width && height ? width / height : null;
}

/** Tile proportions come from the card image; clamped so one extreme ratio
 *  can't starve or swallow a row of the justified wall. */
function tileRatio(entry: WorkEntry): number {
  if (entry.assets?.length) return 4 / 3; // pack mosaic
  const { width, height } = entry.thumbnail;
  const ar = width && height ? width / height : 4 / 3;
  return Math.min(2.2, Math.max(0.7, ar));
}

/** Split `ratios` (in order) into `k` contiguous rows whose summed ratios are
 *  as even as possible — the classic linear-partition DP, minimising the
 *  widest row. Since a justified row's height is width ÷ Σratio, even sums
 *  mean even row heights. Returns rows of indices. n is a handful of pieces,
 *  so the O(n²k) table is nothing. */
function partitionRows(ratios: number[], k: number): number[][] {
  const n = ratios.length;
  const all = ratios.map((_, i) => i);
  if (n === 0) return [];
  if (k <= 1) return [all];
  if (k >= n) return all.map((i) => [i]);
  const prefix = [0];
  for (const r of ratios) prefix.push(prefix[prefix.length - 1] + r);
  const cost = Array.from({ length: n + 1 }, () => new Array<number>(k + 1).fill(Infinity));
  const cut = Array.from({ length: n + 1 }, () => new Array<number>(k + 1).fill(0));
  for (let i = 1; i <= n; i++) cost[i][1] = prefix[i];
  for (let j = 2; j <= k; j++) {
    for (let i = j; i <= n; i++) {
      for (let x = j - 1; x < i; x++) {
        const c = Math.max(cost[x][j - 1], prefix[i] - prefix[x]);
        if (c < cost[i][j]) {
          cost[i][j] = c;
          cut[i][j] = x;
        }
      }
    }
  }
  const rows: number[][] = [];
  let end = n;
  for (let j = k; j >= 1; j--) {
    const start = j === 1 ? 0 : cut[end][j];
    rows.unshift(all.slice(start, end));
    end = start;
  }
  return rows;
}

/** One piece on the All-work wall. A real <button>: it opens the piece in the
 *  stage in place (no route change). Packs show a 2×2 mosaic of their assets
 *  so a collection reads as a collection. */
function WallTile({
  entry,
  kind,
  onOpen,
}: {
  entry: WorkEntry;
  kind: string;
  onOpen: () => void;
}) {
  const pack = entry.assets?.length ? entry.assets.slice(0, 4) : null;
  return (
    <button
      type="button"
      className="showcase__tile"
      style={{ "--ar": tileRatio(entry) } as React.CSSProperties}
      onClick={onOpen}
      aria-label={`${entry.title} — ${kind}. Open in the viewer.`}
    >
      {pack ? (
        <span className="showcase__tile-mosaic" aria-hidden="true">
          {pack.map((asset) => (
            <Image
              key={asset.id}
              src={asset.specimen.poster}
              alt=""
              width={611}
              height={457}
              sizes="(max-width: 560px) 50vw, 20vw"
            />
          ))}
        </span>
      ) : (
        <Image
          className="showcase__tile-img"
          src={entry.thumbnail.src}
          alt=""
          fill
          sizes="(max-width: 560px) 100vw, (max-width: 960px) 50vw, 34vw"
        />
      )}
      <span className="showcase__tile-caption" aria-hidden="true">
        <span className="showcase__tile-title">{entry.title}</span>
        <span className="showcase__tile-kind">
          {kind}
          {entry.assets?.length ? ` · ${entry.assets.length} assets` : ""}
        </span>
      </span>
    </button>
  );
}

/** Join phrases with a breakable " · " while keeping the words WITHIN each
 *  phrase glued (non-breaking space) — so a narrow datasheet column (the
 *  resizable divider goes down to 26%) wraps between items, never mid-phrase
 *  (e.g. "Material lookdev" splitting into "Material" / "lookdev"). */
function joinKeepingPhrasesWhole(items: string[]): string {
  return items.map((s) => s.replace(/ /g, " ")).join(" · ");
}

function Presentation({
  slide,
  enabled,
}: {
  slide: Slide;
  enabled: boolean;
}) {
  const { entry } = slide;
  const specimen = slide.asset?.specimen ?? entry.specimen;
  // Any slide with a specimen gets the interactive viewer — models AND rigged
  // characters (both live in the WebGL inspector).
  if (specimen) {
    // Until the showcase is scrolled into view, show the poster — defers the
    // WebGL context + FBX/texture load out of the initial page load.
    if (!enabled) {
      return (
        <Image
          className="showcase__image"
          src={specimen.poster}
          alt={slideTitle(slide)}
          width={1600}
          height={1000}
          sizes="(max-width: 900px) 100vw, 60vw"
        />
      );
    }
    return (
      <SpecimenViewer specimen={specimen} alt={slideTitle(slide)} className="showcase-viewer" />
    );
  }
  if (entry.heroMedia.kind === "video") {
    // The glass player carries its own chrome and matches each video's ratio.
    return (
      <GlassVideo
        src={entry.heroMedia.src}
        poster={entry.heroMedia.poster ?? entry.thumbnail.src}
      />
    );
  }
  const img = entry.heroMedia.kind === "image" ? entry.heroMedia : entry.thumbnail;
  return (
    <Image
      className="showcase__image"
      src={img.src}
      alt={img.alt}
      width={img.width ?? 1600}
      height={img.height ?? 1000}
      sizes="(max-width: 900px) 100vw, 60vw"
    />
  );
}

export function WorkShowcase({ groups }: { groups: Record<WorkCategory, WorkEntry[]> }) {
  // Opens on the All-work wall — the whole range before any one piece.
  const [view, setView] = useState<View>("all");
  const [index, setIndex] = useState(0);
  const tabRefs = useRef<Partial<Record<View, HTMLButtonElement | null>>>({});

  // Defer the heavy WebGL viewer until the showcase is near the viewport.
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      // Negative bottom margin: only fire once the showcase is well up into the
      // viewport (past the pinned hero intro), so the WebGL stays out of the
      // initial load and the early part of the scroll.
      { rootMargin: "0px 0px -45% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  // The hero lantern cue asks us to open a specific entry (by slug) in its own
  // category, rather than the default Models tab. Resolve the slug to its
  // category + slide index and select it; the cue's own #selected-work anchor
  // handles the scroll.
  useEffect(() => {
    const onFocusEntry = (e: Event) => {
      const slug = (e as CustomEvent<{ slug?: string }>).detail?.slug;
      if (!slug) return;
      for (const tab of TABS) {
        const i = toSlides(groups[tab.id]).findIndex((s) => s.entry.slug === slug);
        if (i >= 0) {
          setView(tab.id);
          setIndex(i);
          setInView(true); // ensure the presentation mounts, not just the poster
          return;
        }
      }
    };
    window.addEventListener(WORK_FOCUS_EVENT, onFocusEntry);
    return () => window.removeEventListener(WORK_FOCUS_EVENT, onFocusEntry);
  }, [groups]);

  // Resizable split — the info/viewer column ratio (info fraction). Default
  // matches the static 0.72fr/1.28fr layout; a draggable divider reapportions
  // it on desktop, and the rest of the section reflows around the viewer.
  const stageRef = useRef<HTMLDivElement>(null);
  const [infoFr, setInfoFr] = useState(0.34);
  const MIN_FR = 0.26;
  const MAX_FR = 0.6;
  const dragging = useRef(false);
  const applyRatioFromX = useCallback((clientX: number) => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(MAX_FR, Math.max(MIN_FR, (clientX - r.left) / r.width));
    setInfoFr(f);
  }, []);
  const onDividerPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      applyRatioFromX(e.clientX);
    },
    [applyRatioFromX],
  );
  const onDividerPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragging.current) applyRatioFromX(e.clientX);
    },
    [applyRatioFromX],
  );
  const onDividerPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);
  const onDividerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); setInfoFr((f) => Math.max(MIN_FR, f - 0.03)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setInfoFr((f) => Math.min(MAX_FR, f + 0.03)); }
    else if (e.key === "Home") { e.preventDefault(); setInfoFr(0.34); }
  }, []);

  const category: WorkCategory | null = view === "all" ? null : view;
  const slides = category ? toSlides(groups[category]) : [];
  const count = slides.length;
  const idx = count > 0 ? Math.min(index, count - 1) : 0;
  const active = count > 0 ? slides[idx] : null;
  const label = VIEWS.find((t) => t.id === view)?.label;
  const activeRatio = active ? stillRatio(active) : null;

  // Every piece once, in curated order (sortOrder — strongest first), each
  // tagged with the category it lives in.
  const wall = TABS.flatMap((tab) =>
    groups[tab.id].map((entry) => ({ entry, category: tab.id, kind: tab.label })),
  ).sort((a, b) => a.entry.sortOrder - b.entry.sortOrder);

  // Justified rows: measure the wall, pick a row count from a target row height,
  // then split the pieces (in order) so the rows are as even as possible — every
  // row fills the width, no stretched stragglers and no ragged last line. Until
  // measured (server HTML / first paint) one wrapping row approximates it.
  const wallRef = useRef<HTMLDivElement>(null);
  const [wallWidth, setWallWidth] = useState(0);
  useEffect(() => {
    const el = wallRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWallWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);
  const ratios = wall.map((w) => tileRatio(w.entry));
  const targetRowH = wallWidth < 600 ? 190 : wallWidth < 1000 ? 240 : 310;
  const rowCount = wallWidth
    ? Math.round((ratios.reduce((a, b) => a + b, 0) * targetRowH) / wallWidth)
    : 1;
  const wallRows = partitionRows(ratios, rowCount);

  const selectView = useCallback((next: View) => {
    setView(next);
    setIndex(0);
  }, []);

  /** Open one piece from the wall, in place: switch to its category at its
   *  first slide, and bring the showcase head back into view if the wall had
   *  been scrolled past it (the stage is shorter than the wall). */
  const openEntry = (entry: WorkEntry, cat: WorkCategory) => {
    const i = toSlides(groups[cat]).findIndex((s) => s.entry.slug === entry.slug);
    setView(cat);
    setIndex(Math.max(0, i));
    setInView(true);
    const el = sectionRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top < 0) {
      // Absolute target from the REAL scroll position — Lenis's own animated
      // position can lag a native jump (scrollbar drag, keyboard, find-in-page).
      if (lenisInstance) lenisInstance.scrollTo(window.scrollY + top);
      else el.scrollIntoView({ behavior: "auto", block: "start" });
    }
  };
  const step = (dir: number) => {
    if (count < 2) return;
    setIndex((i) => (Math.min(i, count - 1) + dir + count) % count);
  };

  // APG tabs pattern: arrow keys move focus AND selection (automatic
  // activation); Home/End jump to the first/last tab.
  const onTabKeyDown = (e: React.KeyboardEvent, current: View) => {
    const order = VIEWS.map((t) => t.id);
    const pos = order.indexOf(current);
    let next: View | null = null;
    if (e.key === "ArrowRight") next = order[(pos + 1) % order.length];
    else if (e.key === "ArrowLeft") next = order[(pos - 1 + order.length) % order.length];
    else if (e.key === "Home") next = order[0];
    else if (e.key === "End") next = order[order.length - 1];
    if (!next) return;
    e.preventDefault();
    selectView(next);
    tabRefs.current[next]?.focus();
  };

  const specs: Array<[string, string]> = active
    ? ([
        ["Format", joinKeepingPhrasesWhole([active.entry.format, active.entry.year])],
        ["Discipline", active.entry.discipline],
        active.entry.role.length ? ["Role", joinKeepingPhrasesWhole(active.entry.role)] : null,
        active.entry.tools.length ? ["Tools", joinKeepingPhrasesWhole(active.entry.tools)] : null,
      ].filter(Boolean) as Array<[string, string]>)
    : [];

  return (
    <section ref={sectionRef} id="selected-work" className="showcase" aria-label="Work">
      {/* Static index of every entry — reachable without JS, invisible with it. */}
      <nav className="sr-only" aria-label="All work entries">
        <ul>
          {TABS.flatMap((tab) =>
            groups[tab.id].map((entry) => (
              <li key={entry.slug}>
                <Link href={`/work/${entry.slug}`}>{entry.title}</Link>
              </li>
            )),
          )}
        </ul>
      </nav>

      <div className="showcase__head page-shell">
        <h2 className="showcase__heading">Work</h2>
        <div className="showcase__tabs" role="tablist" aria-label="Work categories">
          {VIEWS.map((tab) => {
            // "All" carries no count — the wall itself is the count.
            const n = tab.id === "all" ? null : toSlides(groups[tab.id]).length;
            const isActive = tab.id === view;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                type="button"
                role="tab"
                id={`showcase-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls="showcase-panel"
                tabIndex={isActive ? 0 : -1}
                className={`showcase__tab${isActive ? " is-active" : ""}`}
                onClick={() => selectView(tab.id)}
                onKeyDown={(e) => onTabKeyDown(e, tab.id)}
              >
                <span className="showcase__tab-label">{tab.label}</span>
                {n !== null ? <span className="showcase__tab-count">{pad(n)}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {view === "all" ? (
        <div
          ref={wallRef}
          className="showcase__wall page-shell"
          id="showcase-panel"
          role="tabpanel"
          aria-labelledby="showcase-tab-all"
        >
          {wallRows.map((row, r) => (
            <div className={`showcase__wall-row${wallWidth ? "" : " is-fallback"}`} key={r}>
              {row.map((i) => {
                const { entry, category: cat, kind } = wall[i];
                return (
                  <WallTile
                    key={entry.slug}
                    entry={entry}
                    kind={kind}
                    onOpen={() => openEntry(entry, cat)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      ) : (
      <div
        ref={stageRef}
        className="showcase__stage page-shell"
        id="showcase-panel"
        role="tabpanel"
        aria-labelledby={`showcase-tab-${view}`}
        style={
          active
            ? ({ "--col-info": `${infoFr * 2}fr`, "--col-present": `${(1 - infoFr) * 2}fr` } as React.CSSProperties)
            : undefined
        }
      >
        {/* Persistent (never-remounted) status line so screen readers hear
            which slide is now shown after Next/Prev/rail/tab changes — the
            visible panel remounts per entry, which live regions miss. */}
        <span className="sr-only" role="status">
          {active ? `${slideTitle(active)}, ${idx + 1} of ${count}` : ""}
        </span>
        {active ? (
          <>
            {/* ── Left: typographic datasheet ── */}
            <div className="showcase__info" key={`info-${active.entry.slug}`}>
              {/* HUD decode on action: the category readout and index resolve
                  through ASCII dither on tab switches and slide steps (the info
                  block remounts per entry, hence mount; within-pack steps decode
                  via text change). Mono only — glyph widths can't reflow. */}
              <p className="showcase__eyebrow">
                <DecodeText text={label ?? ""} on="change" mount />
                <DecodeText
                  className="showcase__eyebrow-idx"
                  text={`${pad(idx + 1)} / ${pad(count)}`}
                  on="change"
                  mount
                />
              </p>
              <h3 className="showcase__title">{active.entry.title}</h3>
              <dl className="showcase__specs">
                {specs.map(([k, v]) => (
                  <div className="showcase__spec" key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="showcase__summary">{active.entry.summary}</p>
            </div>

            {/* Draggable divider — resize the viewer, the datasheet reflows. */}
            <div
              className="showcase__divider"
              role="separator"
              aria-orientation="vertical"
              aria-controls="showcase-panel"
              aria-label="Resize the model viewer"
              aria-valuenow={Math.round(infoFr * 100)}
              aria-valuemin={Math.round(MIN_FR * 100)}
              aria-valuemax={Math.round(MAX_FR * 100)}
              tabIndex={0}
              onPointerDown={onDividerPointerDown}
              onPointerMove={onDividerPointerMove}
              onPointerUp={onDividerPointerUp}
              onKeyDown={onDividerKeyDown}
            >
              <span className="showcase__divider-grip" aria-hidden="true" />
            </div>

            {/* ── Right: presentation reticle + edge stepping ── */}
            <div className="showcase__present">
              <div
                className={`showcase__media${
                  category === "video"
                    ? " showcase__media--video"
                    : activeRatio
                      ? " showcase__media--still"
                      : ""
                }`}
                style={
                  activeRatio ? ({ "--media-ar": activeRatio } as React.CSSProperties) : undefined
                }
                key={active.entry.slug}
              >
                <Presentation slide={active} enabled={inView} />
                {category !== "video" ? (
                  <div className="showcase__media-bar" aria-hidden="true">
                    <DecodeText
                      className="showcase__media-name"
                      text={slideTitle(active)}
                      on="change"
                      mount
                    />
                  </div>
                ) : null}
              </div>

              {count > 1 ? (
                <>
                  <button
                    type="button"
                    className="showcase__nav showcase__nav--prev"
                    onClick={() => step(-1)}
                    aria-label="Previous asset"
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                  <button
                    type="button"
                    className="showcase__nav showcase__nav--next"
                    onClick={() => step(1)}
                    aria-label="Next asset"
                  >
                    <span aria-hidden="true">›</span>
                  </button>

                  {/* Index rail — every slide scannable and one click away. */}
                  <div className="showcase__rail" role="group" aria-label={`${label} index`}>
                    {slides.map((slide, i) => (
                      <button
                        key={`${slide.entry.slug}-${slide.asset?.id ?? "main"}`}
                        type="button"
                        className={`showcase__rail-thumb${i === idx ? " is-active" : ""}`}
                        onClick={() => setIndex(i)}
                        aria-label={`${slideTitle(slide)} (${i + 1} of ${count})`}
                        aria-current={i === idx ? "true" : undefined}
                      >
                        <span className="showcase__rail-index" aria-hidden="true">{pad(i + 1)}</span>
                        <Image
                          src={slideThumb(slide)}
                          alt=""
                          width={120}
                          height={90}
                          sizes="72px"
                        />
                        <span className="showcase__rail-label">{slideTitle(slide)}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <div className="showcase__empty">
            <span className="showcase__empty-tick" aria-hidden="true">◊</span>
            <p className="showcase__empty-label">{label}</p>
            <p className="showcase__empty-note">In production — new work landing here soon.</p>
          </div>
        )}
      </div>
      )}
    </section>
  );
}
