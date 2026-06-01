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
  getModelFormat,
  getRelatedEntries,
  getSiteSettings,
  getSpecimenMaps,
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
                <span>Made</span>
                <strong>{entry.created ?? entry.year}</strong>
              </div>
              {entry.specimen ? (
                <div>
                  <span>Geometry</span>
                  <strong>{getModelFormat(entry.specimen.modelPath)} · realtime</strong>
                </div>
              ) : null}
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
            {entry.description?.trim() ? (
              <div className="rich-copy">
                <p className="eyebrow">Overview</p>
                <p className="standfirst">{entry.description}</p>
              </div>
            ) : null}

            <div className="section-stack">
              <section className="story-section">
                <h2>How it was made</h2>
                <div className="spec-grid">
                  <div>
                    <span>Software</span>
                    <strong>{entry.tools.join(" · ")}</strong>
                  </div>
                  <div>
                    <span>Discipline</span>
                    <strong>{entry.discipline}</strong>
                  </div>
                  {entry.specimen ? (
                    <>
                      <div>
                        <span>Geometry</span>
                        <strong>{getModelFormat(entry.specimen.modelPath)} · realtime mesh</strong>
                      </div>
                      <div>
                        <span>Texture set</span>
                        <strong>{getSpecimenMaps(entry.specimen).join(" · ")} · PBR</strong>
                      </div>
                    </>
                  ) : (
                    <div>
                      <span>Output</span>
                      <strong>{entry.format}</strong>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>

          <aside className="fact-panel">
            <div>
              <p className="eyebrow">Made</p>
              <ul className="fact-list">
                <li>{entry.created ?? entry.year}</li>
              </ul>
            </div>
            <div>
              <p className="eyebrow">Role</p>
              <ul className="fact-list">
                {entry.role.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow">Tools</p>
              <ul className="fact-list">
                {entry.tools.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            {entry.specimen ? (
              <div>
                <p className="eyebrow">Maps</p>
                <ul className="fact-list">
                  {getSpecimenMaps(entry.specimen).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
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
              <p className="eyebrow">Enquire</p>
              <h2>Commission or collaborate</h2>
              <p>Send the deliverable, timeframe, and where it needs to ship — I&apos;ll come back with scope.</p>
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
            <p className="eyebrow">More</p>
            <h2>Related work</h2>
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
