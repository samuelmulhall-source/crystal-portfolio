import { Suspense } from "react";
import VoidBackground  from "./components/VoidBackground";
import EffectsOverlay  from "./components/EffectsOverlay";
import LensOverlay     from "./components/LensOverlay";
import LoadingScreen   from "./components/LoadingScreen";
import CosmicLoader    from "./components/CosmicLoader";
import CursorFollower  from "./components/CursorFollower";
import HUDCorners      from "./components/HUDCorners";
import Hero            from "./components/Hero";
import WorkGrid        from "./components/WorkGrid";
import AboutContact    from "./components/AboutContact";
import Nav             from "./components/Nav";

export default function Home() {
  return (
    <>
      <LoadingScreen />
      <CursorFollower />
      <HUDCorners />
      <LensOverlay />
      <Suspense fallback={<CosmicLoader />}>
        <VoidBackground />
      </Suspense>
      <EffectsOverlay />

      {/* ── Scrollable page content ── */}
      <main>
        <Nav />
        <Hero />
        <Suspense fallback={<CosmicLoader />}>
          <WorkGrid />
        </Suspense>
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
