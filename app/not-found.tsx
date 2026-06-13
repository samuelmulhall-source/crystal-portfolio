import Link from "next/link";
import { Footer } from "./components/site/Footer";
import { Header } from "./components/site/Header";
import { getSiteSettings } from "./lib/content";

export default function NotFound() {
  const site = getSiteSettings();

  return (
    <main className="page-root page-root--sub">
      <Header brandName={site.brand.name} />
      <section className="subpage-hero page-shell">
        <p className="eyebrow">Not found</p>
        <h1 className="page-title">That page does not exist.</h1>
        <p className="lede">
          The link may be old or mistyped. Everything current lives in the work showcase.
        </p>
        <Link className="button-link" href="/work">
          View work
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
