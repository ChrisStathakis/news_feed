import { describe, expect, it } from "vitest";
import { attachArticles, type FetchLike, type RawItem } from "../src/engine";

const item = (url: string): RawItem => ({
  title: "A long enough headline for the article",
  summary: "Summary",
  url,
  source_id: "bbc",
  source_name: "BBC News",
  domain: "bbc.com",
  lang: "en",
  tier: 1,
  published: "2026-10-30T12:00:00Z",
  paragraphs: [],
});

const paragraph =
  "This is a long paragraph with enough words to be extracted and kept by the article extraction pipeline, " +
  "including additional detail that makes the text realistic and long enough to pass the minimum threshold.";

const articleHtml = `<html><head>
  <meta property="og:image" content="https://img.test/hero.jpg" />
</head><body><article><h1>Headline</h1><p>${paragraph}</p><p>${paragraph}</p></article></body></html>`;

const response = (text: string) => ({
  ok: true,
  status: 200,
  text: async () => text,
  json: async () => ({}),
  arrayBuffer: async () => new ArrayBuffer(0),
});

describe("article attachment", () => {
  it("extracts paragraphs and images over HTTP", async () => {
    const fetchImpl: FetchLike = async () => response(articleHtml);
    const entry = item("https://example.com/story");
    const result = await attachArticles([entry], { fetchImpl, concurrency: 2 });
    expect(result.ok).toBe(1);
    expect(entry.paragraphs?.length).toBeGreaterThan(0);
    expect(entry.words).toBeGreaterThan(30);
    expect(entry.image).toBe("https://img.test/hero.jpg");
  });

  it("falls back to rendered HTML for weak pages", async () => {
    const fetchImpl: FetchLike = async () => response("<html><body><div>loading</div></body></html>");
    let rendered = 0;
    const entry = item("https://example.com/js-story");
    const result = await attachArticles([entry], {
      fetchImpl,
      concurrency: 1,
      renderHtml: async () => {
        rendered += 1;
        return articleHtml;
      },
    });
    expect(rendered).toBe(1);
    expect(result.webview).toBe(1);
    expect(entry.paragraphs?.length).toBeGreaterThan(0);
  });

  it("respects the webview fallback cap", async () => {
    const fetchImpl: FetchLike = async () => response("<html><body>empty</body></html>");
    let rendered = 0;
    const entries = [item("https://example.com/1"), item("https://example.com/2")];
    await attachArticles(entries, {
      fetchImpl,
      concurrency: 2,
      webviewLimit: 1,
      renderHtml: async () => {
        rendered += 1;
        return articleHtml;
      },
    });
    expect(rendered).toBe(1);
  });
});
