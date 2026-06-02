"use client";

/**
 * Magnetic — wraps an interactive element so it eases toward the cursor while
 * hovered, then springs back on leave. Inline-block; CSS handles the return
 * transition. Disabled under reduced motion / coarse pointers.
 */

import { useRef, type ReactNode } from "react";

export function Magnetic({
  children,
  strength = 0.35,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)").matches) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
  };

  const reset = () => {
    if (ref.current) ref.current.style.transform = "";
  };

  return (
    <span
      ref={ref}
      className={`magnetic${className ? ` ${className}` : ""}`}
      onMouseMove={onMove}
      onMouseLeave={reset}
    >
      {children}
    </span>
  );
}
