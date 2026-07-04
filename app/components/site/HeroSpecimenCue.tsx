"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useHeroFocus } from "./HeroFocus";

const SCRAMBLE_GLYPHS = "ABCDEFGHIJKLMNPQRSTUVWXYZ0123456789#%*+<>/\\";

/**
 * ScrambleText — a "decode" transition between two strings. While `active`, each
 * character position holds a run of random glyphs then resolves to the target,
 * staggered left-to-right, so the label appears to decrypt from one phrase into
 * another. Frame-count driven (≈0.6s), and it respects reduced motion by
 * snapping to the resolved text. Purely visual; the link carries a stable
 * aria-label, so assistive tech never sees the churn.
 */
function ScrambleText({ from, to, active }: { from: string; to: string; active: boolean }) {
  const [out, setOut] = useState(from);
  const raf = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const target = active ? to : from;
    if (
      !active ||
      (typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ) {
      // Snap to the resolved text (no animation) — matches the resting state, so
      // on mount this is a no-op; on toggle it's a deliberate one-shot sync.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOut(target);
      return;
    }
    const src = active ? from : to;
    const len = Math.max(src.length, to.length, from.length);
    // Pad with NBSP (not plain space) so the mono chip keeps a constant width
    // through the morph — trailing regular spaces collapse and reflow the chip.
    const s = src.padEnd(len, " ");
    const t = target.padEnd(len, " ");
    const q = Array.from({ length: len }, (_, i) => ({
      s: s[i],
      t: t[i],
      start: Math.floor(Math.random() * 12) + Math.floor((i / len) * 10),
      end: 0,
      char: "",
    }));
    q.forEach((c) => { c.end = c.start + 8 + Math.floor(Math.random() * 14); });

    let frame = 0;
    const tick = () => {
      let done = 0;
      let str = "";
      for (const c of q) {
        if (frame >= c.end) { done++; str += c.t; }
        else if (frame >= c.start) {
          if (!c.char || Math.random() < 0.3) {
            c.char = SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)];
          }
          str += c.char;
        } else str += c.s;
      }
      setOut(str);
      if (done === q.length) return;
      frame += 1;
      raf.current = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf.current);
  }, [active, from, to]);

  // Rendered as-is (NBSP-padded) so the mono chip holds a constant width across
  // the morph; trimming would let the shorter "from" string reflow it.
  return <>{out || " "}</>;
}

/**
 * HeroSpecimenCue — a considered "doorway" from the hero lantern into its own
 * entry in the work showcase.
 *
 * As the pointer nears the lantern the surroundings recede in proportion — a
 * continuous proximity field (nearest-edge distance to the lantern, eased),
 * not an on/off hover. On actual hover/focus the name chip and a line-art
 * descent trail commit fully — signalling that selecting the object takes you
 * DOWN into the work. Clicking smooth-scrolls to #selected-work (Lenis handles
 * same-page anchors) AND asks the showcase to open THIS specimen's own
 * category/slide via a `work:focus` event, so you land on the piece, not the
 * default Models tab.
 *
 * It renders as an <a>, inheriting `.hero-intro a { pointer-events: auto }`
 * without re-enabling pointer events on any larger container. Like the lantern
 * it overlays, it lives inside the wrap the intro dive transforms off-screen,
 * so it never overlays (and eats clicks meant for) the work section rising
 * behind the pinned hero. The always-visible scroll cue + header link remain
 * the primary path; this is an additive affordance.
 */
export const WORK_FOCUS_EVENT = "work:focus";

/** Distance (px) from the lantern's edge at which the recede begins. */
const PROXIMITY_RADIUS = 360;

export function HeroSpecimenCue({
  slug,
  title,
  children,
}: {
  slug: string;
  title: string;
  /** The masked .hero-viewport (lantern). Wrapped so the overlay link can size
   *  to the lantern exactly, while staying OUTSIDE the viewport's dissolve mask. */
  children: ReactNode;
}) {
  const { focusing, setFocusing, setProximity } = useHeroFocus();
  const linkRef = useRef<HTMLAnchorElement>(null);

  // Pointer-proximity field: 0 beyond PROXIMITY_RADIUS from the lantern's
  // nearest edge, easing (smoothstep) to 1 at the edge. Fine pointers only —
  // touch has no meaningful proximity (and the doorway itself is hidden
  // there via CSS). Handler-direct style writes (via context) keep this off
  // React's render path; one getBoundingClientRect per move on one element is
  // the same class of work as the Magnetic hover effect.
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      const el = linkRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Off-screen (the intro dive translates the wrap away) → no field.
      if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) {
        setProximity(0);
        return;
      }
      const dx = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0;
      const dy = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
      const d = Math.hypot(dx, dy);
      const p = 1 - Math.min(d / PROXIMITY_RADIUS, 1);
      setProximity(p * p * (3 - 2 * p)); // smoothstep — gentle far, decisive near
    };
    const onLeave = () => setProximity(0);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      setProximity(0);
    };
  }, [setProximity]);

  return (
    <div className={`hero-specimen${focusing ? " is-focusing" : ""}`}>
      {children}

      <a
        ref={linkRef}
        className="hero-specimen__link"
        href="#selected-work"
        aria-label={`See ${title} in selected work`}
        onPointerEnter={() => setFocusing(true)}
        onPointerLeave={() => setFocusing(false)}
        onFocus={() => setFocusing(true)}
        onBlur={() => setFocusing(false)}
        onClick={() => {
          setFocusing(false);
          setProximity(0);
          window.dispatchEvent(new CustomEvent(WORK_FOCUS_EVENT, { detail: { slug } }));
        }}
      >
        <span className="hero-specimen__cue">
          <span className="hero-specimen__cue-tick" aria-hidden="true" />
          <span className="hero-specimen__cue-label" aria-hidden="true">
            <ScrambleText from="MULTISCATTER" to={title} active={focusing} />
          </span>
        </span>
      </a>

      {/* Line-art descent current — a thin guide with geometric marks flowing
          down toward the work below. Decorative; pointer-events: none. */}
      <span className="hero-specimen__descent" aria-hidden="true">
        <span className="hero-specimen__descent-line" />
        <span className="hero-specimen__descent-mark" />
        <span className="hero-specimen__descent-mark" />
        <span className="hero-specimen__descent-mark" />
      </span>
    </div>
  );
}
