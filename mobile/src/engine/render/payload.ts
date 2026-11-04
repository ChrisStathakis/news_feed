/**
 * Edition display payload, ported from newspaper/build.py.
 */

import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { TZ, type Settings } from "..";
import { classifyLanguage } from "../text";
import type { Edition, Item, Page } from "../types";

const WEEKDAYS = ["Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή"];
const MONTHS = [
  "Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου", "Μαΐου", "Ιουνίου",
  "Ιουλίου", "Αυγούστου", "Σεπτεμβρίου", "Οκτωβρίου", "Νοεμβρίου", "Δεκεμβρίου",
];
const MONTHS_SHORT = ["ΙΑΝ", "ΦΕΒ", "ΜΑΡ", "ΑΠΡ", "ΜΑΪ", "ΙΟΥΝ", "ΙΟΥΛ", "ΑΥΓ", "ΣΕΠ", "ΟΚΤ", "ΝΟΕ", "ΔΕΚ"];

export interface DisplayItem extends Item {
  title_el: string;
  title_en: string;
  body: string[];
  img: string | null;
  img_large: string | null;
  badge: string;
  qr?: string | null;
  source_names: string[];
}

export interface ImageMap {
  [id: string]: { s?: string; l?: string } | undefined;
}

export interface SourceStatus {
  name: string;
  status: "ok" | "degraded" | "broken" | "unknown";
  method: string;
  items: number;
  last_ok: string;
}

export interface TrendPage {
  num: number;
  scope_el: string;
  rows: {
    rank: number;
    term: string;
    traffic?: string;
    time?: string;
    source?: string;
    headline?: string;
    headline_url?: string;
    image?: string;
  }[];
}

export interface EditionPayload {
  edition_name: string;
  edition_name_en: string;
  date_long: string;
  date_caps: string;
  date_iso: string;
  date_short: string;
  month_short: string;
  day_num: number;
  weekday_short: string;
  year: number;
  issue: number;
  generated: string;
  lead: DisplayItem | null;
  secondary: DisplayItem[];
  today_items: DisplayItem[];
  pages: (Omit<Page, "featured" | "stories"> & {
    featured: DisplayItem | null;
    stories: DisplayItem[];
  })[];
  trends: TrendPage[];
  briefs: DisplayItem[];
  stats: { sources_ok?: number; avg_score?: number; [key: string]: unknown };
  numbers: Record<string, unknown>;
  sources: SourceStatus[];
  sections: { key: string; el: string; en: string; num: number }[];
  index: { num: number; title: string; source: string }[];
  theme_preset: string;
  fs_large: boolean;
  total_pages: number;
  briefs_page: number;
  sources_page: number;
}

export function greekDate(date: Date): string {
  const local = toZonedTime(date, TZ);
  return `${WEEKDAYS[(local.getDay() + 6) % 7]} ${local.getDate()} ${MONTHS[local.getMonth()]} ${local.getFullYear()}`;
}

export function editionNumber(date: Date): number {
  const local = toZonedTime(date, TZ);
  const start = Date.UTC(2026, 0, 1);
  const current = Date.UTC(local.getFullYear(), local.getMonth(), local.getDate());
  return Math.floor((current - start) / 86_400_000) + 1;
}

export function truncateWords(value: string | null | undefined, count = 40): string {
  const words = (value || "").split(/\s+/).filter(Boolean);
  return words.slice(0, count).join(" ") + (words.length > count ? "…" : "");
}

