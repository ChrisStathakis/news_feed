/**
 * Translation via the same providers as the Python pipeline.
 * Ported from newspaper/translate.py.
 */

import { sha1 } from "./time";
import { isEnglish, isGreek, acceptLanguage } from "./text";
import type { FetchLike } from "./collect";

export const CHUNK_CHARS = 1400;
export const PROVIDERS = ["google_dict", "google_gtx", "mymemory"] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface TranslationCache {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

export class MemoryTranslationCache implements TranslationCache {
  private map = new Map<string, string>();
  get(key: string) {
    return this.map.get(key);
  }
  set(key: string, value: string) {
    this.map.set(key, value);
  }
  toJSON(): Record<string, string> {
    return Object.fromEntries(this.map);
  }
  load(data: Record<string, string>) {
    for (const [key, value] of Object.entries(data || {})) this.map.set(key, value);
  }
}

const keyOf = (text: string, sl: string, tl: string) => sha1(`${sl}|${tl}|${text}`);

async function getJson(fetchImpl: FetchLike, url: string): Promise<unknown | null> {
  try {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128" },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function googleDict(data: unknown): string | null {
  if (!Array.isArray(data) || !data.length) return null;
  if (typeof data[0] === "string") return data[0];
  if (Array.isArray(data[0])) {
    return (data[0] as unknown[])
      .map((part) => {
        if (Array.isArray(part)) return String(part[0] ?? "");
        return typeof part === "string" ? part : "";
      })
      .join("");
  }
  return null;
}

function googleGtx(data: unknown): string | null {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
  return (data[0] as unknown[])
    .map((segment) => (Array.isArray(segment) ? String(segment[0] ?? "") : ""))
    .join("");
}

function myMemory(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const responseData = record.responseData as Record<string, unknown> | undefined;
  const out = String(responseData?.translatedText || "");
  if (!out || ![200, "200"].includes(record.responseStatus as never)) return null;
  if (out.toUpperCase().includes("MYMEMORY WARNING")) return null;
  return out;
}

async function callProvider(
  provider: Provider,
  text: string,
  sl: string,
  tl: string,
  fetchImpl: FetchLike,
): Promise<string | null> {
  let result: string | null = null;
  if (provider === "google_dict") {
    const params = new URLSearchParams({
      client: "dict-chrome-ex",
      sl,
      tl,
      q: text,
    });
    result = googleDict(
      await getJson(fetchImpl, `https://clients5.google.com/translate_a/t?${params}`),
    );
  } else if (provider === "google_gtx") {
    const params = new URLSearchParams({ client: "gtx", sl, tl, dt: "t", q: text });
    result = googleGtx(
      await getJson(fetchImpl, `https://translate.googleapis.com/translate_a/single?${params}`),
    );
  } else {
    const params = new URLSearchParams({
      q: text.slice(0, 900),
      langpair: `${sl}|${tl}`,
    });
    result = myMemory(
      await getJson(fetchImpl, `https://api.mymemory.translated.net/get?${params}`),
    );
  }
  return result ? result.replace(/\s+/g, " ").trim() || null : null;
}

export interface TranslatorOptions {
  fetchImpl: FetchLike;
  cache?: TranslationCache;
  sleep?: (ms: number) => Promise<void>;
}

export function createTranslator(options: TranslatorOptions) {
  const { fetchImpl, cache = new MemoryTranslationCache() } = options;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function translateRaw(
    text: string,
    sl: string,
    tl: string,
    attempts = 2,
  ): Promise<string | null> {
    const key = keyOf(text, sl, tl);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const rotated = [
        ...PROVIDERS.slice(attempt % PROVIDERS.length),
        ...PROVIDERS.slice(0, attempt % PROVIDERS.length),
      ];
      for (const provider of rotated) {
        const out = await callProvider(provider, text, sl, tl, fetchImpl);
        if (out) {
          cache.set(key, out);
          return out;
        }
      }
      if (attempt < attempts - 1) await sleep(1000 * (attempt + 1));
    }
    return null;
  }

  async function translate(text: string, sl = "en", tl = "el", attempts = 2): Promise<string> {
    const value = (text || "").trim();
    if (!value || sl === tl || isGreek(value)) return value;
    return (await translateRaw(value, sl, tl, attempts)) || value;
  }

  async function translateChecked(
    text: string,
    target: "el" | "en" = "el",
  ): Promise<[string, boolean]> {
    const source = (text || "").trim();
    if (!source) return ["", true];
    if (target === "el" && isGreek(source)) return [source, true];
    if (target === "en" && isEnglish(source)) return [source, true];

    const seen: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const out = await translateRaw(source, "en", target, 1);
      if (out && !seen.includes(out)) {
        seen.push(out);
        if (acceptLanguage(out, target)) return [out, true];
      }
    }
    for (const out of seen) {
      if (acceptLanguage(out, target)) return [out, true];
    }
    return [source, false];
  }

  function splitChunks(text: string, limit = CHUNK_CHARS): string[] {
    if (text.length <= limit) return [text];
    const chunks: string[] = [];
    let current = "";
    for (const paragraph of text.split(/\n{2,}/)) {
      if (current && current.length + paragraph.length + 2 > limit) {
        chunks.push(current);
        current = "";
      }
      if (paragraph.length > limit) {
        const sentences = paragraph.split(/(?<=[.!?;])\s+/);
        for (const sentence of sentences) {
          if (current && current.length + sentence.length + 1 > limit) {
            chunks.push(current);
            current = "";
          }
          current += (current ? " " : "") + sentence;
        }
      } else {
        current += (current ? "\n\n" : "") + paragraph;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  async function translateLong(
    text: string,
    target: "el" | "en" = "el",
  ): Promise<[string, boolean]> {
    if (!text) return ["", true];
    const chunks = splitChunks(text);
    const translated: string[] = [];
    let ok = true;
    for (const chunk of chunks) {
      const candidate = await translateRaw(chunk, "en", target, 1);
      if (candidate && acceptLanguage(candidate, target)) {
        translated.push(candidate);
      } else {
        ok = false;
        translated.push(chunk);
      }
    }
    return [translated.join("\n\n"), ok];
  }

  return { translate, translateChecked, translateLong, splitChunks, cache };
}
