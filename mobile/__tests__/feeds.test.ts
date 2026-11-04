import { describe, expect, it } from "vitest";
import {
  buildTrendPages,
  latestVideos,
  parseTrends,
  summarize,
  videoId,
  type FetchLike,
} from "../src/engine";

const trendsXml = `<?xml version="1.0"?>
<rss xmlns:ht="https://trends.google.com/trending/rss" version="2.0">
  <channel>
    <item>
      <title>τεστ τάση</title>
      <ht:approx_traffic>2000+</ht:approx_traffic>
      <ht:picture>https://img.test/trend.jpg</ht:picture>
      <ht:picture_source>BBC</ht:picture_source>
      <pubDate>Fri, 30 Oct 2026 12:00:00 GMT</pubDate>
      <ht:news_item>
        <ht:news_item_title>Σχετική είδηση</ht:news_item_title>
        <ht:news_item_url>https://example.com/news</ht:news_item_url>
        <ht:news_item_source>BBC</ht:news_item_source>
      </ht:news_item>
    </item>
  </channel>
</rss>`;

const feedXml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns:media="http://search.yahoo.com/mrss/">
  <entry>
    <yt:videoId>abc123</yt:videoId>
    <title>Video headline</title>
    <published>2026-10-30T10:00:00+00:00</published>
    <author><name>Test Channel</name></author>
    <media:group>
      <media:description>A description of the video that is long enough to summarize.</media:description>
      <media:thumbnail url="https://img.test/video.jpg" />
    </media:group>
  </entry>
</feed>`;

describe("trends", () => {
  it("parses the Google Trends RSS shape", () => {
    const items = parseTrends(trendsXml);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      term: "τεστ τάση",
      traffic: "2000+",
      image: "https://img.test/trend.jpg",
      image_source: "BBC",
    });
    expect(items[0].news[0].title).toBe("Σχετική είδηση");
    expect(items[0].time).toBe("14:00");
  });

  it("builds world + country pages with caching", async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        text: async () => trendsXml,
        json: async () => ({}),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    };
    const pages = await buildTrendPages({ fetchImpl, country: "GR", perPage: 10 });
    expect(pages).toHaveLength(2);
    expect(pages[0].scope_el).toBe("ΠΑΓΚΟΣΜΙΟ");
    expect(pages[1].scope_el).toBe("ΕΛΛΆΔΑ");
    expect(pages[0].rows[0].rank).toBe(1);
    expect(calls).toBe(2);
  });
});

describe("youtube", () => {
  it("extracts video ids from the common URL shapes", () => {
    expect(videoId("https://www.youtube.com/watch?v=abc123")).toBe("abc123");
    expect(videoId("https://youtu.be/abc123")).toBe("abc123");
    expect(videoId("https://www.youtube.com/shorts/abc123")).toBe("abc123");
    expect(videoId("https://example.com")).toBeNull();
  });

  it("parses the channel RSS feed", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => feedXml,
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const videos = await latestVideos("UC123", fetchImpl);
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      videoId: "abc123",
      title: "Video headline",
      channel: "Test Channel",
      thumbnail: "https://img.test/video.jpg",
    });
  });

  it("summarizes long text extractively", () => {
    const text = [
      "The first sentence explains the main topic of the video in enough detail to be kept.",
      "A second sentence adds context and important details about the subject.",
      "The third sentence repeats the main topic and gives more information.",
      "A fourth unrelated sentence introduces another subject for contrast.",
      "A fifth sentence closes the summary with a final detail.",
    ].join(" ");
    const summary = summarize(text, 2, 40);
    expect(summary.length).toBeGreaterThan(30);
    expect(summary.split(/\s+/).length).toBeLessThanOrEqual(45);
  });
});
