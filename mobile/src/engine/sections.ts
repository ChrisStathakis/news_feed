/**
 * Section planning, ported from newspaper/sections.py.
 * Each source from sites.txt becomes one section; its weight decides pages.
 */

import type { Section, Source } from "./types";
import { runtimeConfig } from "./config";

export function targetPages(weight: number | string | null | undefined): number {
  let value = Number(weight);
  if (!Number.isFinite(value)) value = 1;
  value = Math.max(0.3, Math.min(2.0, value));
  // Match Python: math.floor(value + 0.5), not Math.round (banker's).
  return Math.max(1, Math.min(4, Math.floor(value + 0.5)));
}

export function sourceWeight(
  source: Source,
  weights?: Record<string, number>,
): number {
  const map = weights ?? runtimeConfig().weights;
  const keys =
    source.kind === "youtube"
      ? [source.id, source.name, source.domain, source.site_url, source.home]
      : [source.domain, source.id, source.name, source.site_url, source.home];
  for (const key of keys) {
    if (!key) continue;
    const value = Number(map[key]);
    if (Number.isFinite(value)) return value;
  }
  return 1;
}

export function resolve(
  sources: Source[],
  weights?: Record<string, number>,
): Section[] {
  return sources.map((source, index) => {
    const name = source.name || source.domain || source.home || `source-${index + 1}`;
    return {
      key: source.id || `source-${index + 1}`,
      source_id: source.id || `source-${index + 1}`,
      name,
      label_el: name,
      label_en: name,
      pages: targetPages(sourceWeight(source, weights)),
      kind: source.kind === "youtube" ? ("video" as const) : ("grid" as const),
      order: index,
      url: source.site_url || source.home || "",
      domain: source.domain || "",
    };
  });
}
