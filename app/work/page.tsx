import type { Metadata } from "next";
import { Footer } from "../components/site/Footer";
import { Header } from "../components/site/Header";
import { PageEntrance } from "../components/site/PageEntrance";
import { WorkShowcase } from "../components/site/WorkShowcase";
import { getSiteSettings, getWorkByCategory } from "../lib/content";

const site = getSiteSettings();

export const metadata: Metadata = {
  title: "Work",
  description: "Models, rigged characters, video and image work — browse by category.",
  alternates: {
    canonical: `${site.deployment.siteUrl}/work`,
  },
  openGraph: {
    images: [site.seo.defaultOgImage],
  },
};

export default function WorkPage() {
  const groups = getWorkByCategory();

  return (
    <main className="page-root page-root--sub">
      <Header brandName={site.brand.name} />

      <PageEntrance>
        <div data-entrance="content">
          <WorkShowcase groups={groups} />
        </div>
      </PageEntrance>

      <Footer
        brandName={site.brand.name}
        xHandle={site.social.xHandle}
        xUrl={site.social.xUrl}
      />
    </main>
  );
}
