import type { Metadata } from "next";
import { ArchiveFilters } from "../components/site/ArchiveFilters";
import { Footer } from "../components/site/Footer";
import { Header } from "../components/site/Header";
import { getSiteSettings, getWorkEntries } from "../lib/content";

const site = getSiteSettings();

export const metadata: Metadata = {
  title: "Work archive",
  description: "Full archive of motion pieces, still studies, and game-ready 3D assets.",
  alternates: {
    canonical: `${site.deployment.siteUrl}/work`,
  },
  openGraph: {
    images: [site.seo.defaultOgImage],
  },
};

export default function WorkArchivePage() {
  const entries = getWorkEntries();

  return (
    <main className="page-root">
      <Header brandName={site.brand.name} />

      <section className="subpage-hero page-shell">
        <p className="eyebrow">Archive</p>
        <h1 className="page-title">A browsable library of motion, stills, and supporting assets.</h1>
        <p className="lede">
          The archive is structured for fast scanning first. Featured case studies go deeper, while supporting work still stays easy to review without entering the old cinematic interface.
        </p>
      </section>

      <section className="section page-shell">
        <ArchiveFilters entries={entries} />
      </section>

      <Footer
        brandName={site.brand.name}
        xHandle={site.social.xHandle}
        xUrl={site.social.xUrl}
      />
    </main>
  );
}
