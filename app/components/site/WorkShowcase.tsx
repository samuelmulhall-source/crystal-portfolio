"use client";

/**
 * WorkShowcase — category-tabbed asset browser.
 *
 * Four categories (Models · Rigged Characters · Video · Images). Selecting a
 * tab shows a typographic info panel on the left and the asset presentation on
 * the right, stepping through that category's assets. Models present the
 * interactive WebGL viewer (poster fallback in reduced/low tiers); video and
 * images present their media directly.
 *
 * Content-driven: receives entries pre-grouped by category from the server.
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { WorkCategory, WorkEntry } from "../../lib/content";
import { SpecimenViewer } from "./SpecimenViewer";

/** Wireframe HUD reticle that trails the cursor over a 3D model presentation. */
function ModelReticle() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0, active = false;
    const onMove = (e: PointerEvent) => {
      const r = parent.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      if (!active) { active = true; cx = tx; cy = ty; el.style.opacity = "1"; }
    };
    const onLeave = () => { active = false; el.style.opacity = "0"; };
    parent.addEventListener("pointermove", onMove);
    parent.addEventListener("pointerleave", onLeave);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      el.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) translate(-50%, -50%)`;
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      parent.removeEventListener("pointermove", onMove);
      parent.removeEventListener("pointerleave", onLeave);
    };
  }, []);
  return (
    <div ref={ref} className="showcase__reticle" aria-hidden="true">
      <span className="showcase__reticle-box" />
      <span className="showcase__reticle-corner showcase__reticle-corner--tl" />
      <span className="showcase__reticle-corner showcase__reticle-corner--tr" />
      <span className="showcase__reticle-corner showcase__reticle-corner--bl" />
      <span className="showcase__reticle-corner showcase__reticle-corner--br" />
      <span className="showcase__reticle-dot" />
    </div>
  );
}

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

function Presentation({ entry, category }: { entry: WorkEntry; category: WorkCategory }) {
  if (category === "models" && entry.specimen) {
    return <SpecimenViewer specimen={entry.specimen} alt={entry.title} className="showcase-viewer" />;
  }
  if (entry.heroMedia.kind === "video") {
    return (
      <video
        className="showcase__video"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        poster={entry.heroMedia.poster ?? entry.thumbnail.src}
      >
        <source src={entry.heroMedia.src} type="video/mp4" />
      </video>
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

  const items = groups[category];
  const count = items.length;
  const idx = count > 0 ? Math.min(index, count - 1) : 0;
  const active = count > 0 ? items[idx] : null;
  const label = TABS.find((t) => t.id === category)?.label;

  const selectCategory = (next: WorkCategory) => {
    setCategory(next);
    setIndex(0);
  };
  const step = (dir: number) => {
    if (count < 2) return;
    setIndex((i) => (Math.min(i, count - 1) + dir + count) % count);
  };

  const specs: Array<[string, string]> = active
    ? ([
        ["Format", `${active.format} · ${active.year}`],
        ["Discipline", active.discipline],
        active.role.length ? ["Role", active.role.join(" · ")] : null,
        active.tools.length ? ["Tools", active.tools.join(" · ")] : null,
      ].filter(Boolean) as Array<[string, string]>)
    : [];

  return (
    <section id="selected-work" className="showcase" aria-label="Work">
      <div className="showcase__head page-shell">
        <h2 className="showcase__heading">Work</h2>
        <div className="showcase__tabs" role="tablist" aria-label="Work categories">
          {TABS.map((tab) => {
            const n = groups[tab.id].length;
            const isActive = tab.id === category;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`showcase__tab${isActive ? " is-active" : ""}`}
                onClick={() => selectCategory(tab.id)}
              >
                <span className="showcase__tab-label">{tab.label}</span>
                <span className="showcase__tab-count">{pad(n)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="showcase__stage page-shell">
        {active ? (
          <>
            {/* ── Left: typographic datasheet ── */}
            <div className="showcase__info" key={`info-${active.slug}`}>
              <p className="showcase__eyebrow">
                <span>{label}</span>
                <span className="showcase__eyebrow-idx">{pad(idx + 1)} / {pad(count)}</span>
              </p>
              <h3 className="showcase__title">{active.title}</h3>
              <dl className="showcase__specs">
                {specs.map(([k, v]) => (
                  <div className="showcase__spec" key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="showcase__summary">{active.summary}</p>
            </div>

            {/* ── Right: presentation reticle + edge stepping ── */}
            <div className="showcase__present">
              <div className="showcase__media" key={active.slug}>
                <Presentation entry={active} category={category} />
                {category === "models" ? <ModelReticle /> : null}
                <div className="showcase__media-bar" aria-hidden="true">
                  <span className="showcase__media-name">{active.title}</span>
                  <span className="showcase__media-index">{pad(idx + 1)} / {pad(count)}</span>
                </div>
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
                </>
              ) : null}
            </div>
          </>
        ) : (
          <div className="showcase__empty">
            <span className="showcase__empty-tick" aria-hidden="true">◊</span>
            <p>{label} — in production. New work landing here soon.</p>
          </div>
        )}
      </div>
    </section>
  );
}
