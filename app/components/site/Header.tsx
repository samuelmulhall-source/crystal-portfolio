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
      setMarkShown(!isHome || y > window.innerHeight * 0.72);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  return (
    <header className={`site-header${scrolled ? " is-scrolled" : ""}`}>
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
            <Link href="/work" className={pathname.startsWith("/work") ? "is-active" : ""}>
              Work
            </Link>
          </Magnetic>
          <Magnetic strength={0.5}>
            <Link href="/#contact" className={pathname === "/#contact" ? "is-active" : ""}>
              Contact
            </Link>
          </Magnetic>
        </nav>
      </div>
    </header>
  );
}
