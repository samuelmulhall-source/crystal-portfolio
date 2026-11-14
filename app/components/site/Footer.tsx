import Link from "next/link";

export function Footer({
  brandName,
  xHandle,
  xUrl,
  emailHref,
}: {
  brandName: string;
  xHandle: string;
  xUrl: string;
  /** mailto: link from site settings — omitted on pages that don't pass it. */
  emailHref?: string;
}) {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="site-footer__mark">{brandName}</p>
        <div className="site-footer__links">
          <Link href="/work">Work</Link>
          <Link href="/#contact">Contact</Link>
          {emailHref ? <a href={emailHref}>Email</a> : null}
          <a href={xUrl} target="_blank" rel="noreferrer">
            {xHandle}
          </a>
        </div>
      </div>
    </footer>
  );
}
