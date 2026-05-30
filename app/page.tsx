import Link from "next/link";
import { Footer } from "./components/site/Footer";
import { Header } from "./components/site/Header";
import { HeroEntrance } from "./components/site/HeroEntrance";
import { MediaBlock } from "./components/site/MediaBlock";
import { SpecimenPreview } from "./components/site/SpecimenPreview";
import { WorkCard } from "./components/site/WorkCard";
import {
  getHomeContent,
  getSiteSettings,
  getWorkEntries,
  getWorkEntryBySlug,
} from "./lib/content";

export default function HomePage() {
  const site = getSiteSettings();
  const home = getHomeContent();
  const heroEntry = getWorkEntryBySlug(home.hero.featuredSlug);
  const spotlightEntry = getWorkEntryBySlug(home.spotlight.slug);
  const previewEntries = getWorkEntries().slice(0, home.archivePreview.limit);

  if (!heroEntry || !spotlightEntry) {
    throw new Error("Home content references a missing work entry.");
  }

  const selectedEntries = home.selectedWork.featuredSlugs
    .map((slug) => getWorkEntryBySlug(slug))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return (
    <main className="page-root">
      <Header brandName={site.brand.name} />

      {/* ═══ HERO — full viewport, asset dissolved into the smoke ═══ */}
      <section className="hero-section">
        <HeroEntrance>
          {/* Center hero content */}
          <div className="hero-core">
            <h1 className="hero-title--brutal" data-hero-entrance="title">
              {home.hero.title.split("\n").map((line) => (
                <span key={line} className="hero-title__line">
                  {line.split(" · ").map((word, j, arr) => (
                    <span key={word}>
                      {word}
                      {j < arr.length - 1 ? <span className="hero-title__sep"> · </span> : null}
                    </span>
                  ))}
                </span>
              ))}
            </h1>
            <p className="hero-lede" data-hero-entrance="lede">{home.hero.lede}</p>
            <dl className="hero-readout" data-hero-entrance="readout">
              {home.hero.readout.map((row) => (
                <div className="hero-readout__row" key={row.key}>
                  <dt className="hero-readout__key">{row.key}</dt>
                  <dd className="hero-readout__val">{row.val}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Featured asset — framed, crushed + screen-blended so it melts into the smoke */}
          <div className="hero-viewport" data-hero-entrance="viewport">
            <SpecimenPreview
              posterAsset={
                home.hero.video
                  ? {
                      kind: "image",
                      src: home.hero.video.poster ?? home.hero.video.src,
                      alt: home.hero.video.alt,
                      width: 760,
                      height: 1056,
                    }
                  : heroEntry.thumbnail
              }
              motionAsset={home.hero.video ?? heroEntry.heroMedia}
              priority
            />
          </div>

          {/* Bottom actions */}
          <div className="hud-bar" data-hero-entrance="hud-bottom">
            <Link href="/work" className="hud-link">Archive</Link>
            <span className="hud-divider" />
            <Link href="#contact" className="hud-link">Transmit</Link>
          </div>
        </HeroEntrance>
      </section>

      {/* ═══ SELECTED WORK ═══ */}
      <section className="section page-shell">
        <div className="section-heading">
          <p className="eyebrow">01 · Work</p>
          <h2>{home.selectedWork.heading}</h2>
          <p>{home.selectedWork.intro}</p>
        </div>
        <div className="feature-grid">
          {selectedEntries.map((entry) => (
            <WorkCard key={entry.slug} entry={entry} variant="feature" />
          ))}
        </div>
      </section>

      {/* ═══ SPOTLIGHT ═══ */}
      <section className="section page-shell spotlight">
        <div className="section-heading">
          <p className="eyebrow">02 · Case study</p>
          <h2>{home.spotlight.heading}</h2>
          <p>{home.spotlight.intro}</p>
          <p className="spotlight__title">{spotlightEntry.title}</p>
          <p className="spotlight__summary">{spotlightEntry.caseStudy.hook}</p>
          <Link className="button-link" href={`/work/${spotlightEntry.slug}`}>
            {home.spotlight.ctaLabel}
          </Link>
        </div>
        <MediaBlock asset={spotlightEntry.heroMedia} />
      </section>

      {/* ═══ CAPABILITIES ═══ */}
      <section className="section page-shell">
        <div className="section-heading">
          <p className="eyebrow">03 · Method</p>
          <h2>{home.capabilities.heading}</h2>
          <p>{home.capabilities.intro}</p>
        </div>
        <div className="capability-grid">
          {home.capabilities.items.map((item) => (
            <article key={item.title} className="capability-card">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ═══ ARCHIVE PREVIEW ═══ */}
      <section className="section page-shell">
        <div className="section-heading">
          <p className="eyebrow">04 · Archive</p>
          <h2>{home.archivePreview.heading}</h2>
          <p>{home.archivePreview.intro}</p>
        </div>
        <div className="archive-preview-grid">
          {previewEntries.map((entry) => (
            <WorkCard key={entry.slug} entry={entry} variant="compact" />
          ))}
        </div>
        <div className="section-cta">
          <Link className="text-link" href={home.archivePreview.ctaHref}>
            {home.archivePreview.ctaLabel}
          </Link>
        </div>
      </section>

      {/* ═══ CONTACT ═══ */}
      <section id="contact" className="contact-section">
        <div className="page-shell contact-section__inner">
          <div className="section-heading">
            <p className="eyebrow">05 · Contact</p>
            <h2>{home.contact.heading}</h2>
            <p>{home.contact.intro}</p>
          </div>
          <div className="contact-panel">
            <p className="contact-panel__availability">{site.contact.availability}</p>
            <ul className="support-list support-list--compact">
              {home.contact.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <div className="hero-actions">
              <a className="button-link" href={home.contact.primaryCta.href}>
                {home.contact.primaryCta.label}
              </a>
              <Link className="button-link button-link--ghost" href={home.contact.secondaryCta.href}>
                {home.contact.secondaryCta.label}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer
        brandName={site.brand.name}
        xHandle={site.social.xHandle}
        xUrl={site.social.xUrl}
      />
    </main>
  );
}
