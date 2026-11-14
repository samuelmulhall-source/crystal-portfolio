import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LitShowcase from "../../components/lit/LitShowcase";
import { getSiteSettings, getWorkEntries, getWorkEntryBySlug } from "../../lib/content";
import { getLitPieces } from "../../lib/lit-pieces";

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

/** A piece's own address: the same showcase, opened on that piece. It exists
 *  for sharing and search (per-piece title, description, image, JSON-LD) —
 *  nothing in the showcase links here; pieces open in place. */
export default async function WorkDetailPage({ params }: WorkPageProps) {
  const { slug } = await params;
  const entry = getWorkEntryBySlug(slug);
  const site = getSiteSettings();

  if (!entry) {
    notFound();
  }

  // JSON-LD for this piece — pairs with the site-level Person/WebSite graph in
  // layout.tsx. `<` escaped so content strings can never close the script.
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "VisualArtwork",
    name: entry.title,
    description: entry.seo.description,
    image: `${site.deployment.siteUrl}${entry.seo.ogImage}`,
    url: `${site.deployment.siteUrl}/work/${entry.slug}`,
    dateCreated: entry.created ?? entry.year,
    creator: {
      "@type": "Person",
      name: site.brand.name,
      url: site.deployment.siteUrl,
    },
  }).replace(/</g, "\\u003c");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      <LitShowcase
        pieces={getLitPieces()}
        email={site.contact.primaryLabel}
        emailHref={site.contact.primaryHref}
        xHref={site.social.xUrl}
        start={{ view: "frame", slug: entry.slug }}
      />
    </>
  );
}
