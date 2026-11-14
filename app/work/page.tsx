import type { Metadata } from "next";
import LitShowcase from "../components/lit/LitShowcase";
import { getSiteSettings } from "../lib/content";
import { getLitPieces } from "../lib/lit-pieces";

const site = getSiteSettings();

export const metadata: Metadata = {
  title: "Work",
  description: "Models, rigged characters, video and image work — see everything at once or browse by category.",
  alternates: {
    canonical: `${site.deployment.siteUrl}/work`,
  },
  openGraph: {
    images: [site.seo.defaultOgImage],
  },
};

/** /work is the same index as the home page (older links keep working). */
export default function WorkPage() {
  return (
    <LitShowcase
      pieces={getLitPieces()}
      email={site.contact.primaryLabel}
      emailHref={site.contact.primaryHref}
      xHref={site.social.xUrl}
      start={{ view: "sheet" }}
    />
  );
}
