# Source Asset Contract

- `Hero_assets/` is reserved for source-of-truth material only.
- Do not overwrite source renders, frame sequences, or layered working files with web-ready derivatives.
- Runtime assets belong in `public/` or generated derivative folders.
- Every portfolio item should have:
  - a canonical card image or poster
  - a detail-page hero asset
  - optional variants listed in content metadata
- Naming should support the typed content layer:
  - one canonical asset per visual
  - variants described as variants, not separate portfolio pieces
- If new derivatives are generated, keep the source-to-runtime relationship obvious enough for Claude or another agent to trace later.
