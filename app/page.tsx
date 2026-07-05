import Link from "next/link";
import { Footer } from "./components/site/Footer";
import { Header } from "./components/site/Header";
import { HeroEyebrow } from "./components/site/HeroEyebrow";
import { HeroFocusProvider } from "./components/site/HeroFocus";
import { HeroIntro } from "./components/site/HeroIntro";
import { HeroSpecimenCue } from "./components/site/HeroSpecimenCue";
import { HeroWordmark } from "./components/site/HeroWordmark";
import { SpecimenPreview } from "./components/site/SpecimenPreview";
import { WorkShowcase } from "./components/site/WorkShowcase";
import {
  getHomeContent,
  getSiteSettings,
  getWorkByCategory,
  getWorkEntryBySlug,
} from "./lib/content";

export default function HomePage() {
  const site = getSiteSettings();
  const home = getHomeContent();
  const heroEntry = getWorkEntryBySlug(home.hero.featuredSlug);
  const workGroups = getWorkByCategory();

  if (!heroEntry) {
    throw new Error("Home content references a missing work entry.");
  }

  return (
    <>
      {/* Outside <main> so <header>/<footer> keep their banner/contentinfo
          landmark roles (suppressed when nested inside a main landmark). */}
      <Header brandName={site.brand.name} />
      <main className="page-root">

      {/* ═══ HERO — pinned fly-into-smoke intro, asymmetric split ═══ */}
      <HeroIntro>
        <HeroFocusProvider>
        <div className="hero-grid">
          <div className="hero-core hero-core--left" data-parallax="0.16" data-hero-fade="text">
            {home.hero.capabilities?.length ? (
              <HeroEyebrow text={home.hero.capabilities.join("  ·  ")} />
            ) : null}
            <h1 className="hero-wordmark" data-hero-entrance="title">
              <HeroWordmark text={home.hero.title} target={heroEntry.title} />
            </h1>
          </div>

          <div className="hero-viewport-wrap" data-parallax="0.06" data-hero-fade="asset">
            {/* The lantern is a hover/focus doorway into its own showcase entry. */}
            <HeroSpecimenCue slug={heroEntry.slug} title={heroEntry.title}>
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
            </HeroSpecimenCue>
          </div>
        </div>

        {home.hero.scrollCue ? (
          <a className="hero-scroll-cue" href="#selected-work" data-hero-entrance="lead" data-hero-fade="cue">
            <span>{home.hero.scrollCue}</span>
            <span className="hero-scroll-cue__arrow" aria-hidden="true">↓</span>
          </a>
        ) : null}
        </HeroFocusProvider>
      </HeroIntro>

      {/* ═══ WORK — category-tabbed asset browser ═══ */}
      <WorkShowcase groups={workGroups} />

      {/* ═══ CONTACT / ABOUT ═══ */}
      <section id="contact" className="contact-section">
        <div className="page-shell contact-section__inner">
          <div className="section-head">
            <h2 className="section-head__title">{home.contact.heading}</h2>
            {home.contact.availability ? (
              <span className="contact-status">
                <span className="status-led" aria-hidden="true" />
                {home.contact.availability}
              </span>
            ) : null}
          </div>
          <dl className="contact-meta">
            <div>
              <dt>Discipline</dt>
              <dd>{site.brand.studioLabel}</dd>
            </div>
            <div>
              <dt>Based</dt>
              <dd>{site.brand.location}</dd>
            </div>
          </dl>
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

      </main>
      <Footer
        brandName={site.brand.name}
        xHandle={site.social.xHandle}
        xUrl={site.social.xUrl}
      />
    </>
  );
}
