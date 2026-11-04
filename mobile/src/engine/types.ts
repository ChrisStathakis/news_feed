/**
 * Shared types for the Hmerisia engine.
 *
 * The engine is intentionally framework-free: it must run in React Native
 * (Hermes) and in Node (tests / parity harness) without platform imports.
 */

export type Lang = "el" | "en";

export interface Source {
  id: string;
  name: string;
  domain: string;
  lang: Lang;
  tier: 1 | 2 | 3;
  category: string;
  home: string;
  site_url?: string;
  feeds?: string[];
  jina?: string;
  gnews?: string;
  link_filter?: string;
  auto?: boolean;
  kind?: "youtube";
  order?: number;
  active?: boolean;
}

export interface RawItem {
  title?: string;
  summary?: string;
  url?: string;
  source_id: string;
  source_name: string;
  domain?: string;
  lang?: string;
  tier?: number;
  published?: string | null;
  image?: string | null;
  categories?: string[];
  kind?: string | null;
  video_id?: string | null;
  channel?: string | null;
  paragraphs?: string[];
  words?: number;
  image_candidates?: string[];
  summary_source?: string;
}

export interface Item {
  id: string;
  title: string;
  summary: string;
  url: string;
  source_id: string;
  source_name: string;
  domain: string;
  lang: string;
  tier: number;
  published: string;
  local_time: string;
  image: string | null | undefined;
  categories: string[];
  kind: string | null | undefined;
  video_id: string | null | undefined;
  channel: string | null | undefined;
  paragraphs: string[];
  ad_like: boolean;
  also: string[];
  source_names: string[];
  source_count: number;
  category: string;
  score: number;
  role?: string;
  [key: string]: unknown;
}

export interface Section {
  key: string;
  source_id: string;
  name: string;
  label_el: string;
  label_en: string;
  pages: number;
  kind: "grid" | "video";
  order: number;
  url: string;
  domain: string;
}

export interface Page {
  num: number;
  key: string;
  label_el: string;
  label_en: string;
  source_name: string;
  section_page: number;
  section_pages: number;
  featured: Item | null;
  stories: Item[];
  empty: boolean;
  kind: "grid" | "first" | "video";
}

export interface Edition {
  lead: Item | null;
  secondary: Item[];
  pages: Page[];
  briefs: Item[];
  today: Item[];
  numbers: EditionNumbers;
}

export interface EditionNumbers {
  total: number;
  counts: Record<string, number>;
  rows: { key: string; el: string; en: string; count: number }[];
  sources: number;
  first_time: string;
  last_time: string;
  with_image: number;
  image_ratio: number;
  video: number;
  briefs: number;
  avg_score: number;
}

export interface Settings {
  edition: {
    name: string;
    name_en: string;
    tagline: string;
  };
  layout: {
    cover_secondary: number;
    first_page: number;
    grid_page: number;
    video_page: number;
    briefs_per_page: number;
  };
  limits: {
    lead: number;
    featured: number;
    story: number;
    brief: number;
    video: number;
  };
  language: {
    target: Lang;
    fallback: "original";
    translate_english: boolean;
  };
  weights: Record<string, number>;
  sources_disabled: string[];
  theme: Record<string, string | number>;
  runtime: {
    python: string;
    pdf: boolean;
    pdf_dir: string;
    workers_articles: number;
    workers_images: number;
    workers_translate: number;
  };
  schedule: {
    enabled: boolean;
    at: string;
  };
  trends: {
    enabled: boolean;
    country: string;
    per_page: number;
  };
}
