import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const LinkSchema = z.object({
  label: z.string(),
  href: z.string(),
});

const MediaVariantSchema = z.object({
  label: z.string(),
  src: z.string(),
});

const MediaAssetSchema = z.object({
  kind: z.enum(["image", "video", "model"]),
  src: z.string(),
  alt: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  poster: z.string().optional(),
  variants: z.array(MediaVariantSchema).optional(),
});

/** Interactive 3D specimen — content-driven FBX + PBR texture set. */
const SpecimenSchema = z.object({
  modelPath: z.string(),
  /** Static poster used for archive cards, reduced mode, and SSR. */
  poster: z.string(),
  /** Optional second model merged into the same view (e.g. wrap geometry). */
  extraModelPath: z.string().optional(),
  /** Optional quad-topology wire asset (edges-only GLB, exported from the DCC
   *  source where the original quads still exist — the shipped mesh is
   *  triangulated). Lazy-loaded when the Wire channel is selected; shown as a
   *  hidden-line view over the depth-only model. */
  wireModelPath: z.string().optional(),
  /** Vertical framing nudge applied after auto-centering (world units). */
  yOffset: z.number().optional(),
  /** Rigged character: keep the model's own materials, clone skeleton-safe,
   *  and play its first animation clip (props use the PBR-replace path). */
  rigged: z.boolean().optional(),
  textures: z.object({
    map: z.string().optional(),
    normalMap: z.string().optional(),
    roughnessMap: z.string().optional(),
    metalnessMap: z.string().optional(),
    transmissionMap: z.string().optional(),
  }),
});

/** One named asset inside a collection entry (e.g. an asset pack) — a
 *  steppable specimen with its own title and optional one-line summary. */
const PackAssetSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  specimen: SpecimenSchema,
});

const WorkEntrySchema = z.object({
  slug: z.string(),
  title: z.string(),
  sortOrder: z.number(),
  year: z.string(),
  featured: z.boolean(),
  format: z.string(),
  discipline: z.string(),
  /** Explicit showcase category. Falls back to derivation (see getWorkCategory). */
  category: z.enum(["models", "rigged", "video", "images"]).optional(),
  /** Optional context labels — no UI renders these today; kept optional so
   *  entries never have to invent a client to satisfy the schema. */
  client: z.string().optional(),
  engagement: z.string().optional(),
  summary: z.string(),
  /** Editorial long-form for the detail lede — renders in place of summary
   *  when present (app/work/[slug], `description ?? summary`). */
  description: z.string().optional(),
  /** When the piece was made, e.g. "Mar 2026". Falls back to year. */
  created: z.string().optional(),
  tags: z.array(z.string()),
  role: z.array(z.string()),
  tools: z.array(z.string()),
  thumbnail: MediaAssetSchema,
  heroMedia: MediaAssetSchema,
  gallery: z.array(MediaAssetSchema),
  seo: z.object({
    title: z.string(),
    description: z.string(),
    ogImage: z.string(),
  }),
  /** Legacy per-entry viewer notes — no UI renders this; optional so new
   *  entries can omit it. */
  interactive: z
    .object({
      available: z.boolean(),
      href: z.string().optional(),
      label: z.string().optional(),
      sourcePath: z.string().optional(),
      note: z.string().optional(),
    })
    .optional(),
  specimen: SpecimenSchema.optional(),
  /** Collection entries (asset packs): the named assets users step through.
   *  When present, viewers offer per-asset navigation; `specimen` then acts
   *  as the default/fallback asset. */
  assets: z.array(PackAssetSchema).optional(),
});

const SiteSettingsSchema = z.object({
  brand: z.object({
    name: z.string(),
    studioLabel: z.string(),
    location: z.string(),
  }),
  deployment: z.object({
    siteUrl: z.string(),
    locale: z.string(),
  }),
  seo: z.object({
    defaultTitle: z.string(),
    titleTemplate: z.string(),
    description: z.string(),
    keywords: z.array(z.string()),
    defaultOgImage: z.string(),
  }),
  contact: z.object({
    primaryLabel: z.string(),
    primaryHref: z.string(),
    secondaryLabel: z.string(),
    secondaryHref: z.string(),
    availability: z.string(),
  }),
  social: z.object({
    xHandle: z.string(),
    xUrl: z.string(),
  }),
  featureFlags: z.object({
    experienceRoute: z.boolean(),
    ambientAudio: z.boolean(),
    specimenPreview: z.boolean(),
  }),
  qualityPresets: z.object({
    defaultMode: z.enum(["auto", "reduced", "enhanced"]),
    enhancedMinDeviceMemory: z.number(),
    enhancedMinHardwareConcurrency: z.number(),
  }),
});

