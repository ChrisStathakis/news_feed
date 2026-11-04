/**
 * Article body/image attachment.
 *
 * Uses HTTP first (Readability via linkedom). If the page is JS-heavy,
 * blocked or empty, an optional renderHtml callback can render it in a hidden
 * WebView and hand the DOM back to the same extractor.
 */

import type { FetchLike } from "./collect";
import { extractFromHtml } from "./extract";
import type { RawItem } from "./types";

export interface AttachOptions {
  fetchImpl: FetchLike;
  renderHtml?: (url: string) => Promise<string | null>;
  limit?: number;
  concurrency?: number;
  minWords?: number;
  webviewLimit?: number;
  onProgress?: (done: number, total: number, webview: number) => void;
}

export interface AttachResult {
  fetched: number;
  ok: number;
  webview: number;
}

export interface ArticleData {
  url: string;
  ok: boolean;
  title: string;
  paragraphs: string[];
  images: string[];
  words: number;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function needsArticle(item: RawItem & { paragraphs?: string[]; words?: number }): boolean {
  return (
    Boolean(item.url && item.url.startsWith("http")) &&
    ((item.words || 0) < 60 || !(item.paragraphs || []).length)
  );
}

export async function attachArticles(
  items: (RawItem & { paragraphs?: string[]; words?: number })[],
  options: AttachOptions,
): Promise<AttachResult> {
  const limit = options.limit ?? 30;
  const concurrency = options.concurrency ?? 4;
  const minWords = options.minWords ?? 60;
  const webviewLimit = options.webviewLimit ?? 8;

  const targets = items.filter(needsArticle).slice(0, limit);
  const result: AttachResult = { fetched: 0, ok: 0, webview: 0 };
  let cursor = 0;
  let webviewUsed = 0;

  const workers = Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
    while (cursor < targets.length) {
      const item = targets[cursor];
      cursor += 1;
      const url = item.url || "";
      let html: string | null = null;

      try {
        const response = await options.fetchImpl(url, {
          headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.8" },
        });
        if (response.ok) html = await response.text();
      } catch {
        html = null;
      }

      let article: ArticleData | null = html ? extractFromHtml(html, url) : null;
      if (article && article.images[0] && !item.image) item.image = article.images[0];

      const weak = !article || !article.ok || article.words < minWords;
      if (weak && options.renderHtml && webviewUsed < webviewLimit) {
        webviewUsed += 1;
        result.webview += 1;
        try {
          const rendered = await options.renderHtml(url);
          if (rendered) {
            const fromDom = extractFromHtml(rendered, url);
            if (!article || fromDom.words > article.words) {
              article = fromDom;
            }
          }
        } catch {
          // keep the HTTP result
        }
      }

      result.fetched += 1;
      if (article && article.ok) {
        item.paragraphs = article.paragraphs;
        item.words = article.words;
        if (article.images.length) {
          item.image_candidates = article.images;
          if (!item.image) item.image = article.images[0];
        }
        if (article.words >= minWords) result.ok += 1;
      } else {
        item.paragraphs = item.paragraphs || [];
      }
      options.onProgress?.(result.fetched, targets.length, result.webview);
    }
  });

  await Promise.all(workers);
  return result;
}
