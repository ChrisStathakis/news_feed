/**
 * Settings loading/merging, ported from newspaper/settings.py.
 *
 * On desktop the file lives next to the executable; on Android it lives in
 * the app's private data directory. The engine only receives the parsed JSON,
 * so it stays independent from expo-file-system.
 */

import type { Settings } from "./types";

export const TZ = "Europe/Athens";

export const DEFAULTS: Settings = {
  edition: {
    name: "Η Ημερήσια",
    name_en: "THE DAILY",
    tagline: "Έκδοση με τα πιο σημαντικά της ημέρας.",
  },
  layout: {
    cover_secondary: 3,
    first_page: 7,
    grid_page: 9,
    video_page: 6,
    briefs_per_page: 10,
  },
  limits: {
    lead: 900,
    featured: 420,
    story: 240,
    brief: 90,
    video: 190,
  },
  language: {
    target: "el",
    fallback: "original",
    translate_english: false,
  },
  weights: {},
  sources_disabled: [],
  theme: {
    preset: "light",
    font_scale: 1.0,
    photos: "sepia",
    paper: "#f4efe1",
    paper_deep: "#e9e0cb",
    ink: "#1c1a17",
    ink_soft: "#49423a",
    accent: "#8f2b23",
    navy: "#2c3b4c",
    serif: '"Bookman Old Style","Bookman","Georgia","Palatino Linotype",Georgia,serif',
    mono: '"Courier New",Courier,monospace',
  },
  runtime: {
    python: "",
    pdf: false,
    pdf_dir: "",
    workers_articles: 8,
    workers_images: 6,
    workers_translate: 6,
  },
  schedule: {
    enabled: true,
    at: "07:00",
  },
  trends: {
    enabled: true,
    country: "GR",
    per_page: 10,
  },
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Deep merge, matching Python's settings._merge (dicts merge, everything else replaces). */
export function merge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : (override as T));
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = merge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

function cloneDefaults(): Settings {
  return JSON.parse(JSON.stringify(DEFAULTS)) as Settings;
}

/** Equivalent of settings.load(): defaults + settings.json, minus legacy sections. */
export function loadSettings(raw?: unknown): Settings {
  const data = isPlainObject(raw) ? { ...raw } : {};
  delete data.sections;
  return merge(cloneDefaults(), data);
}

/** Equivalent of settings.save(): strip sections, merge with defaults. */
export function saveSettings(raw: unknown): Settings {
  const data = isPlainObject(raw) ? { ...raw } : {};
  delete data.sections;
  return merge(cloneDefaults(), data);
}
