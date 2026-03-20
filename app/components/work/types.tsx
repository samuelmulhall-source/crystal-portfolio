import type { TextureSet } from "../../lib/workModels";

// ─── Types ─────────────────────────────────────────────────────────────────
export type WorkTab = 'models' | 'videos' | 'images';

export interface Project {
  id:          string;
  title:       string;
  category:    string;
  modelPath:   string;
  year:        string;
  textures:    TextureSet;
  description?: string;
  /** Optional WebP placeholder from generate-static-data (when sharp is installed) */
  thumbnail?:  string;
}
export interface VideoEntry { id: string; path: string; title: string; }
export interface ImageEntry { id: string; path: string; title: string; }

/** URL-friendly slug from asset title: "Ornate Dagger" → "ornate-dagger", "AR-15" → "ar-15" */
export function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

// ─── Corner accent ─────────────────────────────────────────────────────────
export type CP = "tl" | "tr" | "bl" | "br";
export function Corner({ pos, on }: { pos: CP; on: boolean }) {
  const T = pos[0] === "t", L = pos[1] === "l";
  return (
    <div style={{
      position: "absolute",
      top:    T ? 0 : undefined, bottom: T ? undefined : 0,
      left:   L ? 0 : undefined, right:  L ? undefined : 0,
      width: 24, height: 24,
      borderTop:    T ? `1px solid rgba(184,240,255,${on ? 0.45 : 0.14})` : undefined,
      borderBottom: T ? undefined : `1px solid rgba(184,240,255,${on ? 0.45 : 0.14})`,
      borderLeft:   L ? `1px solid rgba(184,240,255,${on ? 0.45 : 0.14})` : undefined,
      borderRight:  L ? undefined : `1px solid rgba(184,240,255,${on ? 0.45 : 0.14})`,
      transition: "border-color 0.40s ease",
      pointerEvents: "none", zIndex: 4,
    }} />
  );
}

export const MON: React.CSSProperties = {
  fontFamily:    "var(--font-geist-mono), monospace",
  textTransform: "uppercase",
};

export const DEFAULT_TITLE = "Multiscatter";
