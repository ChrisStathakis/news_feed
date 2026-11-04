/**
 * YouTube channel feeds + extractive summaries, ported from newspaper/youtube.py.
 */

import { XMLParser } from "fast-xml-parser";
import type { FetchLike } from "./collect";
import type { RawItem, Source } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "en-US,en;q=0.9,el;q=0.8",
  Cookie: "SOCS=CAI",
};

const CHANNEL_ID_RE = /"channelId":"(UC[0-9A-Za-z_-]{22})"/;
const EXTERNAL_ID_RE = /"externalId":"(UC[0-9A-Za-z_-]{22})"/;
const CHANNEL_META_RE = /<meta itemprop="identifier" content="(UC[0-9A-Za-z_-]{22})"/;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});

export function isYoutubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("youtube.com") || host.includes("youtu.be");
  } catch {
    return false;
  }
}

export function videoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace(/^\/+/, "").split("/")[0] || null;
    }
    if (parsed.pathname.startsWith("/watch")) {
      return parsed.searchParams.get("v");
    }
    for (const prefix of ["/shorts/", "/embed/", "/live/"]) {
      if (parsed.pathname.startsWith(prefix)) {
        return parsed.pathname.slice(prefix.length).split("/")[0];
      }
    }
    return null;
  } catch {
    return null;
  }
}

function extractChannelId(html: string): string | null {
  for (const pattern of [EXTERNAL_ID_RE, CHANNEL_ID_RE, CHANNEL_META_RE]) {
    const match = pattern.exec(html || "");
    if (match) return match[1];
  }
  return null;
}

const channelCache = new Map<string, { id: string; title: string; url: string }>();

async function fetchPage(url: string, fetchImpl: FetchLike): Promise<string> {
  try {
    const response = await fetchImpl(url, { headers: HEADERS });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  }
}

export async function resolveChannel(
  url: string,
  fetchImpl: FetchLike,
): Promise<{ id: string; title: string; url: string } | null> {
  const key = url.replace(/\/+$/, "");
  const cached = channelCache.get(key);
  if (cached?.id) return cached;

  const direct = /\/(?:channel|user)\/(UC[0-9A-Za-z_-]{22})/.exec(url);
  if (direct) {
    const info = { id: direct[1], title: "", url };
    channelCache.set(key, info);
    return info;
  }

  let target = url;
  if (url.includes("/watch") || url.includes("youtu.be")) {
    const vid = videoId(url);
    target = vid ? `https://www.youtube.com/watch?v=${vid}` : url;
  }

  let html = await fetchPage(target, fetchImpl);
  let channel = extractChannelId(html);

  if (!channel) {
    const handle = url.replace(/\/+$/, "").split("/").pop()?.replace(/^@/, "") || "";
    for (const alternative of [
      `https://www.youtube.com/user/${handle}`,
      `https://www.youtube.com/c/${handle}`,
    ]) {
      const alt = await fetchPage(alternative, fetchImpl);
      if (alt) {
        channel = extractChannelId(alt);
        if (channel) {
          html = alt;
          break;
        }
      }
    }
  }

  if (!channel) return null;
  const titleMatch = /<meta property="og:title" content="([^"]+)"/.exec(html);
  const info = { id: channel, title: titleMatch ? titleMatch[1].trim() : "", url };
  channelCache.set(key, info);
  return info;
}

export interface YoutubeVideo {
  videoId: string;
  title: string;
  published: string;
  description: string;
  thumbnail: string;
  channel: string;
  url: string;
}

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const text = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    return String((value as Record<string, unknown>)["#text"] ?? "").trim();
  }
  return "";
};

export async function latestVideos(
  channelId: string,
  fetchImpl: FetchLike,
  limit = 8,
): Promise<YoutubeVideo[]> {
  const response = await fetchImpl(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
    { headers: { "User-Agent": UA } },
  );
  if (!response.ok) return [];

  let data: Record<string, unknown>;
  try {
    data = parser.parse(await response.text()) as Record<string, unknown>;
  } catch {
    return [];
  }
  const feed = data.feed as Record<string, unknown> | undefined;
  const entries = asArray<Record<string, unknown>>(
    feed?.entry as Record<string, unknown> | undefined,
  );

  const videos: YoutubeVideo[] = [];
  for (const entry of entries) {
    const id = text(entry.videoId);
    const title = text(entry.title);
    if (!id || !title) continue;
    const group = entry.group as Record<string, unknown> | undefined;
    const description = text(group?.description);
    const thumbNode = group?.thumbnail as Record<string, unknown> | undefined;
    const thumb = String(thumbNode?.["@_url"] || "");
    const channel = text((entry.author as Record<string, unknown> | undefined)?.name);
    videos.push({
      videoId: id,
      title,
      published: text(entry.published),
      description,
      thumbnail: thumb || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      channel,
      url: `https://www.youtube.com/watch?v=${id}`,
    });
    if (videos.length >= limit) break;
  }
  return videos;
}

