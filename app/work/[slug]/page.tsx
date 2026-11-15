import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LitShowcase from "../../components/lit/LitShowcase";
import { getHomeContent, getSiteSettings, getWorkEntries, getWorkEntryBySlug } from "../../lib/content";
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
    artform: entry.category ?? (entry.specimen ? "3D model" : entry.heroMedia.kind === "video" ? "Video" : "Digital image"),
    ...(entry.facts ? { width: `${entry.facts.width} px`, height: `${entry.facts.height} px` } : {}),
    associatedMedia: entry.specimen
      ? (entry.assets?.length ? entry.assets.map((a) => a.specimen) : [entry.specimen]).map((sp) => ({
          "@type": "3DModel",
          contentUrl: `${site.deployment.siteUrl}${encodeURI(sp.modelPath)}`,
          encodingFormat: sp.modelPath.toLowerCase().endsWith(".glb") ? "model/gltf-binary" : "application/octet-stream",
        }))
      : entry.heroMedia.kind === "video" || entry.gallery.some((g) => g.kind === "video")
        ? {
            "@type": "VideoObject",
            name: entry.title,
            contentUrl: `${site.deployment.siteUrl}${encodeURI((entry.gallery.find((g) => g.kind === "video") ?? entry.heroMedia).src)}`,
            thumbnailUrl: `${site.deployment.siteUrl}${entry.seo.ogImage}`,
            ...(entry.facts?.duration ? { duration: `PT${Math.round(entry.facts.duration)}S` } : {}),
          }
        : {
            "@type": "ImageObject",
            contentUrl: `${site.deployment.siteUrl}${encodeURI(entry.heroMedia.src)}`,
            ...(entry.facts ? { width: entry.facts.width, height: entry.facts.height } : {}),
          },
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
        intro={getHomeContent().intro}
        titles={{ default: site.seo.defaultTitle, template: site.seo.titleTemplate }}
        start={{ view: "frame", slug: entry.slug }}
      />
    </>
  );
}
