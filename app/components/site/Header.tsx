"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Magnetic } from "./Magnetic";

export function Header({
  brandName,
}: {
  brandName: string;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  // The hero already shows the wordmark; reveal the header mark only once the
  // hero has scrolled away. On subpages it is always shown.
  const [markShown, setMarkShown] = useState(!isHome);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 18);
      // Home pins a tall fly-into-smoke intro; keep the bar bare until it clears.
      setMarkShown(!isHome || y > window.innerHeight * 0.95);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  // On the home hero, keep the bar minimal — only the Work/Contact nav shows
  // until the hero scrolls away; then the mark + bar surface reveal.
  const bare = isHome && !markShown;

  return (
    <header className={`site-header${scrolled ? " is-scrolled" : ""}${bare ? " is-bare" : ""}`}>
      <div className="site-header__inner">
        <Link href="/" className="site-mark" aria-label={brandName}>
          <span className="status-led" />
          <span
            className={`site-mark__text glitch${markShown ? " is-shown" : ""}`}
            data-text={brandName}
          >
            {brandName}
          </span>
        </Link>

        <nav className="site-nav" aria-label="Primary navigation">
          <Magnetic strength={0.5}>
            <Link
              href={isHome ? "#selected-work" : "/#selected-work"}
              className={pathname.startsWith("/work") ? "is-active" : ""}
              aria-current={pathname.startsWith("/work") ? "page" : undefined}
            >
              Work
            </Link>
          </Magnetic>
          <Magnetic strength={0.5}>
            <Link href="/#contact">Contact</Link>
          </Magnetic>
        </nav>
      </div>
    </header>
  );
}
