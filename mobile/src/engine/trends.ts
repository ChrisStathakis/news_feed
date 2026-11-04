/**
 * Google Trends RSS (24h), ported from newspaper/trends.py.
 * Images stay remote; the direction is rendered by the same template.
 */

import { XMLParser } from "fast-xml-parser";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "./settings";
import type { FetchLike } from "./collect";
import type { TrendPage } from "./render/payload";

export const WORLD_GEO = "US";
export const TRENDS_TTL_MS = 60 * 60 * 1000;
const RSS_URL = "https://trends.google.com/trending/rss?geo={geo}";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export const COUNTRIES: Record<string, string> = {
  GR: "Ελλάδα",
  CY: "Κύπρος",
  GB: "Ηνωμένο Βασίλειο",
  US: "ΗΠΑ",
  DE: "Γερμανία",
  FR: "Γαλλία",
  IT: "Ιταλία",
  ES: "Ισπανία",
  PT: "Πορτογαλία",
  NL: "Ολλανδία",
  BE: "Βέλγιο",
  AT: "Αυστρία",
  CH: "Ελβετία",
  SE: "Σουηδία",
  NO: "Νορβηγία",
  DK: "Δανία",
  FI: "Φινλανδία",
  PL: "Πολωνία",
  RO: "Ρουμανία",
  BG: "Βουλγαρία",
  TR: "Τουρκία",
  RU: "Ρωσία",
  UA: "Ουκρανία",
  IL: "Ισραήλ",
  AE: "Ηνωμένα Αραβικά Εμιράτα",
  SA: "Σαουδική Αραβία",
  IN: "Ινδία",
  JP: "Ιαπωνία",
  KR: "Νότια Κορέα",
  AU: "Αυστραλία",
  CA: "Καναδάς",
  MX: "Μεξικό",
  BR: "Βραζιλία",
  AR: "Αργεντινή",
  ZA: "Νότια Αφρική",
  EG: "Αίγυπτος",
};

export interface TrendItem {
  term: string;
  traffic: string;
  image: string;
  image_source: string;
  time: string;
  news: { title: string; url: string; source: string }[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const text = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record["#text"] ?? "").trim();
  }
  return "";
};

export function countryLabel(code: string): string {
  const key = (code || "").toUpperCase();
  return COUNTRIES[key] || key || "—";
}

export function parseTrends(xml: string): TrendItem[] {
  let data: Record<string, unknown>;
  try {
    data = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }
  const rss = data.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const items = asArray<Record<string, unknown>>(
    channel?.item as Record<string, unknown> | undefined,
  );

  return items
    .map((node) => {
      const term = text(node.title);
      if (!term) return null;
      const news = asArray<Record<string, unknown>>(
        node.news_item as Record<string, unknown> | undefined,
      )
        .map((entry) => ({
          title: text(entry.news_item_title),
          url: text(entry.news_item_url),
          source: text(entry.news_item_source),
        }))
        .filter((entry) => entry.title && entry.url)
        .slice(0, 3);
      const pubDate = text(node.pubDate);
      let time = "";
      if (pubDate) {
        const parsed = new Date(pubDate);
        if (!Number.isNaN(parsed.getTime())) {
          time = formatInTimeZone(parsed, TZ, "HH:mm");
        }
      }
      return {
        term,
        traffic: text(node.approx_traffic),
        image: text(node.picture),
        image_source: text(node.picture_source),
        time,
        news,
      } satisfies TrendItem;
    })
    .filter((item): item is TrendItem => item !== null);
}

const cache = new Map<string, { at: number; items: TrendItem[] }>();

export interface TrendsOptions {
  fetchImpl: FetchLike;
  country?: string;
  perPage?: number;
  refresh?: boolean;
  now?: number;
}

async function loadGeo(geo: string, options: TrendsOptions): Promise<TrendItem[]> {
  const code = (geo || WORLD_GEO).toUpperCase();
  const now = options.now ?? Date.now();
  const hit = cache.get(code);
  if (!options.refresh && hit && now - hit.at < TRENDS_TTL_MS) return hit.items;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await options.fetchImpl(RSS_URL.replace("{geo}", code), {
        headers: { "User-Agent": UA, "Accept-Language": "el,en;q=0.8" },
      });
      if (!response.ok) continue;
      const items = parseTrends(await response.text());
      if (items.length) {
        cache.set(code, { at: now, items });
        return items;
      }
    } catch {
      // retry once, then fall back to stale cache
    }
  }
  return hit?.items || [];
}

export async function buildTrendPages(options: TrendsOptions): Promise<TrendPage[]> {
  const limit = Math.max(3, Math.min(12, Number(options.perPage || 10)));
  const country = (options.country || "GR").toUpperCase();
  const pages: TrendPage[] = [];

  const worldItems = (await loadGeo(WORLD_GEO, options)).slice(0, limit);
  if (worldItems.length) {
    pages.push({
      num: 1,
      scope_el: "ΠΑΓΚΟΣΜΙΟ",
      rows: worldItems.map((item, index) => rowOf(item, index)),
    });
  }

  if (country && country !== WORLD_GEO) {
    const localItems = (await loadGeo(country, options)).slice(0, limit);
    if (localItems.length) {
      pages.push({
        num: pages.length + 1,
        scope_el: countryLabel(country).toUpperCase(),
        rows: localItems.map((item, index) => rowOf(item, index)),
      });
    }
  }
  return pages;
}

function rowOf(item: TrendItem, index: number): TrendPage["rows"][number] {
  const first = item.news[0];
  return {
    rank: index + 1,
    term: item.term,
    traffic: item.traffic,
    image: item.image,
    time: item.time,
    source: item.image_source || first?.source || "",
    headline: first?.title || "",
    headline_url: first?.url || "",
  };
}
