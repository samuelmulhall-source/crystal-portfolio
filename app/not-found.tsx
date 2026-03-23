import Link from "next/link";
import { Footer } from "./components/site/Footer";
import { Header } from "./components/site/Header";
import { getSiteSettings } from "./lib/content";

export default function NotFound() {
  const site = getSiteSettings();

  return (
    <main className="page-root">
      <Header brandName={site.brand.name} />
      <section className="subpage-hero page-shell">
        <p className="eyebrow">Not found</p>
        <h1 className="page-title">That project is not in the current archive.</h1>
        <p className="lede">
          The portfolio has been rebuilt around a cleaner archive and case-study flow. Use the archive to keep browsing.
        </p>
        <Link className="button-link" href="/work">
          Open archive
        </Link>
      </section>
      <Footer
        brandName={site.brand.name}
        xHandle={site.social.xHandle}
        xUrl={site.social.xUrl}
      />
    </main>
  );
}
