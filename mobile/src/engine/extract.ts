/**
 * Article extraction and image candidate discovery.
 * Replaces trafilatura + lxml from newspaper/articles.py with
 * Readability (Mozilla) on top of linkedom.
 */

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { Item } from "./types";

export const MIN_LINE = 45;

const BOILERPLATE =
  /^(read more|read also|see also|sign up|subscribe|follow us|share this|advertisement|photo(graph)?\s*:|image\s*:|getty images|afp|reuters|διαβάστε (επίσης|περισσότερα)|δείτε (επίσης|περισσότερα)|περισσότερα\s*[»>]|φωτογραφία\s*:|πηγή\s*:|διαφήμιση|εγγραφείτε|ακολουθήστε μας)\b/i;

const CONSENT =
  /(we use cookies|this site uses cookies|cookie (policy|settings|consent)|χρησιμοποιούμε cookies|πολιτική cookies|δεδομένων ip|αποδοχή όλων|accept all|manage (preferences|consent)|gdpr|consent to the use|third-party cookies|διαφημιστικούς συνεργάτες)/i;

export interface ExtractedArticle {
  url: string;
  ok: boolean;
  title: string;
  paragraphs: string[];
  images: string[];
  words: number;
}

export function cleanLines(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = (raw || "").replace(/\s+/g, " ").trim();
    if (line.length < MIN_LINE) continue;
    if (BOILERPLATE.test(line)) continue;
    if (CONSENT.test(line)) continue;
    const lower = line.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(line);
  }
  return out;
}

function fromReadability(html: string, url: string): string[] {
  try {
    const { document } = parseHTML(html);
    const article = new Readability(document as unknown as Document).parse();
    if (!article?.textContent) return [];
    return cleanLines(article.textContent.split(/\n+/));
  } catch {
    return [];
  }
}

function fromFallback(html: string): string[] {
  try {
    const { document } = parseHTML(html);
    let best: string[] = [];
    let bestLength = 0;
    const nodes = document.querySelectorAll("article, main, div[class], div[id]");
    nodes.forEach((node) => {
      const paragraphs = Array.from(node.querySelectorAll("p"))
        .map((p) => (p.textContent || "").replace(/\s+/g, " ").trim())
        .filter((p) => p.length >= MIN_LINE);
      const total = paragraphs.reduce((sum, p) => sum + p.length, 0);
      if (total > bestLength) {
        best = paragraphs;
        bestLength = total;
      }
    });
    return cleanLines(best);
  } catch {
    return [];
  }
}

export function imageCandidates(html: string): string[] {
  try {
    const { document } = parseHTML(html);
    const found: string[] = [];

    for (const key of ["property", "name", "itemprop"]) {
      for (const name of ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]) {
        document.querySelectorAll(`meta[${key}="${name}"]`).forEach((meta) => {
          const value = meta.getAttribute("content") || "";
          if (value.startsWith("http")) found.push(value);
        });
      }
    }

    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      const raw = script.textContent || "";
      for (const match of raw.matchAll(/"image"\s*:\s*"([^"]+)"/g)) {
        if (match[1].startsWith("http")) found.push(match[1]);
      }
    });

    document.querySelectorAll("article img, main img, img[src]").forEach((img) => {
      const src =
        img.getAttribute("src") || img.getAttribute("data-src") || "";
      if (!src.startsWith("http")) return;
      if (/(logo|icon|avatar|sprite|placeholder)/i.test(src)) return;
      const width = Number(img.getAttribute("width") || 0);
      if (width && width < 400) return;
      found.push(src);
    });

    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const url of found) {
      if (!seen.has(url)) {
        seen.add(url);
        cleaned.push(url);
      }
    }
    return cleaned.slice(0, 6);
  } catch {
    return [];
  }
}

export function extractFromHtml(html: string, url: string): ExtractedArticle {
  const paragraphs = fromReadability(html, url);
  const finalParagraphs = paragraphs.length ? paragraphs : fromFallback(html);
  return {
    url,
    ok: finalParagraphs.length > 0,
    title: "",
    paragraphs: finalParagraphs,
    images: imageCandidates(html),
    words: finalParagraphs.reduce((sum, p) => sum + p.split(/\s+/).length, 0),
  };
}

export function excerpt(article: Partial<Item> & { paragraphs?: string[] }, maxWords: number): string {
  const paragraphs = article.paragraphs || [];
  if (!paragraphs.length) return "";
  const parts: string[] = [];
  let used = 0;
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/);
    if (used + words.length <= maxWords) {
      parts.push(paragraph);
      used += words.length;
    } else {
      const remaining = maxWords - used;
      if (remaining >= 25) {
        parts.push(words.slice(0, remaining).join(" ").replace(/[,;:]+$/, "") + "…");
      }
      break;
    }
  }
  return parts.join("\n");
}
