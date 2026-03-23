# Components Contract

- Components serve hierarchy first. Decorative behavior is secondary.
- Keep navigation obvious and always visible. Do not hide primary actions behind hover, drag, or discovery mechanics.
- Favor content-led layouts: headline, proof, summary, CTA.
- Use mono labels sparingly for metadata, filters, and technical framing.
- Preserve strong mobile behavior. Components should recompose cleanly instead of shrinking a desktop arrangement.
- If an interaction adds complexity without improving project review, remove it.
- Default expectation:
  - server-rendered content
  - lightweight client state only when interaction requires it
  - no global visual side effects from a local component
