/**
 * RSS/Atom, Google News and Jina collection.
 * Ported from newspaper/collect.py; the HTTP client is injected so the same
 * code runs in React Native (global fetch) and Node (tests).
 */

import { XMLParser } from "fast-xml-parser";
import { decode as decodeHtml } from "he";
import type { RawItem, Source } from "./types";

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<HttpResponseLike>;

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export const defaultFetch: FetchLike = (url, init) => fetch(url, init) as unknown as Promise<HttpResponseLike>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
  removeNSPrefix: false,
  processEntities: true,
});

const localName = (name: string): string => name.split(":").pop()!.toLowerCase();

function textOf(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    let out = "";
    for (const [key, value] of Object.entries(record)) {
      if (key === "#text") out += String(value);
      else if (!key.startsWith("@_")) out += textOf(value);
    }
    return out;
  }
  return "";
}

export function stripHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  let text = raw;
  if (text.includes("<")) text = text.replace(/<[^>]+>/g, " ");
  text = decodeHtml(text);
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/(\*\*|__)(.+?)\1/g, "$2");
  return text.replace(/\s+/g, " ").trim();
}

export function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return (url || "").trim();
  }
}

export function parseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const timestamp = Date.parse(trimmed);
  if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();

  const formats: [RegExp, (m: RegExpExecArray) => number][] = [
    [/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/, (m) =>
      Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])],
    [/^(\d{4})-(\d{2})-(\d{2})$/, (m) => Date.UTC(+m[1], +m[2] - 1, +m[3])],
    [/^(\d{2})\/(\d{2})\/(\d{4})[ ](\d{2}):(\d{2})$/, (m) =>
      Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])],
  ];
  for (const [pattern, build] of formats) {
    const match = pattern.exec(trimmed);
    if (match) return new Date(build(match)).toISOString();
  }
  return null;
}

export function makeItem(source: Source, data: Partial<RawItem>): RawItem {
  return {
    source_id: source.id,
    source_name: source.name,
    domain: source.domain,
    lang: source.lang,
    tier: source.tier,
    title: data.title || "",
    summary: (data.summary || "").slice(0, 600),
    url: cleanUrl(data.url || ""),
    published: data.published ?? null,
    categories: data.categories || [],
    image: data.image ?? null,
  };
}

/* ------------------------------------------------------------------ RSS/Atom */

interface FeedEntry {
  [key: string]: unknown;
}

function findEntries(node: unknown, out: FeedEntry[] = []): FeedEntry[] {
  if (Array.isArray(node)) {
    for (const value of node) findEntries(value, out);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const name = localName(key);
      if ((name === "item" || name === "entry") && value && typeof value === "object") {
        for (const entry of Array.isArray(value) ? value : [value]) {
          out.push(entry as FeedEntry);
        }
      } else if (!key.startsWith("@_") && name !== "#text") {
        findEntries(value, out);
      }
    }
  }
  return out;
}

