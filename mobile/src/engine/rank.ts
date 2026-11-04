/**
 * Scoring and pagination, ported from newspaper/rank.py.
 */

import {
  IMPACT_KEYWORDS,
  RECENCY_WINDOW_H,
  SCORE_WEIGHTS,
  type RuntimeConfig,
  runtimeConfig,
} from "./config";
import { pyRound } from "./time";
import type { Edition, EditionNumbers, Item, Page, Section } from "./types";

function textOf(item: Item): string {
  return [item.title || "", item.summary || "", (item.categories || []).join(" ")]
    .join(" ")
    .toLowerCase();
}

export function classify(item: Item): string {
  return item.source_id || "other";
}

export function importance(item: Item, now: Date, config: RuntimeConfig = runtimeConfig()): number {
  const published = new Date(item.published);
  const ageH = Math.max(0, (now.getTime() - published.getTime()) / 3_600_000);

  const recency = SCORE_WEIGHTS.recency * Math.max(0, 1 - ageH / RECENCY_WINDOW_H);
  const tierPts = SCORE_WEIGHTS.tier[Number(item.tier ?? 3)] ?? 10;
  const sourceCount = Number(item.source_count ?? 1);
  const coverage = Math.min(SCORE_WEIGHTS.coverage, 8 * (sourceCount - 1));

  const text = textOf(item);
  const hits = IMPACT_KEYWORDS.reduce(
    (count, keyword) => (text.includes(keyword) ? count + 1 : count),
    0,
  );
  const impact = Math.min(SCORE_WEIGHTS.impact, 4 * hits);

  let exclusivity = 0;
  if (sourceCount === 1) {
    exclusivity =
      Number(item.tier ?? 3) === 1 ? SCORE_WEIGHTS.exclusivity : 4;
  }

  let total = recency + tierPts + coverage + impact + exclusivity;
  if (item.image) total += 4;

  const weights = config.weights;
  let rawWeight: unknown;
  if (item.kind === "video" || String(item.source_id || "").startsWith("yt-")) {
    rawWeight =
      weights[item.source_id || ""] ||
      weights[item.source_name || ""] ||
      weights[item.domain || ""] ||
      1;
  } else {
    rawWeight =
      weights[item.domain || ""] ||
      weights[item.source_id || ""] ||
      weights[item.source_name || ""] ||
      1;
  }
  let weight = Number(rawWeight);
  if (!Number.isFinite(weight)) weight = 1;
  total *= Math.max(0.3, Math.min(2.0, weight));

  return pyRound(Math.min(100, total), 1);
}

function publishedKey(item: Item): number {
  try {
    return -new Date(item.published).getTime() / 1000;
  } catch {
    return 0;
  }
}

export function orderMap(sections: Section[]): Record<string, number> {
  return Object.fromEntries(
    sections.map((section, index) => [section.key, Number(section.order ?? index)]),
  );
}

export function rank(
  items: Item[],
  now: Date = new Date(),
  order: Record<string, number> = {},
  config: RuntimeConfig = runtimeConfig(),
): Item[] {
  for (const item of items) {
    item.category = classify(item);
    item.score = importance(item, now, config);
  }
  items.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    const aOrder = order[a.source_id] ?? 9999;
    const bOrder = order[b.source_id] ?? 9999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return publishedKey(a) - publishedKey(b);
  });
  return items;
}

function needed(pool: Item[], kind: string, config: RuntimeConfig): number {
  const available = pool.length;
  if (available <= 0) return 0;
  const layout = config.pageLayout;
  if (kind === "video") return Math.max(1, Math.ceil(available / layout.video_page));
  if (available <= layout.first_page) return 1;
  const extra = available - layout.first_page;
  let pages = 1 + Math.ceil(extra / layout.grid_page);
  const last = available - layout.first_page - layout.grid_page * (pages - 2);
  if (pages > 1 && last < 4) pages -= 1;
  return Math.max(1, pages);
}

export function fallbackSection(order = 9999): Section {
  return {
    key: "other",
    source_id: "other",
    name: "Λοιπά",
    label_el: "Άλλα",
    label_en: "OTHER",
    pages: 1,
    kind: "grid",
    order,
    url: "",
    domain: "",
  };
}

