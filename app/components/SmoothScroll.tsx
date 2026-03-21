"use client";

/**
 * SmoothScroll now only exposes a simple viewport scroll helper.
 *
 * Lenis was removed because it softened the transition/lock states and fought
 * native viewport snap. The page now relies on native scroll + CSS snap.
 */

export const lenisInstance = {
  scrollTo(target: number, opts?: { immediate?: boolean; duration?: number }) {
    if (typeof window === "undefined") return;
    window.scrollTo({
      top: target,
      behavior: opts?.immediate ? "auto" : "smooth",
    });
  },
};

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
