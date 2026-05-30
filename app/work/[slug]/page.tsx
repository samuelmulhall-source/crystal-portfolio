import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer } from "../../components/site/Footer";
import { Header } from "../../components/site/Header";
import { MediaBlock } from "../../components/site/MediaBlock";
import { PageEntrance } from "../../components/site/PageEntrance";
import { SpecimenViewer } from "../../components/site/SpecimenViewer";
import { WorkCard } from "../../components/site/WorkCard";
import {
  getRelatedEntries,
  getSiteSettings,
  getWorkEntries,
  getWorkEntryBySlug,
} from "../../lib/content";

type WorkPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getWorkEntries().map((entry) => ({
    slug: entry.slug,
  }));
}

export async function generateMetadata({ params }: WorkPageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = getWorkEntryBySlug(slug);
  const site = getSiteSettings();

  if (!entry) {
    return {};
  }

  return {
    title: entry.seo.title,
    description: entry.seo.description,
    alternates: {
      canonical: `${site.deployment.siteUrl}/work/${entry.slug}`,
    },
    openGraph: {
      title: `${entry.title} | ${site.brand.name}`,
      description: entry.seo.description,
      images: [entry.seo.ogImage],
    },
    twitter: {
      images: [entry.seo.ogImage],
    },
  };
}

export default async function WorkDetailPage({ params }: WorkPageProps) {
  const { slug } = await params;
  const entry = getWorkEntryBySlug(slug);
  const site = getSiteSettings();

  if (!entry) {
    notFound();
  }

  const relatedEntries = getRelatedEntries(entry.slug);

  return (
    <main className="page-root">
      <Header brandName={site.brand.name} />

      <article className="case-study">
        <PageEntrance>
        <section className="case-study__hero page-shell">
          <div className="case-study__copy">
            <Link className="text-link text-link--muted" href="/work" data-entrance="eyebrow">
              Back to archive
            </Link>
            <p className="eyebrow" data-entrance="eyebrow">{entry.discipline}</p>
            <h1 className="page-title" data-entrance="title">{entry.title}</h1>
            <p className="lede" data-entrance="body">{entry.summary}</p>
            <div className="case-study__meta" data-entrance="content">
              <div>
                <span>Format</span>
                <strong>{entry.format}</strong>
              </div>
              <div>
                <span>Year</span>
                <strong>{entry.year}</strong>
              </div>
              <div>
                <span>Client</span>
                <strong>{entry.client}</strong>
              </div>
              <div>
                <span>Engagement</span>
                <strong>{entry.engagement}</strong>
              </div>
            </div>
            <ul className="tool-list">
              {entry.tools.map((tool) => (
                <li key={tool}>{tool}</li>
              ))}
            </ul>
          </div>

          {entry.specimen ? (
            <SpecimenViewer specimen={entry.specimen} alt={`${entry.title} interactive 3D model`} />
          ) : (
            <MediaBlock asset={entry.heroMedia} priority />
          )}
        </section>
        </PageEntrance>

        <section className="page-shell detail-grid">
          <div className="detail-grid__main">
            <div className="rich-copy">
              <p className="standfirst">{entry.caseStudy.hook}</p>
              {entry.caseStudy.brief.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <div className="section-stack">
              {entry.caseStudy.sections.map((section) => (
                <section key={section.title} className="story-section">
                  <h2>{section.title}</h2>
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </section>
              ))}
            </div>
          </div>

          <aside className="fact-panel">
            <div>
              <p className="eyebrow">Role</p>
              <ul className="fact-list">
                {entry.role.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow">Deliverables</p>
              <ul className="fact-list">
                {entry.caseStudy.deliverables.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow">Outcomes</p>
              <ul className="fact-list">
                {entry.caseStudy.outcomes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            {entry.interactive.note ? (
              <div className="fact-panel__note">
                <p className="eyebrow">Interactive</p>
                <p>{entry.interactive.note}</p>
              </div>
            ) : null}
          </aside>
        </section>

        {!entry.specimen && entry.gallery.length > 0 ? (
          <section className="section page-shell">
            <div className="section-heading">
              <p className="eyebrow">Gallery</p>
              <h2>Supporting frames and media</h2>
            </div>
            <div className="gallery-grid">
              {entry.gallery.map((asset, index) => (
                <MediaBlock key={`${entry.slug}-${asset.src}-${index}`} asset={asset} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="contact-section contact-section--compact">
          <div className="page-shell contact-section__inner">
            <div className="section-heading">
              <p className="eyebrow">Next step</p>
              <h2>Use this project as a reference for your brief.</h2>
              <p>
                If this direction feels relevant, send a note on X with the deliverable, timeframe, and where the work needs to live. I can respond with a tighter scope from there.
              </p>
            </div>
            <div className="contact-panel">
              <p className="contact-panel__availability">{site.contact.availability}</p>
              <div className="hero-actions">
                <a className="button-link" href={site.contact.primaryHref}>
                  {site.contact.primaryLabel}
                </a>
                <Link className="button-link button-link--ghost" href="/work">
                  Back to archive
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="section page-shell">
          <div className="section-heading">
            <p className="eyebrow">Related work</p>
            <h2>Continue browsing</h2>
          </div>
          <div className="feature-grid">
            {relatedEntries.map((relatedEntry) => (
              <WorkCard key={relatedEntry.slug} entry={relatedEntry} />
            ))}
          </div>
        </section>
      </article>

      <Footer
        brandName={site.brand.name}
        xHandle={site.social.xHandle}
        xUrl={site.social.xUrl}
      />
    </main>
  );
}
