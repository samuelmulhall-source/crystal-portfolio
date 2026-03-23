import Link from "next/link";
import { Footer } from "./components/site/Footer";
import { Header } from "./components/site/Header";
import { HeroAtmosphere } from "./components/site/HeroAtmosphere";
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

function renderLink(href: string, label: string, variant: "primary" | "secondary") {
  const className = variant === "primary" ? "button-link" : "button-link button-link--ghost";
  if (href.startsWith("http") || href.startsWith("#")) {
    return (
      <a className={className} href={href}>
        {label}
      </a>
    );
  }

  return (
    <Link className={className} href={href}>
      {label}
    </Link>
  );
}

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
  const heroTitleLines = home.hero.title.split("\n");

  return (
    <main className="page-root">
      <Header brandName={site.brand.name} />

      <section className="hero-section">
        <HeroAtmosphere />
        <HeroEntrance>
          <div className="page-shell hero-section__content">
            <div className="hero-copy">
              <div className="hero-copy__intro">
                <p className="eyebrow" data-hero-entrance="eyebrow">{home.hero.eyebrow}</p>
                <p className="hero-kicker" data-hero-entrance="kicker">Australia studio / hero assets / motion / realtime</p>
              </div>
              <h1 className="hero-title" data-hero-entrance="title">
                {heroTitleLines.map((line) => (
                  <span key={line} className="hero-title__line">
                    {line}
                  </span>
                ))}
              </h1>
              <div className="hero-copy__body" data-hero-entrance="body">
                <p className="lede">{home.hero.intro}</p>
                <div className="hero-actions" data-hero-entrance="actions">
                  {renderLink(home.hero.primaryCta.href, home.hero.primaryCta.label, "primary")}
                  {renderLink(home.hero.secondaryCta.href, home.hero.secondaryCta.label, "secondary")}
                </div>
              </div>
              <div className="hero-band" data-hero-entrance="band" aria-label="Studio capabilities">
                {home.hero.meta.map((item, index) => (
                  <div key={item} className="hero-band__item">
                    <span className="hero-band__index">{`0${index + 1}`}</span>
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <aside className="specimen-card specimen-card--hero" data-hero-entrance="specimen">
              <div className="specimen-card__chrome">
                <p className="specimen-card__label">Featured specimen</p>
                <p className="specimen-card__index">Case study 01</p>
              </div>
              <div className="specimen-card__preview">
                <div className="specimen-card__orb specimen-card__orb--primary" />
                <div className="specimen-card__orb specimen-card__orb--secondary" />
                <SpecimenPreview
                  posterAsset={heroEntry.thumbnail}
                  motionAsset={heroEntry.heroMedia}
                  priority
                />
              </div>
              <div className="specimen-card__body">
                <div className="specimen-card__meta">
                  <span>{heroEntry.discipline}</span>
                  <span>{`${heroEntry.format} / ${heroEntry.year}`}</span>
                </div>
                <h2>{heroEntry.title}</h2>
                <p>{heroEntry.summary}</p>
                <Link href={`/work/${heroEntry.slug}`} className="text-link">
                  Open case study
                </Link>
              </div>
            </aside>
          </div>
        </HeroEntrance>
      </section>

      <section className="section page-shell">
        <div className="section-heading">
          <p className="eyebrow">Selected work</p>
          <h2>{home.selectedWork.heading}</h2>
          <p>{home.selectedWork.intro}</p>
        </div>
        <div className="feature-grid">
          {selectedEntries.map((entry) => (
            <WorkCard key={entry.slug} entry={entry} variant="feature" />
          ))}
        </div>
      </section>

      <section className="section page-shell spotlight">
        <div className="section-heading">
          <p className="eyebrow">In depth</p>
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

      <section className="section page-shell">
        <div className="section-heading">
          <p className="eyebrow">Capabilities</p>
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

      <section className="section page-shell">
        <div className="section-heading">
          <p className="eyebrow">Archive</p>
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

      <section id="contact" className="contact-section">
        <div className="page-shell contact-section__inner">
          <div className="section-heading">
            <p className="eyebrow">Contact</p>
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
              {renderLink(home.contact.primaryCta.href, home.contact.primaryCta.label, "primary")}
              {renderLink(home.contact.secondaryCta.href, home.contact.secondaryCta.label, "secondary")}
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
