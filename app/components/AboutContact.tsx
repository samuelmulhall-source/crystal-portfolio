"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import DiscoverVisit from "./DiscoverVisit";

const SKILLS_3D = [
  "Blender", "Geometry Nodes", "Cycles / EEVEE",
  "Houdini", "EmberGen", "LiquiGen",
  "Substance Painter", "DaVinci Resolve",
];

export default function AboutContact() {
  const sectionRef = useRef<HTMLElement>(null);
  const [sent, setSent]   = useState(false);
  const [form, setForm]   = useState({ name: "", email: "", message: "" });

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
    setSent(true);
  };

  return (
    <section
      id="about"
      ref={sectionRef}
      style={{ position: "relative", background: "transparent", padding: "8rem 0 0" }}
    >
      <div style={{ maxWidth: "1060px", margin: "0 auto", padding: "0 2.5rem 9rem" }}>

        <p className="label reveal" style={{ marginBottom: "3.5rem" }}>02 — About & Contact</p>

        {/* ── Two-column unified layout ─────────────────────────────────── */}
        <div
          className="ac-grid"
          style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1fr",
            gap:                 "5.5rem",
            alignItems:          "start",
          }}
        >

          {/* ── Left: bio ─────────────────────────────────────────────── */}
          <div>
            <h2 className="heading-lg reveal" style={{ marginBottom: "2.4rem" }}>
              The detail is
              <br />
              the work.
            </h2>

            <p className="reveal" style={{
              color: "var(--text-secondary)", lineHeight: 1.85,
              fontSize: "0.895rem", marginBottom: "1.35rem",
            }}>
              Working across the full production pipeline since 2020. I build
              everything from detailed environments and animated intros to icons
              and experimental projects.
            </p>
            <p className="reveal" style={{
              color: "var(--text-secondary)", lineHeight: 1.85,
              fontSize: "0.895rem", marginBottom: "2.75rem",
            }}>
              While Blender is my primary hub, I&apos;m results-oriented and will
              use any software or technique required to hit the right look.
            </p>

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
                <p style={{ color: "var(--text-secondary)", fontSize: "0.855rem", lineHeight: 1.75, margin: 0 }}>
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
                <span className="label" style={{ color: "var(--ice)", letterSpacing: "0.28em" }}>
                  Message received — I&apos;ll reach out shortly.
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

      {/* Discover / Visit — full-width section before footer */}
      <DiscoverVisit />

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
