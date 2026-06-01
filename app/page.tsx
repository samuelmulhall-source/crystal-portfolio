import Link from "next/link";
import { Footer } from "./components/site/Footer";
import { Header } from "./components/site/Header";
import { HeroEntrance } from "./components/site/HeroEntrance";
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
  const previewEntries = getWorkEntries().slice(0, home.archivePreview.limit);

  if (!heroEntry) {
    throw new Error("Home content references a missing work entry.");
  }

  const selectedEntries = home.selectedWork.featuredSlugs
    .map((slug) => getWorkEntryBySlug(slug))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return (
    <main className="page-root">
      <Header brandName={site.brand.name} />

      {/* ═══ HERO — wordmark + discipline, asset in smoke ═══ */}
      <section className="hero-section">
        <HeroEntrance>
          <div className="hero-core">
            <h1 className="hero-wordmark" data-hero-entrance="title">{home.hero.title}</h1>
            <p className="hero-subhead" data-hero-entrance="subhead">
              {home.hero.subhead.map((word, i) => (
                <span key={word} className="hero-subhead__item">
                  {i > 0 ? <span className="hero-subhead__sep" aria-hidden="true">·</span> : null}
                  {word}
                </span>
              ))}
            </p>
          </div>

          <div className="hero-viewport" data-hero-entrance="viewport">
            <SpecimenPreview
              posterAsset={
                home.hero.video
                  ? {
                      kind: "image",
                      src: home.hero.video.poster ?? home.hero.video.src,
                      alt: home.hero.video.alt,
                      width: 800,
                      height: 780,
                    }
                  : heroEntry.thumbnail
              }
              motionAsset={home.hero.video ?? heroEntry.heroMedia}
              priority
            />
          </div>
        </HeroEntrance>
      </section>

      {/* ═══ SELECTED WORK ═══ */}
      <section className="section page-shell">
        <div className="section-head">
          <span className="section-head__index">01</span>
          <h2 className="section-head__title">{home.selectedWork.heading}</h2>
        </div>
        <div className="feature-grid">
          {selectedEntries.map((entry) => (
            <WorkCard key={entry.slug} entry={entry} variant="feature" />
          ))}
        </div>
      </section>

      {/* ═══ ARCHIVE PREVIEW ═══ */}
      <section className="section page-shell">
        <div className="section-head">
          <span className="section-head__index">02</span>
          <h2 className="section-head__title">{home.archivePreview.heading}</h2>
          <Link className="section-head__link" href={home.archivePreview.ctaHref}>
            {home.archivePreview.ctaLabel}
          </Link>
        </div>
        <div className="archive-preview-grid">
          {previewEntries.map((entry) => (
            <WorkCard key={entry.slug} entry={entry} variant="compact" />
          ))}
        </div>
      </section>

      {/* ═══ CONTACT ═══ */}
      <section id="contact" className="contact-section">
        <div className="page-shell contact-section__inner">
          <div className="section-head">
            <span className="section-head__index">03</span>
            <h2 className="section-head__title">{home.contact.heading}</h2>
          </div>
          <div className="contact-actions">
            <a className="button-link" href={home.contact.primaryCta.href}>
              {home.contact.primaryCta.label}
            </a>
            <Link className="button-link button-link--ghost" href={home.contact.secondaryCta.href}>
              {home.contact.secondaryCta.label}
            </Link>
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
