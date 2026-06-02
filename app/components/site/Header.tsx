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