/* ---------------------------------------------------------------- transcript */

export async function transcript(
  video: string,
  fetchImpl: FetchLike,
): Promise<string> {
  try {
    const html = await fetchPage(`https://www.youtube.com/watch?v=${video}`, fetchImpl);
    const match = /"captionTracks":(\[.*?\])/.exec(html);
    if (!match) return "";
    const tracks = JSON.parse(match[1]) as {
      baseUrl?: string;
      languageCode?: string;
      kind?: string;
    }[];
    const preferred =
      tracks.find((track) => ["el", "en", "en-US"].includes(track.languageCode || "")) ||
      tracks[0];
    if (!preferred?.baseUrl) return "";
    const response = await fetchImpl(`${preferred.baseUrl}&fmt=json3`, {
      headers: { "User-Agent": UA },
    });
    if (!response.ok) return "";
    const data = (await response.json()) as {
      events?: { segs?: { utf8?: string }[] }[];
    };
    return (data.events || [])
      .map((event) => (event.segs || []).map((seg) => seg.utf8 || "").join(""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ summary */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "it", "its", "this", "that", "as",
  "at", "by", "from", "we", "you", "they", "he", "she", "i", "not", "so", "if",
  "και", "να", "το", "η", "ο", "τα", "οι", "του", "της", "των", "στο", "στη",
  "με", "για", "από", "που", "θα", "είναι", "ένα", "μια", "δεν", "αλλά",
]);

const tokensOf = (text: string): string[] =>
  (text.toLowerCase().match(/[A-Za-zΑ-Ωα-ωΆ-Ώά-ώ0-9']{3,}/g) || []).filter(
    (word) => !STOPWORDS.has(word),
  );

export function summarize(text: string, sentences = 6, maxWords = 180): string {
  let clean = (text || "").replace(/https?:\/\/\S+/g, " ");
  clean = clean.replace(/(subscribe|ακολουθήστε|εγγραφείτε|περισσότερα στο|more at)\s*:?\s*/gi, " ");
  clean = clean.replace(/#\w+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return "";

  const parts = clean.split(/(?<=[.!?;])\s+|\n+/).map((part) => part.trim()).filter((part) => part.length > 40);
  if (parts.length <= sentences) return parts.join(" ").slice(0, maxWords * 8);

  const freq: Record<string, number> = {};
  for (const part of parts) {
    for (const token of tokensOf(part)) freq[token] = (freq[token] || 0) + 1;
  }

  const scored = parts
    .map((part, index) => {
      const tokens = tokensOf(part);
      if (!tokens.length) return null;
      const weight = tokens.reduce((sum, token) => sum + (freq[token] || 1), 0) / tokens.length ** 0.6;
      const position = index < 3 ? 1 : 1 / (index + 1) ** 0.4;
      return { score: weight * position, index, part };
    })
    .filter((entry): entry is { score: number; index: number; part: string } => entry !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, sentences)
    .sort((a, b) => a.index - b.index);

  const out: string[] = [];
  let used = 0;
  for (const entry of scored) {
    if (used + entry.part.split(/\s+/).length > maxWords) break;
    out.push(entry.part);
    used += entry.part.split(/\s+/).length;
  }
  return out.length ? out.join(" ") : parts.slice(0, sentences).join(" ");
}

/* ------------------------------------------------------------------ collect */

export async function collectYoutube(
  source: Source,
  fetchImpl: FetchLike,
  limit = 6,
): Promise<{ items: RawItem[]; method: string }> {
  const url = source.home || source.site_url || source.domain;
  const info = await resolveChannel(url, fetchImpl);
  if (!info) return { items: [], method: "youtube" };

  const videos = await latestVideos(info.id, fetchImpl, limit);
  const items: RawItem[] = [];
  for (const video of videos) {
    const script = await transcript(video.videoId, fetchImpl);
    const summary = script
      ? summarize(script, 6, 170)
      : summarize(video.description || "", 4, 90);
    const channel = video.channel || info.title || source.name;
    items.push({
      source_id: source.id,
      source_name: channel || source.name,
      domain: "youtube.com",
      lang: "en",
      tier: 3,
      title: video.title,
      summary,
      url: video.url,
      published: video.published || new Date().toISOString(),
      image: video.thumbnail,
      categories: ["video"],
      kind: "video",
      video_id: video.videoId,
      channel,
    });
  }
  return { items, method: "youtube" };
}
