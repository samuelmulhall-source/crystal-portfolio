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

const CaseStudySectionSchema = z.object({
  title: z.string(),
  body: z.array(z.string()),
});

/** Interactive 3D specimen — content-driven FBX + PBR texture set. */
const SpecimenSchema = z.object({
  modelPath: z.string(),
  /** Static poster used for archive cards, reduced mode, and SSR. */
  poster: z.string(),
  /** Optional second model merged into the same view (e.g. wrap geometry). */
  extraModelPath: z.string().optional(),
  /** Vertical framing nudge applied after auto-centering (world units). */
  yOffset: z.number().optional(),
  textures: z.object({
    map: z.string().optional(),
    normalMap: z.string().optional(),
    roughnessMap: z.string().optional(),
    metalnessMap: z.string().optional(),
    transmissionMap: z.string().optional(),
  }),
});

const CaseStudySchema = z.object({
  hook: z.string(),
  brief: z.array(z.string()),
  sections: z.array(CaseStudySectionSchema),
  deliverables: z.array(z.string()),
  outcomes: z.array(z.string()),
});

const WorkEntrySchema = z.object({
  slug: z.string(),
  title: z.string(),
  sortOrder: z.number(),
  year: z.string(),
  featured: z.boolean(),
  format: z.string(),
  discipline: z.string(),
  client: z.string(),
  engagement: z.string(),
  summary: z.string(),
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
  interactive: z.object({
    available: z.boolean(),
    href: z.string().optional(),
    label: z.string().optional(),
    sourcePath: z.string().optional(),
    note: z.string().optional(),
  }),
  specimen: SpecimenSchema.optional(),
  caseStudy: CaseStudySchema,
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
    eyebrow: z.string(),
    title: z.string(),
    intro: z.string(),
    lede: z.string(),
    readout: z.array(z.object({ key: z.string(), val: z.string() })),
    primaryCta: LinkSchema,
    secondaryCta: LinkSchema,
    featuredSlug: z.string(),
    meta: z.array(z.string()),
  }),
  selectedWork: z.object({
    heading: z.string(),
    intro: z.string(),
    featuredSlugs: z.array(z.string()),
  }),
  spotlight: z.object({
    heading: z.string(),
    intro: z.string(),
    slug: z.string(),
    ctaLabel: z.string(),
  }),
  capabilities: z.object({
    heading: z.string(),
    intro: z.string(),
    items: z.array(
      z.object({
        title: z.string(),
        body: z.string(),
      }),
    ),
  }),
  archivePreview: z.object({
    heading: z.string(),
    intro: z.string(),
    limit: z.number(),
    ctaLabel: z.string(),
    ctaHref: z.string(),
  }),
  contact: z.object({
    heading: z.string(),
    intro: z.string(),
    notes: z.array(z.string()),
    primaryCta: LinkSchema,
    secondaryCta: LinkSchema,
  }),
});

export type MediaAsset = z.infer<typeof MediaAssetSchema>;
export type Specimen = z.infer<typeof SpecimenSchema>;
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

export const getFeaturedEntries = cache(() =>
  getWorkEntries().filter((entry) => entry.featured),
);

export function getWorkEntryBySlug(slug: string) {
  return getWorkEntries().find((entry) => entry.slug === slug);
}

export function getRelatedEntries(slug: string, limit = 3) {
  const entries = getWorkEntries();
  const current = entries.find((entry) => entry.slug === slug);
  if (!current) return [];

  return entries
    .filter((entry) => entry.slug !== slug)
    .sort((left, right) => {
      const leftScore = left.tags.filter((tag) => current.tags.includes(tag)).length;
      const rightScore = right.tags.filter((tag) => current.tags.includes(tag)).length;
      if (leftScore !== rightScore) return rightScore - leftScore;
      return left.sortOrder - right.sortOrder;
    })
    .slice(0, limit);
}
