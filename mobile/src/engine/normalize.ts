/**
 * Cleanup, date filtering, ad filtering and deduplication.
 * Ported from newspaper/normalize.py.
 */

import { SOURCES, FRESH_WINDOW_H } from "./config";
import { athensStartOfDay, athensTime, parseIso, sha1 } from "./time";
import {
  AD_HARD,
  AD_OFFER,
  AD_SOFT,
  AD_URL,
  GENERIC_TITLES,
  JUNK_TITLE,
  MATCH_LISTING,
  STALE_TITLE,
  cleanTitle,
  normalizeText,
  similarity,
  tokens,
} from "./text";
import type { Item, RawItem } from "./types";

export const lastNormalizeStats = { hard_ads: 0, ad_like: 0, total: 0 };

const KNOWN_BY_HOST: Record<string, string> = Object.fromEntries(
  SOURCES.map((source) => [source.domain.replace("www.", ""), source.name]),
);
Object.assign(KNOWN_BY_HOST, {
  "bbc.co.uk": "BBC News",
  "bbc.com": "BBC News",
  "cnn.it": "CNN International",
  "cnn.com": "CNN International",
  "finance.yahoo.com": "Yahoo Finance",
  "gamespot.com": "GameSpot",
  "imdb.com": "IMDb",
  "nba.com": "NBA",
  "euroleaguebasketball.net": "EuroLeague",
});

const KNOWN_NAMES = new Set(SOURCES.map((source) => source.name));

const KNOWN_ID_BY_HOST: Record<string, string> = Object.fromEntries(
  SOURCES.map((source) => [source.domain.replace("www.", ""), source.id]),
);
Object.assign(KNOWN_ID_BY_HOST, {
  "bbc.co.uk": "bbc",
  "bbc.com": "bbc",
  "cnn.it": "cnn",
  "cnn.com": "cnn",
  "finance.yahoo.com": "yahoo",
  "gamespot.com": "gamespot",
  "imdb.com": "imdb",
  "nba.com": "nba",
  "euroleaguebasketball.net": "euroleague",
});

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace("www.", "");
  } catch {
    return "";
  }
}

export function hostOwner(host: string): string | null {
  const normalized = (host || "").toLowerCase().replace("www.", "");
  for (const [known, name] of Object.entries(KNOWN_BY_HOST)) {
    if (normalized === known || normalized.endsWith(`.${known}`)) return name;
  }
  return null;
}

export function hostSourceId(host: string): string | null {
  const normalized = (host || "").toLowerCase().replace("www.", "");
  for (const [known, id] of Object.entries(KNOWN_ID_BY_HOST)) {
    if (normalized === known || normalized.endsWith(`.${known}`)) return id;
  }
  return null;
}

function alignSource(item: Item): void {
  const host = hostOf(item.url);
  if (!host) return;
  const domain = (item.domain || "").toLowerCase().replace("www.", "");
  if (domain && (host === domain || host.endsWith(`.${domain}`))) return;

  const owner = hostOwner(host);
  if (owner && KNOWN_NAMES.has(item.source_name) && owner !== item.source_name) {
    item.source_name = owner;
    item.source_names = [owner, ...(item.source_names || []).filter((name) => name !== owner)];
    const ownerId = hostSourceId(host);
    if (ownerId) item.source_id = ownerId;
    item.domain = host;
    item.source_aligned = true;
  }
}

export function itemId(url: string, title: string): string {
  return sha1(`${url}|${title}`).slice(0, 12);
}

export interface NormalizeOptions {
  now?: Date;
  windowH?: number;
  /** Current calendar year, injected for deterministic tests. */
  currentYear?: number;
}

