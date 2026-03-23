"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DisplayModeToggle } from "./DisplayModeToggle";

export function Header({
  brandName,
}: {
  brandName: string;
}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`site-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="site-header__inner">
        <Link href="/" className="site-mark">
          <span className="status-led" />
          <span className="site-mark__text glitch" data-text={brandName}>{brandName}</span>
          <span className="site-mark__status">AU / atmospheric direction</span>
        </Link>

        <nav className="site-nav" aria-label="Primary navigation">
          <Link href="/" className={pathname === "/" ? "is-active" : ""}>
            Home
          </Link>
          <Link href="/work" className={pathname.startsWith("/work") ? "is-active" : ""}>
            Work
          </Link>
          <Link href="/#contact">Contact</Link>
        </nav>

        <DisplayModeToggle />
      </div>
    </header>
  );
}
