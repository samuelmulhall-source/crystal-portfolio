"use client";

/**
 * Shared data.json fetcher — single network request, cached module-level.
 *
 * Every consumer gets the same promise/result. First mount triggers the fetch;
 * subsequent mounts return the cached data synchronously (no flash/re-render).
 */

import { useState, useEffect } from "react";
import type { TextureSet } from "./workModels";

/* ── Public types ─────────────────────────────────────────────────────────── */

export interface ModelEntry {
  path:         string;
  title:        string;
  category:     string;
  year:         string;
  textures?:    TextureSet;
  description?: string;
  thumbnail?:   string;
}

export interface VideoEntry {
  id:           string;
  path:         string;
  title:        string;
  description?: string;
}

export interface ImageEntry {
  id:           string;
  path:         string;
  title:        string;
  description?: string;
}

export interface PortfolioData {
  models: ModelEntry[];
  videos: VideoEntry[];
  images: ImageEntry[];
}

/* ── Module-level singleton cache ─────────────────────────────────────────── */

let cachedData: PortfolioData | null = null;
let fetchPromise: Promise<PortfolioData> | null = null;

function doFetch(): Promise<PortfolioData> {
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch("/data.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((raw: Partial<PortfolioData>) => {
      const data: PortfolioData = {
        models: Array.isArray(raw.models) ? raw.models : [],
        videos: Array.isArray(raw.videos) ? raw.videos : [],
        images: Array.isArray(raw.images) ? raw.images : [],
      };
      cachedData = data;
      return data;
    })
    .catch(() => {
      // Allow retry on next mount
      fetchPromise = null;
      return { models: [], videos: [], images: [] } as PortfolioData;
    });
  return fetchPromise;
}

/* ── React hook ───────────────────────────────────────────────────────────── */

export function usePortfolioData(): { data: PortfolioData; loading: boolean } {
  // If cache is warm, return synchronously — no state transition, no flash.
  const [data, setData] = useState<PortfolioData>(
    () => cachedData ?? { models: [], videos: [], images: [] },
  );
  const [loading, setLoading] = useState(!cachedData);

  useEffect(() => {
    if (cachedData) {
      // Cache was warm — state was set via initializer, nothing to do
      return;
    }
    let cancelled = false;
    doFetch().then((d) => {
      if (!cancelled) {
        setData(d);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}