export function buildEdition(
  items: Item[],
  sectionPlan: Section[] = [],
  options: { startNum?: number; config?: RuntimeConfig } = {},
): Edition {
  const config = options.config ?? runtimeConfig();
  const layout = config.pageLayout;
  const sectionList: Section[] = sectionPlan.map((section) => ({ ...section }));
  const known = new Set(sectionList.map((section) => section.key));
  const order = orderMap(sectionList);

  const ranked = [...items].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    const aOrder = order[a.source_id] ?? 9999;
    const bOrder = order[b.source_id] ?? 9999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return publishedKey(a) - publishedKey(b);
  });

  const used = new Set<string>();
  const lead =
    ranked.find((item) => item.image) || (ranked.length ? ranked[0] : null);
  if (lead) {
    lead.role = "lead";
    used.add(lead.id);
  }

  const secondary = ranked.filter((item) => !used.has(item.id)).slice(0, config.coverSecondary);
  for (const item of secondary) {
    item.role = "secondary";
    used.add(item.id);
  }

  const pools: Record<string, Item[]> = {};
  for (const item of ranked) {
    if (used.has(item.id)) continue;
    let key = item.category || item.source_id || "other";
    if (!known.has(key)) {
      if (!known.has("other")) {
        sectionList.push(fallbackSection(sectionList.length));
        known.add("other");
        order.other = sectionList.length - 1;
      }
      key = "other";
    }
    (pools[key] ||= []).push(item);
  }

  const plan: { section: Section; count: number }[] = [];
  for (const section of sectionList) {
    const pool = pools[section.key] || [];
    if (!pool.length) continue;
    const target = Math.max(0, Number(section.pages ?? 1));
    if (target <= 0) continue;
    const kind = section.kind || "grid";
    const count = Math.min(target, needed(pool, kind, config));
    if (count > 0) plan.push({ section, count });
  }

  const pages: Page[] = [];
  let num = options.startNum ?? 2;
  for (const { section, count } of plan) {
    const key = section.key;
    const labelEl = section.label_el || section.name || key;
    const labelEn = section.label_en || "";
    const kind = section.kind || "grid";
    const pool = pools[key] || [];

    for (let index = 0; index < count; index += 1) {
      const page: Page = {
        num,
        key,
        label_el: labelEl,
        label_en: labelEn,
        source_name: section.name || labelEl,
        section_page: index + 1,
        section_pages: count,
        featured: null,
        stories: [],
        empty: false,
        kind: "grid",
      };

      if (kind === "video") {
        page.kind = "video";
        page.stories = pool.slice(0, layout.video_page);
        pool.splice(0, layout.video_page);
        for (const item of page.stories) item.role ??= "video";
        page.empty = page.stories.length === 0;
      } else if (index === 0) {
        page.kind = "first";
        if (pool.length) {
          const featured = pool.shift()!;
          featured.role = "featured";
          page.featured = featured;
          const take = layout.first_page - 1;
          page.stories = pool.slice(0, take);
          pool.splice(0, take);
        }
        page.empty = page.featured === null;
      } else {
        page.kind = "grid";
        page.stories = pool.slice(0, layout.grid_page);
        pool.splice(0, layout.grid_page);
        page.empty = page.stories.length === 0;
      }

      for (const item of page.stories) item.role ??= "story";
      pages.push(page);
      num += 1;
    }
  }

  for (const page of pages) {
    for (const item of page.stories) used.add(item.id);
    if (page.featured) used.add(page.featured.id);
  }

  const briefs = ranked
    .filter((item) => !used.has(item.id) && item.kind !== "video")
    .slice(0, config.briefsPerPage);
  for (const item of briefs) item.role = "brief";

  const today = ranked.filter((item) => item.kind !== "video").slice(0, 5);

  return {
    lead,
    secondary,
    pages,
    briefs,
    today,
    numbers: numbers(pages, items, briefs, sectionList),
  };
}

export function numbers(
  pages: Page[],
  items: Item[],
  briefs: Item[],
  sections: Section[],
): EditionNumbers {
  const counts: Record<string, number> = Object.fromEntries(
    sections.map((section) => [section.key, 0]),
  );
  for (const item of items) {
    const key = item.category || item.source_id || "other";
    counts[key] = (counts[key] || 0) + 1;
  }

  const rows = sections.map((section) => ({
    key: section.key,
    el: section.label_el || section.name || section.key,
    en: section.label_en || "",
    count: counts[section.key] || 0,
  }));

  const sources = new Set(
    items.map((item) => item.source_name).filter(Boolean),
  );
  const published = items
    .map((item) => item.published)
    .filter(Boolean)
    .sort();
  const withImage = items.filter((item) => item.image).length;
  const video = pages.reduce(
    (sum, page) => sum + (page.kind === "video" ? page.stories.length : 0),
    0,
  );

  return {
    total: items.length,
    counts,
    rows,
    sources: sources.size,
    first_time: published.length ? published[0].slice(11, 16) : "—",
    last_time: published.length ? published[published.length - 1].slice(11, 16) : "—",
    with_image: withImage,
    image_ratio: items.length ? pyRound((100 * withImage) / items.length) : 0,
    video,
    briefs: briefs.length,
    avg_score: items.length
      ? pyRound(items.reduce((sum, item) => sum + item.score, 0) / items.length, 1)
      : 0,
  };
}

export function stats(edition: Edition, items: Item[]) {
  const filled = edition.pages.filter((page) => !page.empty).length;
  return {
    total_items: items.length,
    sections_filled: filled,
    sections_total: edition.pages.length,
    avg_score: items.length
      ? pyRound(items.reduce((sum, item) => sum + item.score, 0) / items.length, 1)
      : 0,
    lead_score: edition.lead ? edition.lead.score : 0,
  };
}