export function normalize(items: RawItem[], options: NormalizeOptions = {}): Item[] {
  lastNormalizeStats.hard_ads = 0;
  lastNormalizeStats.ad_like = 0;
  lastNormalizeStats.total = 0;

  const now = options.now ? new Date(options.now) : new Date();
  const windowH = options.windowH ?? FRESH_WINDOW_H;
  const currentYear = options.currentYear ?? new Date().getFullYear();

  const startUtc = athensStartOfDay(now);
  const windowStart = new Date(
    Math.min(startUtc.getTime(), now.getTime() - windowH * 3_600_000),
  );
  const videoStart = new Date(now.getTime() - 96 * 3_600_000);

  const cleaned: Item[] = [];
  const seenUrls = new Set<string>();

  for (const raw of items) {
    const title = cleanTitle(raw.title);
    if (title.length < 18 || title.length > 220) continue;
    if (GENERIC_TITLES.has(title.toLowerCase().replace(/^[ .·]+|[ .·]+$/g, ""))) continue;
    if (JUNK_TITLE.test(title) || MATCH_LISTING.test(title)) continue;

    const stale = STALE_TITLE.exec(title);
    if (stale && Number(stale[1]) < currentYear) continue;

    if (
      AD_HARD.test(title) ||
      AD_OFFER.test(title) ||
      AD_URL.test(raw.url || "")
    ) {
      lastNormalizeStats.hard_ads += 1;
      continue;
    }
    if (/\bvs\.?\b/i.test(title) && /\b20\d{2}\b/.test(title)) continue;
    if ((title.match(/\|/g) || []).length >= 2) continue;
    if (!raw.url) continue;

    let published = parseIso(raw.published);
    if (!published) published = now;
    if (published.getTime() - now.getTime() > 6 * 3_600_000) continue;

    const cutoff = raw.kind === "video" ? videoStart : windowStart;
    if (published < cutoff) continue;

    const url = raw.url.split("#")[0];
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    let summary = normalizeText(raw.summary);
    if (summary.toLowerCase().startsWith(title.toLowerCase())) {
      summary = summary.slice(title.length).replace(/^[ .\-–—]+|[ .\-–—]+$/g, "");
    }
    const summaryLower = summary.toLowerCase().replace(/^[ .]+|[ .]+$/g, "");
    if (
      summary.length < 28 ||
      summaryLower === (raw.domain || "").toLowerCase() ||
      summaryLower === (raw.source_name || "").toLowerCase() ||
      summaryLower === "nba.com" ||
      summaryLower === "imdb.com"
    ) {
      summary = "";
    }

    const adLike = AD_SOFT.test(title);
    if (adLike) lastNormalizeStats.ad_like += 1;

    cleaned.push({
      id: itemId(url, title),
      title,
      summary: summary.slice(0, 520),
      url,
      source_id: raw.source_id,
      source_name: raw.source_name,
      domain: raw.domain || "",
      lang: raw.lang || "en",
      tier: Number(raw.tier ?? 3),
      published: published.toISOString(),
      local_time: athensTime(published),
      image: raw.image ?? null,
      categories: raw.categories || [],
      kind: raw.kind ?? null,
      video_id: raw.video_id ?? null,
      channel: raw.channel ?? null,
      paragraphs: raw.paragraphs || [],
      ad_like: adLike,
      also: [],
      source_names: [],
      source_count: 1,
      category: "",
      score: 0,
    });
  }

  // Dedupe by title similarity. Python sorts by (-tier, published string).
  cleaned.sort((a, b) => {
    if (a.tier !== b.tier) return b.tier - a.tier;
    return a.published < b.published ? -1 : a.published > b.published ? 1 : 0;
  });

  const merged: (Item & { _tokens?: Set<string> })[] = [];
  for (const item of cleaned) {
    const tokenSet = tokens(item.title);
    const match = merged.find((candidate) => similarity(tokenSet, candidate._tokens!) >= 0.72);
    if (!match) {
      item._tokens = tokenSet;
      merged.push(item);
      continue;
    }

    if (!match.also.includes(item.source_id) && item.source_id !== match.source_id) {
      match.also.push(item.source_id);
      match.source_names = [...(match.source_names || []), item.source_name];
    }
    if (item.summary.length > match.summary.length) match.summary = item.summary;
    if (!match.image && item.image) match.image = item.image;
    if (item.tier < match.tier) {
      // The source changes together with the URL — never a borrowed label.
      match.tier = item.tier;
      match.source_name = item.source_name;
      match.source_id = item.source_id;
      match.domain = item.domain || "";
      match.url = item.url;
      match.id = item.id;
      match.image = item.image || match.image;
    }
    if (item.published < match.published) {
      match.published = item.published;
      match.local_time = item.local_time;
    }
  }

  for (const item of merged) {
    delete item._tokens;
    item.source_names = Array.from(
      new Set([...(item.source_names || []), item.source_name]),
    ).sort();
    item.source_count = 1 + item.also.length;
    alignSource(item);
  }

  merged.sort((a, b) =>
    a.published < b.published ? 1 : a.published > b.published ? -1 : 0,
  );
  lastNormalizeStats.total = merged.length;
  return merged;
}

export function groupBySource(items: Item[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.source_name] = (counts[item.source_name] || 0) + 1;
  }
  return counts;
}
