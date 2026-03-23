import Link from "next/link";

export function Footer({
  brandName,
  xHandle,
  xUrl,
}: {
  brandName: string;
  xHandle: string;
  xUrl: string;
}) {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p>{brandName} builds atmospheric 3D work with a bias toward clarity, presentation, and repeatable craft.</p>
        <div className="site-footer__links">
          <Link href="/work">Archive</Link>
          <a href={xUrl} target="_blank" rel="noreferrer">
            {xHandle}
          </a>
        </div>
      </div>
    </footer>
  );
}
