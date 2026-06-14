"use client";

/**
 * WorkShowcase — category-tabbed asset browser.
 *
 * Four categories (Models · Rigged Characters · Video · Images). Selecting a
 * tab shows a typographic info panel on the left and the asset presentation on
 * the right, stepping through that category's slides. Collection entries
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
import { SpecimenViewer } from "./SpecimenViewer";
import { GlassVideo } from "./GlassVideo";

// Inlined (not imported from content.ts) so this client component never pulls
// the node:fs-backed content loader into the browser bundle.
const TABS: { id: WorkCategory; label: string }[] = [
  { id: "models", label: "Models" },
  { id: "rigged", label: "Rigged Characters" },
  { id: "video", label: "Video" },
  { id: "images", label: "Images" },
];

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

function Presentation({
  slide,
  category,
  enabled,
}: {
  slide: Slide;
  category: WorkCategory;
  enabled: boolean;
}) {
  const { entry } = slide;
  const specimen = slide.asset?.specimen ?? entry.specimen;
  if (category === "models" && specimen) {
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
  const [category, setCategory] = useState<WorkCategory>("models");
  const [index, setIndex] = useState(0);
  const tabRefs = useRef<Partial<Record<WorkCategory, HTMLButtonElement | null>>>({});

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

  const slides = toSlides(groups[category]);
  const count = slides.length;
  const idx = count > 0 ? Math.min(index, count - 1) : 0;
  const active = count > 0 ? slides[idx] : null;
  const label = TABS.find((t) => t.id === category)?.label;

  const selectCategory = useCallback((next: WorkCategory) => {
    setCategory(next);
    setIndex(0);
  }, []);
  const step = (dir: number) => {
    if (count < 2) return;
    setIndex((i) => (Math.min(i, count - 1) + dir + count) % count);
  };

  // APG tabs pattern: arrow keys move focus AND selection (automatic
  // activation); Home/End jump to the first/last tab.
  const onTabKeyDown = (e: React.KeyboardEvent, current: WorkCategory) => {
    const order = TABS.map((t) => t.id);
    const pos = order.indexOf(current);
    let next: WorkCategory | null = null;
    if (e.key === "ArrowRight") next = order[(pos + 1) % order.length];
    else if (e.key === "ArrowLeft") next = order[(pos - 1 + order.length) % order.length];
    else if (e.key === "Home") next = order[0];
    else if (e.key === "End") next = order[order.length - 1];
    if (!next) return;
    e.preventDefault();
    selectCategory(next);
    tabRefs.current[next]?.focus();
  };

  const specs: Array<[string, string]> = active
    ? ([
        ["Format", `${active.entry.format} · ${active.entry.year}`],
        ["Discipline", active.entry.discipline],
        active.entry.role.length ? ["Role", active.entry.role.join(" · ")] : null,
        active.entry.tools.length ? ["Tools", active.entry.tools.join(" · ")] : null,
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
        <div className="showcase__head-title">
          <span className="showcase__index" aria-hidden="true">01</span>
          <h2 className="showcase__heading">Work</h2>
        </div>
        <div className="showcase__tabs" role="tablist" aria-label="Work categories">
          {TABS.map((tab) => {
            const n = toSlides(groups[tab.id]).length;
            const isActive = tab.id === category;
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
                onClick={() => selectCategory(tab.id)}
                onKeyDown={(e) => onTabKeyDown(e, tab.id)}
              >
                <span className="showcase__tab-label">{tab.label}</span>
                <span className="showcase__tab-count">{pad(n)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="showcase__stage page-shell"
        id="showcase-panel"
        role="tabpanel"
        aria-labelledby={`showcase-tab-${category}`}
      >
        {active ? (
          <>
            {/* ── Left: typographic datasheet ── */}
            <div className="showcase__info" key={`info-${active.entry.slug}`}>
              <p className="showcase__eyebrow">
                <span>{label}</span>
                <span className="showcase__eyebrow-idx">{pad(idx + 1)} / {pad(count)}</span>
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

            {/* ── Right: presentation reticle + edge stepping ── */}
            <div className="showcase__present">
              <div
                className={`showcase__media${category === "video" ? " showcase__media--video" : ""}`}
                key={active.entry.slug}
              >
                <Presentation slide={active} category={category} enabled={inView} />
                {category !== "video" ? (
                  <div className="showcase__media-bar" aria-hidden="true">
                    <span className="showcase__media-name">{slideTitle(active)}</span>
                    <span className="showcase__media-index">{pad(idx + 1)} / {pad(count)}</span>
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
    </section>
  );
}
