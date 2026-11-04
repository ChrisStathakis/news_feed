import { describe, expect, it } from "vitest";
import {
  cleanUrl,
  createTranslator,
  extractFromHtml,
  parseDate,
  parseFeed,
  parseJina,
  stripHtml,
  type Source,
} from "../src/engine";

const source: Source = {
  id: "bbc",
  name: "BBC News",
  domain: "bbc.com",
  lang: "en",
  tier: 1,
  category: "news",
  home: "https://www.bbc.com/news",
};

describe("collect utils", () => {
  it("strips html and markdown", () => {
    expect(stripHtml("<p>Hello &amp; <b>world</b></p>")).toBe("Hello & world");
    expect(stripHtml("[Τίτλος](https://x.test)")).toBe("Τίτλος");
  });

  it("cleans tracking parameters", () => {
    expect(cleanUrl("https://example.com/a?utm=1#top")).toBe("https://example.com/a");
  });

  it("parses RFC822 and ISO dates", () => {
    expect(parseDate("Fri, 30 Oct 2026 12:43:46 GMT")).toBe("2026-10-30T12:43:46.000Z");
    expect(parseDate("2026-10-30T12:43:46Z")).toBe("2026-10-30T12:43:46.000Z");
    expect(parseDate("2026-10-30")).toBe("2026-10-30T00:00:00.000Z");
    expect(parseDate("nope")).toBeNull();
  });
});

const rss = `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>BBC</title>
    <item>
      <title>First headline from the feed</title>
      <link>https://www.bbc.com/news/first?utm=1</link>
      <description><![CDATA[<p>Summary of the first story.</p>]]></description>
      <pubDate>Fri, 30 Oct 2026 12:43:46 GMT</pubDate>
      <category>World</category>
      <media:thumbnail url="https://img.test/one.jpg" />
    </item>
    <item>
      <title>Second headline from the feed</title>
      <link>https://www.bbc.com/news/second</link>
      <description>Summary of the second story.</description>
      <pubDate>Fri, 30 Oct 2026 11:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Atom entry headline</title>
    <link href="https://www.bbc.com/news/atom-story" />
    <summary>Atom summary text that is long enough.</summary>
    <updated>2026-10-30T10:00:00Z</updated>
    <category term="News" />
  </entry>
</feed>`;

describe("feed parsing", () => {
  it("parses RSS with media, categories and dates", () => {
    const items = parseFeed(rss, source);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "First headline from the feed",
      url: "https://www.bbc.com/news/first",
      summary: "Summary of the first story.",
      published: "2026-10-30T12:43:46.000Z",
      categories: ["World"],
      image: "https://img.test/one.jpg",
    });
  });

  it("parses Atom entries", () => {
    const items = parseFeed(atom, source);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Atom entry headline",
      url: "https://www.bbc.com/news/atom-story",
      published: "2026-10-30T10:00:00.000Z",
    });
  });

  it("parses jina markdown with link filters", () => {
    const jinaSource: Source = {
      ...source,
      id: "imdb",
      name: "IMDb",
      domain: "imdb.com",
      link_filter: "^https?://(?!www\\.imdb\\.com/(name|title|video|list|chart|tv|search|news/))",
    };
    const markdown = [
      "[A long enough headline for the parser](https://www.imdb.com/story/one)",
      "Some summary text that is definitely longer than sixty characters and should be kept.",
      "",
      "[A long enough headline for the parser](https://www.imdb.com/title/tt123/)",
    ].join("\n");
    const items = parseJina(markdown, jinaSource);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://www.imdb.com/story/one");
    expect(items[0].summary).toContain("Some summary text");
  });
});

describe("article extraction", () => {
  it("extracts paragraphs and og:image", () => {
    const longParagraph =
      "This is a long paragraph with enough words to pass the minimum line length requirement for extraction. " +
      "It continues with more detail about the story and its context.";
    const html = `<!doctype html><html><head>
      <meta property="og:image" content="https://img.test/hero.jpg" />
      <title>Test</title>
    </head><body><article>
      <h1>Test headline</h1>
      <p>${longParagraph}</p>
      <p>${longParagraph}</p>
    </article></body></html>`;
    const article = extractFromHtml(html, "https://example.com/story");
    expect(article.ok).toBe(true);
    expect(article.paragraphs.length).toBeGreaterThan(0);
    expect(article.images[0]).toBe("https://img.test/hero.jpg");
  });
});

describe("translation", () => {
  it("uses the first provider and caches results", async () => {
    let calls = 0;
    const fetchImpl = async (url: string) => {
      calls += 1;
      if (url.includes("clients5.google.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => [["Μετάφραση"]],
          text: async () => "",
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }
      throw new Error("unexpected provider");
    };
    const translator = createTranslator({ fetchImpl, sleep: async () => {} });
    const [text, ok] = await translator.translateChecked("Translation");
    expect(text).toBe("Μετάφραση");
    expect(ok).toBe(true);
    await translator.translateChecked("Translation");
    expect(calls).toBe(1);
  });
});
