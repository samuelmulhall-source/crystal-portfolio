Goal: Awwwards/SOTD-tier immersive portfolio. Vibe: Premium Cold Void. High-precision technical minimalism.

1. Aesthetic Core — The Void Protocol

- Palette  
  Void Base: #05070f (deep navy)  
  Accent: #b8f0ff → #c5f8ff (ice blue)  
  Glow: rgba(184,240,255,0.08–0.25)

- Atmospherics  
  Film grain/noise overlay (0.02–0.04 opacity)  
  Volumetric god rays approximation (TSL, scroll-sensitive)  
  Thin-film iridescence + spectral dispersion on crystal/glass materials (thickness 1.5–2.5, aberration 0.015–0.03)

2. Technical Foundation

- Renderer  
  Primary: WebGPURenderer (async init)  
  Fallback: WebGLRenderer

- Shading  
  Strictly TSL — no raw GLSL strings

- Motion  
  Lenis global smooth scroll (lerp 0.05)  
  GSAP + ScrollTrigger for camera paths  
  Spring damping on interactive elements

- Hygiene  
  Strict TypeScript, dispose on unmount  
  LoadingManager + monospaced “Technical Readout” progress

3. Hero — Cinematic Camera Journey

- CatmullRomCurve3 spline + ScrollTrigger mapping  
- Spring inertia on camera  
- Subtle mouse/touch parallax  
- Dynamic FOV narrowing into Work

4. Typography & HUD

- MSDF for hero/nav headlines (troika-three-text or TSL SDF)  
- Frost reveal on viewport entry (noise mask)  
- Subtle RGB shift on hover

5. Work Section & Viewer

- Masonry grid with fade/scale on scroll  
- Viewer: reuse VoidBackground scene (hide/show meshes)  
- Momentum orbit with damping  
- Grid fades out on viewer open

6. Shader Hygiene & TSL Guidelines

- Circular particles/stars: distance discard + smoothstep  
- Depth fade near near-clip plane  
- Holofoil: fresnel rim + temporal noise + chromatic RGB offset (see compute.toys/2751)

Mobile budget: Cap fragment cost ~40 instructions where possible

Priority Implementation Order

1. Environment Hygiene: circular discard + depth fade in starfield  
2. Holofoil Node: core TSL material for crystal assets (iridescence + dispersion)  
3. Smooth Scroll: Lenis + GSAP baseline  
4. Cinematic Spline: hero journey scroll mapping

Testing Checklist (every deploy)
- Mobile load < 3s (Lighthouse)
- No hydration errors
- 60 FPS on iPhone 14+ in expanded view
- Circular stars, clean edges