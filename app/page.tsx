import LitShowcase from "./components/lit/LitShowcase";
import { getSiteSettings } from "./lib/content";
import { getLitPieces } from "./lib/lit-pieces";

/** The site is one view: the index of every piece, each opening in place. */
export default function HomePage() {
  const site = getSiteSettings();
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
