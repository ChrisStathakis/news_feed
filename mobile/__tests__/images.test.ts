import { describe, expect, it } from "vitest";
import {
  buildQrMap,
  enrichImages,
  metaFromHtml,
  qrDataUri,
  type Item,
} from "../src/engine";

const baseItem = (overrides: Partial<Item>): Item =>
  ({
    id: "abc",
    title: "A long enough headline for the normalizer",
    summary: "",
    url: "https://example.com/story",
    source_id: "bbc",
    source_name: "BBC News",
    domain: "bbc.com",
    lang: "en",
    tier: 1,
    published: "2026-10-30T12:00:00.000Z",
    local_time: "14:00",
    image: null,
    categories: [],
    kind: null,
    video_id: null,
    channel: null,
    paragraphs: [],
    ad_like: false,
    also: [],
    source_names: ["BBC News"],
    source_count: 1,
    category: "bbc",
    score: 10,
    ...overrides,
  }) as Item;

describe("image metadata", () => {
  it("extracts og and twitter fields", () => {
    const meta = metaFromHtml(`<!doctype html><html><head>
      <meta property="og:title" content="OG title" />
      <meta property="og:description" content="OG description long enough" />
      <meta property="og:image" content="https://img.test/hero.jpg" />
    </head></html>`);
    expect(meta.title).toBe("OG title");
    expect(meta.description).toBe("OG description long enough");
    expect(meta.image).toBe("https://img.test/hero.jpg");
  });

  it("enriches missing images and summaries", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        `<html><head><meta property="og:image" content="https://img.test/a.jpg"/><meta property="og:description" content="A much longer description that should replace the empty summary."/></head></html>`,
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const item = baseItem({});
    const result = await enrichImages([item], { fetchImpl, maxFetch: 5, concurrency: 2 });
    expect(result.images).toBe(1);
    expect(result.summaries).toBe(1);
    expect(item.image).toBe("https://img.test/a.jpg");
    expect(item.summary).toContain("much longer description");
  });

  it("skips cookie/consent descriptions", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        `<html><head><meta property="og:description" content="If you choose to accept all, we will not use cookies or IP address for personalised content and ads."/></head></html>`,
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const item = baseItem({ summary: "Original RSS summary." });
    await enrichImages([item], { fetchImpl, maxFetch: 5, concurrency: 1 });
    expect(item.summary).toBe("Original RSS summary.");
  });

  it("skips items that already have an image and summary", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      throw new Error("should not be called");
    };
    const item = baseItem({
      image: "https://img.test/existing.jpg",
      summary: "A summary that is already longer than ninety characters, so enrichment is not needed for this item at all.",
    });
    await enrichImages([item], { fetchImpl });
    expect(calls).toBe(0);
  });
});

describe("qr", () => {
  it("creates an SVG data URI", () => {
    const uri = qrDataUri("https://www.youtube.com/watch?v=abc");
    expect(uri.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(uri.split(",")[1])).toContain("<svg");
  });

  it("only creates codes for videos", () => {
    const map = buildQrMap([
      { id: "1", url: "https://youtu.be/a", kind: "video" },
      { id: "2", url: "https://example.com/b", kind: null },
      { id: "3", url: "https://youtu.be/c", source_id: "yt-channel" },
    ]);
    expect(Object.keys(map)).toEqual(["1", "3"]);
  });
});