const HomeContentSchema = z.object({
  hero: z.object({
    title: z.string(),
    featuredSlug: z.string(),
    video: MediaAssetSchema.optional(),
    /** Concise capability labels — the single descriptor above the wordmark. */
    capabilities: z.array(z.string()).optional(),
    /** Minimal scroll cue label beneath the hero (e.g. "Selected Work"). */
    scrollCue: z.string().optional(),
  }),
  contact: z.object({
    heading: z.string(),
    /** Short honest about/positioning line above the contact actions. */
    intro: z.string().optional(),
    /** Tiny mono availability label (e.g. "Available — briefs & roles"). */
    availability: z.string().optional(),
    primaryCta: LinkSchema,
    secondaryCta: LinkSchema,
  }),
});

export type MediaAsset = z.infer<typeof MediaAssetSchema>;
export type Specimen = z.infer<typeof SpecimenSchema>;
export type PackAsset = z.infer<typeof PackAssetSchema>;
export type WorkEntry = z.infer<typeof WorkEntrySchema>;
export type SiteSettings = z.infer<typeof SiteSettingsSchema>;
export type HomeContent = z.infer<typeof HomeContentSchema>;

const CONTENT_ROOT = path.join(process.cwd(), "content");

function readJson<T>(filePath: string, schema: z.ZodSchema<T>): T {
  const raw = fs.readFileSync(filePath, "utf8");
  return schema.parse(JSON.parse(raw));
}

export const getSiteSettings = cache(() =>
  readJson(path.join(CONTENT_ROOT, "site", "settings.json"), SiteSettingsSchema),
);

export const getHomeContent = cache(() =>
  readJson(path.join(CONTENT_ROOT, "site", "home.json"), HomeContentSchema),
);

export const getWorkEntries = cache(() => {
  const workDir = path.join(CONTENT_ROOT, "work");
  return fs
    .readdirSync(workDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson(path.join(workDir, file), WorkEntrySchema))
    .sort((a, b) => a.sortOrder - b.sortOrder);
});

export function getWorkEntryBySlug(slug: string) {
  return getWorkEntries().find((entry) => entry.slug === slug);
}

// ─── Showcase categories ─────────────────────────────────────────────────────
export type WorkCategory = "models" | "rigged" | "video" | "images";

export const WORK_CATEGORIES: { id: WorkCategory; label: string }[] = [
  { id: "models", label: "Models" },
  { id: "rigged", label: "Rigged Characters" },
  { id: "video", label: "Video" },
  { id: "images", label: "Images" },
];

/** Resolve a work entry's category — explicit field first, else derived from
 *  its media: an interactive specimen = model, a video hero = video, else still. */
export function getWorkCategory(entry: WorkEntry): WorkCategory {
  if (entry.category) return entry.category;
  if (entry.specimen) return "models";
  if (entry.heroMedia.kind === "video") return "video";
  return "images";
}

/** All entries grouped by category, preserving sortOrder within each group. */
export const getWorkByCategory = cache(() => {
  const groups: Record<WorkCategory, WorkEntry[]> = {
    models: [],
    rigged: [],
    video: [],
    images: [],
  };
  for (const entry of getWorkEntries()) {
    groups[getWorkCategory(entry)].push(entry);
  }
  return groups;
});

/** Human-readable PBR map labels present on a specimen, in pipeline order. */
const MAP_LABELS: Array<[keyof Specimen["textures"], string]> = [
  ["map", "Albedo"],
  ["normalMap", "Normal"],
  ["roughnessMap", "Roughness"],
  ["metalnessMap", "Metalness"],
  ["transmissionMap", "Transmission"],
];

export function getSpecimenMaps(specimen: Specimen): string[] {
  return MAP_LABELS.filter(([key]) => specimen.textures[key]).map(([, label]) => label);
}

/** Geometry container format from a model path, e.g. "FBX". */
export function getModelFormat(modelPath: string): string {
  const ext = modelPath.split(".").pop() ?? "";
  return ext.toUpperCase();
}
