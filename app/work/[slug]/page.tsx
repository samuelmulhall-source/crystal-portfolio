import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer } from "../../components/site/Footer";
import { Header } from "../../components/site/Header";
import { MediaBlock } from "../../components/site/MediaBlock";
import { PackViewer } from "../../components/site/PackViewer";
import { PageEntrance } from "../../components/site/PageEntrance";
import { SpecimenViewer } from "../../components/site/SpecimenViewer";
import {
  getModelFormat,
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

  // Don't repeat the hero media inside the gallery.
  const gallery = entry.gallery.filter((asset) => asset.src !== entry.heroMedia.src);

  return (
    <>
      {/* Outside <main> so <header>/<footer> keep their banner/contentinfo
          landmark roles (suppressed when nested inside a main landmark). */}
      <Header brandName={site.brand.name} />
      <main className="page-root">

      <article className="case-study">
        <PageEntrance>
        <section className="case-study__hero page-shell">
          <div className="case-study__copy">
            <Link className="text-link text-link--muted" href="/#selected-work" data-entrance="eyebrow">
              Back to work
            </Link>
            <p className="eyebrow" data-entrance="eyebrow">{entry.discipline}</p>
            <h1 className="page-title" data-entrance="title">{entry.title}</h1>
            <p className="lede" data-entrance="body">{entry.description ?? entry.summary}</p>
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
            {entry.tools.length > 0 ? (
              <ul className="tool-list">
                {entry.tools.map((tool) => (
                  <li key={tool}>{tool}</li>
                ))}
              </ul>
            ) : null}
          </div>

          {entry.assets?.length ? (
            <PackViewer assets={entry.assets} packTitle={entry.title} />
          ) : entry.specimen ? (
            <SpecimenViewer
              specimen={entry.specimen}
              alt={`${entry.title} interactive 3D model`}
              allowZoom
            />
          ) : (
            <MediaBlock asset={entry.heroMedia} priority />
          )}
        </section>
        </PageEntrance>

        {!entry.specimen && gallery.length > 0 ? (
          <section className="section page-shell">
            <div className="section-heading">
              <p className="eyebrow">Gallery</p>
              <h2>Supporting frames and media</h2>
            </div>
            <div className="gallery-grid">
              {gallery.map((asset, index) => (
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
              <div className="contact-actions">
                <a className="button-link" href={site.contact.primaryHref}>
                  {site.contact.primaryLabel}
                </a>
                <Link className="button-link button-link--ghost" href="/work">
                  View all work
                </Link>
              </div>
            </div>
          </div>
        </section>
      </article>

      </main>
      <Footer
        brandName={site.brand.name}
        xHandle={site.social.xHandle}
        xUrl={site.social.xUrl}
      />
    </>
  );
}
