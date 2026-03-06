/** Deterministic seeded pseudo-random: sin-hash → [0,1). */
export function sr(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}
