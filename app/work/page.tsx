import type { Metadata } from "next";
import { ArchiveFilters } from "../components/site/ArchiveFilters";
import { Footer } from "../components/site/Footer";
import { Header } from "../components/site/Header";
import { PageEntrance } from "../components/site/PageEntrance";
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

      <PageEntrance>
        <section className="subpage-hero page-shell">
          <p className="eyebrow" data-entrance="eyebrow">Archive</p>
          <h1 className="page-title" data-entrance="title">All work</h1>
        </section>

        <section className="section page-shell" data-entrance="content">
          <ArchiveFilters entries={entries} />
        </section>
      </PageEntrance>

      <Footer
        brandName={site.brand.name}
        xHandle={site.social.xHandle}
        xUrl={site.social.xUrl}
      />
    </main>
  );
}