export function displayItem(
  item: Item,
  images: ImageMap = {},
  qr: Record<string, string> = {},
  settings?: Settings,
): DisplayItem {
  const media = images[item.id] || {};
  const remote = (item.image as string | null) || null;
  const src = (value?: string | null) =>
    value
      ? /^(data:|https?:|file:)/.test(value)
        ? value
        : `assets/img/${value}`
      : null;
  const titleLang =
    (item.title_lang as string | undefined) || classifyLanguage(item.title || "");
  const bodyText =
    (item.body_el as string | undefined) ||
    (item.body as string | undefined) ||
    (item.paragraphs || []).join("\n\n");
  return {
    ...item,
    title_el: (item.title_el as string | undefined) || item.title,
    title_lang: titleLang,
    title_en:
      titleLang === "el" && item.lang !== "el"
        ? item.title
        : ((item.title_en as string | undefined) || ""),
    body: bodyText.split(/\n{2,}/).filter((paragraph) => paragraph.trim()),
    img: src(media.s || remote),
    img_large: src(media.l || remote),
    source_count: Number(item.source_count ?? 1),
    source_names: (item.source_names as string[]) || [item.source_name],
    badge: titleLang === "en" ? "EN" : "",
    qr: qr[item.id] || null,
    edition_name: settings?.edition.name,
    edition_name_en: settings?.edition.name_en,
  } as DisplayItem;
}

export interface BuildPayloadOptions {
  edition: Edition;
  today: Date;
  settings: Settings;
  stats?: { sources_ok?: number; [key: string]: unknown };
  sources?: SourceStatus[];
  images?: ImageMap;
  qr?: Record<string, string>;
  coverage?: Record<string, unknown>;
  generated?: Date;
  trends?: TrendPage[];
}

export function buildPayload(options: BuildPayloadOptions): EditionPayload {
  const {
    edition,
    settings,
    images = {},
    qr = {},
    coverage = {},
    trends = [],
  } = options;
  const today = options.today;
  const generated = options.generated || new Date();
  const local = toZonedTime(today, TZ);

  const pages = edition.pages.map((page) => ({
    ...page,
    featured: page.featured ? displayItem(page.featured, images, qr, settings) : null,
    stories: page.stories.map((item) => displayItem(item, images, qr, settings)),
  }));

  const sections: EditionPayload["sections"] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    if (seen.has(page.key)) continue;
    seen.add(page.key);
    sections.push({ key: page.key, el: page.label_el, en: page.label_en, num: page.num });
  }

  const totalPages = trends.length + 1 + pages.length + 2;
  const index: EditionPayload["index"] = [];
  for (const page of pages) {
    const entries = [...(page.featured ? [page.featured] : []), ...page.stories];
    for (const item of entries) {
      index.push({ num: page.num, title: item.title_el, source: item.source_name });
    }
  }

  return {
    edition_name: settings.edition.name,
    edition_name_en: settings.edition.name_en,
    date_long: greekDate(today),
    date_caps: `${WEEKDAYS[(local.getDay() + 6) % 7].toUpperCase()} ${local.getDate()} ${MONTHS_SHORT[local.getMonth()]} ${local.getFullYear()}`,
    date_iso: `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`,
    date_short: `${String(local.getDate()).padStart(2, "0")}.${String(local.getMonth() + 1).padStart(2, "0")}.${local.getFullYear()}`,
    month_short: MONTHS_SHORT[local.getMonth()],
    day_num: local.getDate(),
    weekday_short: WEEKDAYS[(local.getDay() + 6) % 7].slice(0, 3).toUpperCase(),
    year: local.getFullYear(),
    issue: editionNumber(today),
    generated: formatInTimeZone(generated, TZ, "HH:mm"),
    lead: edition.lead ? displayItem(edition.lead, images, qr, settings) : null,
    secondary: edition.secondary.map((item) => displayItem(item, images, qr, settings)),
    today_items: edition.today.map((item) => displayItem(item, images, qr, settings)),
    pages,
    trends,
    briefs: edition.briefs.map((item) => displayItem(item, images, qr, settings)),
    stats: {
      ...(options.stats || {}),
      avg_score: edition.numbers.avg_score,
    },
    numbers: { ...edition.numbers, coverage },
    sources: options.sources || [],
    sections,
    index,
    theme_preset: String(settings.theme.preset || "light"),
    fs_large: Number(settings.theme.font_scale || 1) >= 1.08,
    total_pages: totalPages,
    briefs_page: totalPages - 1,
    sources_page: totalPages,
  };
}
