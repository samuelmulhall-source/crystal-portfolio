"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const SKILLS_3D = [
  "Blender", "Geometry Nodes", "Cycles / EEVEE",
  "Houdini", "EmberGen", "LiquiGen",
  "Substance Painter", "DaVinci Resolve",
];

export default function AboutContact() {
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef    = useRef<HTMLDivElement>(null);
  const [sent, setSent]   = useState(false);
  const [form, setForm]   = useState({ name: "", email: "", message: "" });

  // ── 3D perspective tilt on the grid ──────────────────────────────────────
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    // Only on desktop
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let tx = 0, ty = 0;
    let mx = 0, my = 0;
    let raf: number;

    const onMove = (e: MouseEvent) => {
      const rect = grid.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;
      mx = ((e.clientY - cy) / window.innerHeight) * -1.5;
      my = ((e.clientX - cx) / window.innerWidth)  *  1.5;
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      tx += (mx - tx) * 0.055;
      ty += (my - ty) * 0.055;
      grid.style.transform = `perspective(1800px) rotateX(${tx.toFixed(3)}deg) rotateY(${ty.toFixed(3)}deg)`;
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    sectionRef.current?.querySelectorAll(".reveal").forEach((el, i) => {
      gsap.fromTo(el,
        { opacity: 0, y: 28 },
        {
          opacity: 1, y: 0,
          duration: 0.92, ease: "power2.out",
          delay: i * 0.045,
          scrollTrigger: {
            trigger: el,
            start: "top 88%",
            toggleActions: "play none none reverse",
          },
        }
      );
    });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`Portfolio enquiry — ${form.name}`);
    const body = encodeURIComponent(`Name: ${form.name}\nEmail: ${form.email}\n\n${form.message}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setSent(true);
  };

  return (
    <section
      id="about"
      ref={sectionRef}
      className="section-panel"
      style={{ position: "relative", padding: "8rem 0 0" }}
    >
      <div style={{ maxWidth: "1060px", margin: "0 auto", padding: "0 2.5rem 9rem" }}>

        <p className="label reveal" style={{ marginBottom: "3.5rem" }}>02 — About & Contact</p>

        {/* ── Two-column unified layout ─────────────────────────────────── */}
        <div
          ref={gridRef}
          className="ac-grid"
          style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1fr",
            gap:                 "5.5rem",
            alignItems:          "start",
            transformStyle:      "preserve-3d",
            willChange:          "transform",
          }}
        >

          {/* ── Left: bio ─────────────────────────────────────────────── */}
          <div>
            <h2 className="heading-lg reveal" style={{ marginBottom: "2.4rem" }}>
              The detail is
              <br />
              the work.
            </h2>

            <div style={{ borderLeft: "1px solid rgba(184,240,255,0.10)", paddingLeft: "1.4rem" }}>
              <p className="reveal" style={{
                color: "var(--text-secondary)", lineHeight: 2.0, fontWeight: 400,
                fontSize: "clamp(0.9rem, 1.2vw, 0.95rem)", marginBottom: "1.35rem",
              }}>
                Working across the full production pipeline since 2020. I build
                everything from detailed environments and animated intros to icons
                and experimental projects.
              </p>
              <p className="reveal" style={{
                color: "var(--text-secondary)", lineHeight: 2.0, fontWeight: 400,
                fontSize: "clamp(0.9rem, 1.2vw, 0.95rem)", marginBottom: "2.75rem",
              }}>
                While Blender is my primary hub, I&apos;m results-oriented and will
                use any software or technique required to hit the right look.
              </p>
            </div>

            <a
              href="https://x.com/multiscatter"
              target="_blank"
              rel="noopener noreferrer"
              className="void-btn reveal"
            >
              ↗ @multiscatter on X
            </a>
          </div>

          {/* ── Right: toolset + contact ──────────────────────────────── */}
          {/* id="contact" here so the nav Contact link scrolls to this column */}
          <div id="contact">

            {/* Toolset */}
            <div style={{ marginBottom: "3rem" }}>
              <p className="label reveal" style={{ marginBottom: "0.9rem" }}>3D Toolset</p>
              <div className="reveal" style={{ display: "flex", flexWrap: "wrap", gap: "0.42rem", marginBottom: "2rem" }}>
                {SKILLS_3D.map(s => <span key={s} className="skill-tag">{s}</span>)}
              </div>
              <div
                className="reveal"
                style={{ borderLeft: "1px solid rgba(184,240,255,0.10)", paddingLeft: "1.2rem" }}
              >
                <p className="label" style={{ marginBottom: "0.5rem" }}>Available for</p>
                <p style={{ color: "var(--text-secondary)", fontSize: "clamp(0.85rem, 1.1vw, 0.9rem)", lineHeight: 1.75, margin: 0 }}>
                  Commissions, collaborations, discussions, and experiments welcome.
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="void-divider reveal" style={{ marginBottom: "2.5rem" }} />

            {/* Contact form */}
            <div className="reveal" style={{ marginBottom: "1.6rem" }}>
              <a
                href="https://x.com/multiscatter"
                target="_blank"
                rel="noopener noreferrer"
                className="void-btn"
              >
                ↗ DM on X — @multiscatter
              </a>
            </div>

            {sent ? (
              <div style={{
                padding: "1.6rem", marginTop: "1.2rem",
                border: "1px solid rgba(184,240,255,0.14)", borderRadius: "2px",
                textAlign: "center", background: "rgba(184,240,255,0.025)",
              }}>
                <span className="label" style={{ color: "var(--ice)", letterSpacing: "0.28em", display: "block", marginBottom: "0.6rem" }}>
                  Your email client should have opened.
                </span>
                <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: "0.6rem", letterSpacing: "0.18em", color: "rgba(184,240,255,0.45)" }}>
                  Alternatively, DM @multiscatter on X.
                </span>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="reveal"
                style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginTop: "1.2rem" }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
                  <input
                    required type="text" placeholder="Name"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="void-input"
                  />
                  <input
                    required type="email" placeholder="Email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="void-input"
                  />
                </div>
                <textarea
                  required rows={4} placeholder="What are you working on?"
                  value={form.message}
                  onChange={e => setForm({ ...form, message: e.target.value })}
                  className="void-input"
                />
                <button type="submit" className="void-btn" style={{ alignSelf: "flex-start" }}>
                  Send message ↗
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: "1px solid rgba(184,240,255,0.06)",
        padding: "1.6rem 2rem",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        maxWidth: "1100px", margin: "0 auto",
      }}>
        <span style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: "0.555rem", letterSpacing: "0.26em",
          textTransform: "uppercase", color: "var(--text-muted)",
        }}>
          © 2026 Multiscatter
        </span>
        <a href="https://x.com/multiscatter" target="_blank" rel="noopener noreferrer" className="frost-link">
          @multiscatter
        </a>
      </div>

      <style>{`
        @media (max-width: 760px) {
          .ac-grid { grid-template-columns: 1fr !important; gap: 3.5rem !important; }
        }
      `}</style>
    </section>
  );
}
