"use client";

/**
 * AboutContact — Terminal destination of the journey.
 *
 * Styled as the final chamber: a contained terminal panel that feels like
 * arriving at the deepest point of the void, not a conventional footer.
 * The section fades in from the starfield with a gradient mask and uses
 * the same monospace + ice-blue language as the rest of the experience.
 */

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
  const [sent, setSent]   = useState(false);
  const [form, setForm]   = useState({ name: "", email: "", message: "" });

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    sectionRef.current?.querySelectorAll(".reveal").forEach((el, i) => {
      gsap.fromTo(el,
        { opacity: 0, y: 24 },
        {
          opacity: 1, y: 0,
          duration: 0.85, ease: "power2.out",
          delay: i * 0.04,
          scrollTrigger: {
            trigger: el,
            start: "top 90%",
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
      style={{
        position: "relative",
        zIndex: 2,
        // Subtle top divider connecting to the station journey aesthetic
        borderTop: "1px solid rgba(184,240,255,0.06)",
        // Fade from transparent starfield into solid void
        background: "linear-gradient(180deg, rgba(5,7,15,0) 0%, rgba(5,7,15,0.7) 6%, rgba(5,7,15,0.95) 14%, #05070f 28%)",
        padding: "6rem 0 0",
      }}
    >
      {/* Terminal container — the "final chamber" */}
      <div style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "0 2rem 6rem",
      }}>

        {/* Terminal header bar */}
        <div className="reveal" style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "2.5rem",
          paddingBottom: "0.6rem",
          borderBottom: "1px solid rgba(184,240,255,0.08)",
        }}>
          <span style={{
            width: "6px", height: "6px",
            borderRadius: "50%",
            background: "rgba(184,240,255,0.5)",
            boxShadow: "0 0 8px rgba(184,240,255,0.3)",
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "0.44rem",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "rgba(184,240,255,0.4)",
          }}>
            END OF LINE — TERMINAL ACCESS
          </span>
          <span style={{
            flex: 1, height: "1px",
            background: "linear-gradient(90deg, rgba(184,240,255,0.12), transparent 70%)",
          }} />
        </div>

        {/* ── Two-column layout ── */}
        <div className="ac-grid" style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "4rem",
          alignItems: "start",
        }}>

          {/* Left: identity */}
          <div>
            <h2 className="heading-lg reveal" style={{ marginBottom: "2rem" }}>
              The detail is
              <br />
              the work.
            </h2>

            <div style={{
              borderLeft: "1px solid rgba(184,240,255,0.08)",
              paddingLeft: "1.2rem",
            }}>
              <p className="reveal" style={{
                color: "var(--text-secondary)", lineHeight: 1.9, fontWeight: 400,
                fontSize: "clamp(0.88rem, 1.15vw, 0.94rem)", marginBottom: "1.2rem",
              }}>
                Working across the full production pipeline since 2020. I build
                everything from detailed environments and animated intros to icons
                and experimental projects.
              </p>
              <p className="reveal" style={{
                color: "var(--text-secondary)", lineHeight: 1.9, fontWeight: 400,
                fontSize: "clamp(0.88rem, 1.15vw, 0.94rem)", marginBottom: "2.2rem",
              }}>
                While Blender is my primary hub, I&apos;m results-oriented and will
                use any software or technique required to hit the right look.
              </p>
            </div>

            {/* Toolset */}
            <div className="reveal" style={{ marginBottom: "1.8rem" }}>
              <p className="label" style={{ marginBottom: "0.7rem" }}>Toolset</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.38rem" }}>
                {SKILLS_3D.map(s => <span key={s} className="skill-tag">{s}</span>)}
              </div>
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

          {/* Right: contact terminal */}
          <div id="contact">
            <div className="reveal" style={{
              background: "linear-gradient(145deg, rgba(8,14,32,0.6) 0%, rgba(4,8,20,0.75) 100%)",
              border: "1px solid rgba(184,240,255,0.06)",
              borderRadius: "4px",
              padding: "1.8rem",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,12,0.4)",
            }}>
              {/* Terminal prompt header */}
              <div style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                marginBottom: "1.4rem",
                paddingBottom: "0.6rem",
                borderBottom: "1px solid rgba(184,240,255,0.05)",
              }}>
                <span style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: "0.44rem",
                  letterSpacing: "0.2em",
                  color: "rgba(184,240,255,0.45)",
                  textTransform: "uppercase",
                }}>
                  TRANSMIT MESSAGE
                </span>
              </div>

              <p style={{
                color: "var(--text-secondary)",
                fontSize: "clamp(0.82rem, 1vw, 0.88rem)",
                lineHeight: 1.7,
                marginBottom: "1.4rem",
              }}>
                Commissions, collaborations, discussions, and experiments welcome.
              </p>

              <div style={{ marginBottom: "1.2rem" }}>
                <a
                  href="https://x.com/multiscatter"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="void-btn"
                  style={{ fontSize: "0.72rem" }}
                >
                  ↗ DM on X — @multiscatter
                </a>
              </div>

              {/* Divider */}
              <div style={{
                height: "1px",
                background: "linear-gradient(90deg, rgba(184,240,255,0.08), transparent)",
                margin: "1.2rem 0",
              }} />

              {sent ? (
                <div style={{
                  padding: "1.2rem",
                  border: "1px solid rgba(184,240,255,0.1)",
                  borderRadius: "2px",
                  textAlign: "center",
                  background: "rgba(184,240,255,0.02)",
                }}>
                  <span className="label" style={{
                    color: "var(--ice)", letterSpacing: "0.24em",
                    display: "block", marginBottom: "0.4rem",
                  }}>
                    Message prepared
                  </span>
                  <span style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: "0.55rem", letterSpacing: "0.15em",
                    color: "rgba(184,240,255,0.4)",
                  }}>
                    Your email client should have opened.
                  </span>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem" }}>
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
                    required rows={3} placeholder="What are you working on?"
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
      </div>

      {/* Footer — minimal terminal line */}
      <div style={{
        borderTop: "1px solid rgba(184,240,255,0.04)",
        padding: "1.2rem 2rem",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        maxWidth: "960px", margin: "0 auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="status-led" />
          <span style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "0.5rem", letterSpacing: "0.22em",
            textTransform: "uppercase", color: "var(--text-muted)",
          }}>
            © 2026 Multiscatter
          </span>
        </div>
        <a href="https://x.com/multiscatter" target="_blank" rel="noopener noreferrer" className="frost-link">
          @multiscatter
        </a>
      </div>

      <style>{`
        @media (max-width: 760px) {
          .ac-grid { grid-template-columns: 1fr !important; gap: 2.5rem !important; }
        }
      `}</style>
    </section>
  );
}