export function parseFeed(xml: string, source: Source): RawItem[] {
  let root: unknown;
  try {
    root = parser.parse(xml);
  } catch {
    return [];
  }

  const items: RawItem[] = [];
  for (const entry of findEntries(root)) {
    const data: Record<string, string[]> = {};
    const media: string[] = [];

    for (const [key, value] of Object.entries(entry)) {
      if (key.startsWith("@_") || key === "#text") continue;
      const name = localName(key);
      const namespace = key.includes(":") ? key.slice(0, key.indexOf(":")) : "";
      const node = value as Record<string, unknown> | string;

      if ((name === "content" || name === "thumbnail") && namespace === "media") {
        const url = typeof node === "object" ? (node as Record<string, unknown>)["@_url"] : undefined;
        if (url) media.push(String(url));
        continue;
      }
      if (name === "enclosure") {
        const attrs = node as Record<string, unknown>;
        if (String(attrs?.["@_type"] || "").startsWith("image") && attrs?.["@_url"]) {
          media.push(String(attrs["@_url"]));
        }
        continue;
      }
      if (name === "link") {
        const attrs = node as Record<string, unknown>;
        const href = attrs?.["@_href"] || textOf(node);
        if (href) (data.link ||= []).push(String(href).trim());
        continue;
      }
      if (name === "category" || name === "subject") {
        const text = textOf(node).trim();
        if (text) (data.category ||= []).push(text);
        continue;
      }
      const text = textOf(node).trim();
      if (text) (data[name] ||= []).push(text);
    }

    const title = stripHtml((data.title || [""])[0]);
    const link = (data.link || []).find((candidate) => candidate.startsWith("http")) || "";
    if (!title || !link) continue;

    let summary = "";
    for (const key of ["description", "summary", "encoded", "content", "subtitle"]) {
      if (data[key]?.length) {
        summary = stripHtml(data[key][0]);
        break;
      }
    }
    if (summary === title) summary = "";

    let published: string | null = null;
    for (const key of ["pubdate", "published", "updated", "date"]) {
      if (data[key]?.length) {
        published = parseDate(data[key][0]);
        if (published) break;
      }
    }

    items.push(
      makeItem(source, {
        title,
        summary,
        url: link,
        published,
        categories: (data.category || []).filter(Boolean).slice(0, 6),
        image: media[0] || null,
      }),
    );
  }
  return items;
}

/* ------------------------------------------------------------- Google News */

export async function gnewsItems(
  query: string,
  source: Source,
  fetchImpl: FetchLike = defaultFetch,
  limit = 25,
): Promise<RawItem[]> {
  const locale =
    source.lang === "el" ? "hl=el&gl=GR&ceid=GR:el" : "hl=en-US&gl=US&ceid=US:en";
  let out: RawItem[] = [];
  for (const window of ["2d", "7d"]) {
    const url =
      "https://news.google.com/rss/search?q=" +
      encodeURIComponent(`${query} when:${window}`).replace(/%20/g, "+") +
      "&" +
      locale;
    try {
      const response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
      if (!response.ok) continue;
      const parsed = parseFeed(await response.text(), source);
      if (parsed.length) {
        out = parsed;
        break;
      }
    } catch {
      // try next window
    }
  }
  for (const item of out) {
    item.title = (item.title || "").replace(/\s+-\s+[^-]{2,40}$/, "").trim();
  }
  return out.slice(0, limit);
}

/* ---------------------------------------------------------------- Jina reader */

const MD_LINK = /^\[([^\]]{12,240})\]\((https?:\/\/[^)\s]+)\)\s*$/;

export function parseJina(raw: string, source: Source): RawItem[] {
  const filter = source.link_filter ? new RegExp(source.link_filter) : null;
  const lines = raw.split(/\r?\n/);
  const items: RawItem[] = [];
  const seen = new Set<string>();

  lines.forEach((line, index) => {
    const match = MD_LINK.exec(line.trim());
    if (!match) return;
    const title = stripHtml(match[1]);
    const url = match[2];
    if (filter && !filter.test(url)) return;
    if (seen.has(url) || title.length < 20) return;
    if (["home", "news", "watch", "stats", "schedule", "games", "more"].includes(title.toLowerCase())) {
      return;
    }
    seen.add(url);

    let summary = "";
    let image: string | null = null;
    for (const next of lines.slice(index + 1, index + 8)) {
      const value = next.trim();
      if (!value) continue;
      const img = /^!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/.exec(value);
      if (img && !image) {
        image = img[1];
        continue;
      }
      if (MD_LINK.test(value) || /^[*#-]|^See full/.test(value)) continue;
      if (value.length > 60) {
        summary = value;
        break;
      }
    }

    items.push(makeItem(source, { title, summary: summary || title, url, image }));
  });
  return items;
}

export async function fetchText(
  url: string,
  fetchImpl: FetchLike = defaultFetch,
  headers: Record<string, string> = {},
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT, ...headers },
      });
      if (response.ok) return await response.text();
      if (![403, 429, 503].includes(response.status)) return null;
    } catch {
      // retry
    }
  }
  return null;
}

export interface CollectResult {
  items: RawItem[];
  method: string;
  note: string;
}
