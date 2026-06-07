"use client";

/**
 * WorkShowcase — category-tabbed asset browser.
 *
 * Four categories (Models · Rigged Characters · Video · Images). Selecting a
 * tab shows a technical info panel on the left and the asset presentation on
 * the right, with prev/next stepping through that category's assets. Models
 * present the interactive WebGL viewer (poster fallback in reduced/low tiers);
 * video and images present their media directly.
 *
 * Content-driven: receives entries pre-grouped by category from the server.
 */

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { WorkCategory, WorkEntry } from "../../lib/content";
import { SpecimenViewer } from "./SpecimenViewer";

// Inlined (not imported from content.ts) so this client component never pulls
// the node:fs-backed content loader into the browser bundle.
const TABS: { id: WorkCategory; label: string }[] = [
  { id: "models", label: "Models" },
  { id: "rigged", label: "Rigged Characters" },
  { id: "video", label: "Video" },
  { id: "images", label: "Images" },
];

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
      sizes="(max-width: 900px) 100vw, 56vw"
    />
  );
}

export function WorkShowcase({ groups }: { groups: Record<WorkCategory, WorkEntry[]> }) {
  const [category, setCategory] = useState<WorkCategory>("models");
  const [index, setIndex] = useState(0);

  const items = groups[category];
  const count = items.length;
  const active = count > 0 ? items[Math.min(index, count - 1)] : null;

  const selectCategory = (next: WorkCategory) => {
    setCategory(next);
    setIndex(0);
  };
  const step = (dir: number) => {
    if (count < 2) return;
    setIndex((i) => (i + dir + count) % count);
  };

  return (
    <section id="selected-work" className="showcase" aria-label="Work">
      <div className="showcase__head page-shell">
        <div className="section-head">
          <span className="section-head__index">01</span>
          <h2 className="section-head__title">Work</h2>
        </div>
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
                <span className="showcase__tab-count">{String(n).padStart(2, "0")}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="showcase__stage page-shell">
        {active ? (
          <>
            {/* ── Left: technical info panel ── */}
            <div className="showcase__info" key={`info-${active.slug}`}>
              <span className="showcase__scan" aria-hidden="true" />
              <p className="showcase__counter">
                {String(Math.min(index, count - 1) + 1).padStart(2, "0")}
                <span className="showcase__counter-sep"> / </span>
                {String(count).padStart(2, "0")}
              </p>
              <h3 className="showcase__title">{active.title}</h3>
              <dl className="showcase__specs">
                <div className="showcase__spec">
                  <dt>Format</dt>
                  <dd>{active.format} · {active.year}</dd>
                </div>
                <div className="showcase__spec">
                  <dt>Discipline</dt>
                  <dd>{active.discipline}</dd>
                </div>
                {active.role.length ? (
                  <div className="showcase__spec">
                    <dt>Role</dt>
                    <dd>{active.role.join(" · ")}</dd>
                  </div>
                ) : null}
                {active.tools.length ? (
                  <div className="showcase__spec">
                    <dt>Tools</dt>
                    <dd>{active.tools.join(" · ")}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="showcase__summary">{active.summary}</p>
              <Link href={`/work/${active.slug}`} className="showcase__link">
                Open case study <span aria-hidden="true">→</span>
              </Link>
            </div>

            {/* ── Right: presentation + prev/next ── */}
            <div className="showcase__present">
              {count > 1 ? (
                <button
                  type="button"
                  className="showcase__nav showcase__nav--prev"
                  onClick={() => step(-1)}
                  aria-label="Previous asset"
                >
                  <span aria-hidden="true">‹</span>
                </button>
              ) : null}

              <div className="showcase__media" key={active.slug}>
                <Presentation entry={active} category={category} />
              </div>

              {count > 1 ? (
                <button
                  type="button"
                  className="showcase__nav showcase__nav--next"
                  onClick={() => step(1)}
                  aria-label="Next asset"
                >
                  <span aria-hidden="true">›</span>
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="showcase__empty">
            <span className="showcase__empty-tick" aria-hidden="true">◊</span>
            <p>
              {TABS.find((c) => c.id === category)?.label} — in production.
              <br />
              New work landing here soon.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
