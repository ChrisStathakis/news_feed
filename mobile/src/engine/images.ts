/**
 * Image enrichment (og:image / twitter:image / JSON-LD / first article image).
 * Ported from newspaper/images.py; downloading + vintage processing will be
 * added on top of this in a later milestone.
 */

import { parseHTML } from "linkedom";
import type { FetchLike } from "./collect";
import { imageCandidates } from "./extract";
import type { Item } from "./types";

export interface EnrichOptions {
  fetchImpl: FetchLike;
  maxFetch?: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

export interface EnrichResult {
  fetched: number;
  images: number;
  summaries: number;
}

export interface ArticleMeta {
  title: string;
  description: string;
  image: string;
  published: string;
}

function metaValue(document: ReturnType<typeof parseHTML>["document"], names: string[]): string {
  for (const name of names) {
    for (const key of ["property", "name", "itemprop"]) {
      const node = document.querySelector(`meta[${key}="${name}"]`);
      const value = node?.getAttribute("content")?.trim();
      if (value) return value;
    }
  }
  return "";
}

export function metaFromHtml(html: string): ArticleMeta {
  try {
    const { document } = parseHTML(html);
    let image = metaValue(document, ["og:image", "twitter:image", "twitter:image:src"]);
    if (!image) {
      const candidates = imageCandidates(html);
      image = candidates[0] || "";
    }
    return {
      title: metaValue(document, ["og:title", "twitter:title", "headline"]),
      description: metaValue(document, ["og:description", "twitter:description", "description"]),
      image,
      published: metaValue(document, ["article:published_time", "datePublished", "og:updated_time"]),
    };
  } catch {
    return { title: "", description: "", image: "", published: "" };
  }
}

async function fetchMeta(
  url: string,
  fetchImpl: FetchLike,
): Promise<ArticleMeta> {
  try {
    const response = await fetchImpl(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
    if (!response.ok) return { title: "", description: "", image: "", published: "" };
    return metaFromHtml(await response.text());
  } catch {
    return { title: "", description: "", image: "", published: "" };
  }
}

const BAD_DESCRIPTION =
  /(accept all|we use cookies|this site uses cookies|cookie (policy|settings|consent)|privacy policy|gdpr|manage (preferences|consent)|sign in|log in|subscribe to|newsletter|advertise with us|terms of (use|service)|all rights reserved|αποδοχή όλων|πολιτική cookies|χρησιμοποιούμε cookies|εγγραφείτε|διαφήμιση)/i;

function validImage(url: string | null | undefined): string {
  if (!url || !/^https?:\/\//i.test(url)) return "";
  if (/(logo|icon|avatar|sprite|placeholder|1x1|pixel)/i.test(url)) return "";
  return url;
}

function usefulDescription(value: string, current: string): boolean {
  const description = value.trim();
  return (
    description.length > current.length &&
    description.length >= 28 &&
    !BAD_DESCRIPTION.test(description)
  );
}

export async function enrichImages(
  items: Item[],
  options: EnrichOptions,
): Promise<EnrichResult> {
  const maxFetch = options.maxFetch ?? 45;
  const concurrency = options.concurrency ?? 4;
  const targets = items
    .filter((item) => !item.image || (item.summary || "").length < 90)
    .slice(0, maxFetch);

  const result: EnrichResult = { fetched: 0, images: 0, summaries: 0 };
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
    while (cursor < targets.length) {
      const item = targets[cursor];
      cursor += 1;
      const meta = await fetchMeta(item.url, options.fetchImpl);
      result.fetched += 1;

      const image = validImage(meta.image);
      if (image && !item.image) {
        item.image = image;
        result.images += 1;
      }
      const description = (meta.description || "").trim();
      if (usefulDescription(description, item.summary || "")) {
        item.summary = description.slice(0, 520);
        result.summaries += 1;
      }
      if (meta.title && (item.title || "").length < 25) item.title = meta.title;
      if (meta.published && !item.published_exact) item.published_exact = meta.published;

      options.onProgress?.(result.fetched, targets.length);
    }
  });
  await Promise.all(workers);
  return result;
}

export function imageCoverage(items: Item[]): { with_image: number; ratio: number } {
  const withImage = items.filter((item) => item.image).length;
  return {
    with_image: withImage,
    ratio: items.length ? Math.round((100 * withImage) / items.length) : 0,
  };
}
