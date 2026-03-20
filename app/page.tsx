import { Suspense } from "react";
import VoidBackground    from "./components/VoidBackground";
import CrystalCorridor   from "./components/CrystalCorridor";
import EffectsOverlay    from "./components/EffectsOverlay";
import LoadingTerminal   from "./components/LoadingTerminal";
import CursorFollower    from "./components/CursorFollower";
import HUDCorners        from "./components/HUDCorners";
import Hero              from "./components/Hero";
import WorkGrid          from "./components/WorkGrid";
import AboutContact      from "./components/AboutContact";
import Nav               from "./components/Nav";
import WeaponHUD         from "./components/WeaponHUD";
import ScrollTracker     from "./components/ScrollTracker";
import { STATIONS, TOTAL_SCROLL_VH } from "./lib/journeyConfig";

export default function Home() {
  return (
    <>
      {/* Skip link for keyboard users */}
      <a href="#work" className="skip-link">Skip to content</a>

      <LoadingTerminal />
      <CursorFollower />
      <HUDCorners />
      <Suspense fallback={<div style={{ position: "fixed", inset: 0, zIndex: 0, background: "#000005" }} />}>
        <VoidBackground />
      </Suspense>
      <EffectsOverlay />
      <CrystalCorridor />

      {/* Weapon navigation HUD (fixed overlay) */}
      <WeaponHUD />
      <ScrollTracker />

      {/* ── Scrollable page content ── */}
      <main role="main" aria-label="Portfolio content">
        <Nav />
        <Hero />

        {/* Corridor transit space — camera pushes through crystal stairway */}
        <div style={{ height: "18vh", background: "transparent", pointerEvents: "none" }} />

        {/* Weapon station scroll anchors — provide scroll height for camera journey */}
        {STATIONS.map((station) => (
          <section
            key={station.id}
            id={`station-${station.id}`}
            style={{
              height: `${(station.scrollEnd - station.scrollStart) * TOTAL_SCROLL_VH}vh`,
              background: "transparent",
              pointerEvents: "none",
            }}
            aria-label={`${station.loreName} — ${station.loreTag}`}
          />
        ))}

        {/* Transit space between last station and about/contact */}
        <div style={{ height: "30vh", background: "transparent", pointerEvents: "none" }} />

        {/* Work section — data source for model entries (needed for WeaponStations) */}
        <Suspense fallback={<div style={{ minHeight: "50vh", background: "transparent" }} />}>
          <WorkGrid />
        </Suspense>
        {/* AboutContact is the terminal destination of the camera journey —
            the camera descends into the void and this section fades in as the
            final scene state, not a conventional page footer. */}
        <AboutContact />
      </main>

      {/* ── SEO semantic fallback ──────────────────────────────────────────
          Visually hidden but fully readable by search engines.
          Mirrors the key content in plain HTML so Google indexes it immediately
          without executing JavaScript.
      ──────────────────────────────────────────────────────────────────── */}
      <div aria-hidden="true" style={{
        position: "absolute",
        width: "1px", height: "1px",
        overflow: "hidden",
        clip: "rect(0,0,0,0)",
        whiteSpace: "nowrap",
        border: 0,
        top: 0, left: 0,
      }}>
        <h1>Multiscatter — 3D Artist &amp; Interactive WebGPU Developer</h1>
        <p>
          Working across the full production pipeline since 2020. Detailed
          environments, animated intros, icons, and experimental projects built
          in Blender, Houdini, EmberGen, LiquiGen, Substance Painter, and
          DaVinci Resolve. Real-time 3D experiences using WebGPU and
          React Three Fiber.
        </p>

        <section>
          <h2>Selected Work — 3D Models &amp; Renders</h2>
          <p>
            Interactive 3D model showcase featuring weapons, props, and
            environment assets with PBR texturing. Final video renders and
            gallery images from completed Blender productions.
          </p>
        </section>

        <section>
          <h2>About</h2>
          <p>
            3D Artist specialising in procedural art, game assets, product
            visualisation, motion graphics, and experimental installations.
            Tools: Blender, Geometry Nodes, Cycles, EEVEE, Houdini, EmberGen,
            LiquiGen, Substance Painter, DaVinci Resolve.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Open for commissions, collaborations, discussions, and experiments.
            Reach out via X at @multiscatter or use the contact form.
          </p>
        </section>
      </div>
    </>
  );
}
