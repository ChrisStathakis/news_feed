import { describe, expect, it } from "vitest";
import {
  buildEdition,
  buildPayload,
  displayItem,
  loadSettings,
  normalize,
  rank,
  renderEdition,
  resolve as resolveSections,
  runtimeConfig,
  type Item,
  type RawItem,
  type Source,
} from "../src/engine";

const settings = loadSettings({
  edition: { name: "Η Ημερήσια", name_en: "THE DAILY" },
  theme: { preset: "light", font_scale: 1 },
});

const source: Source = {
  id: "bbc",
  name: "BBC News",
  domain: "bbc.com",
  lang: "en",
  tier: 1,
  category: "news",
  home: "https://www.bbc.com/news",
};

const headlines = [
  "Parliament approves the new budget after a long debate",
  "Another headline with <script>alert(1)</script> inside",
  "Earthquake shakes the southern islands during the night",
  "National team wins the championship in a dramatic final",
  "Markets rally as inflation slows for a third month",
  "New technology promises faster batteries for phones",
  "Film festival opens with a tribute to Greek cinema",
  "Wildfires force evacuations in the northern region",
  "Scientists announce a breakthrough in cancer research",
  "Prime minister visits Brussels for a European summit",
];

const raw: RawItem[] = Array.from({ length: 10 }, (_, index) => ({
  title: `${headlines[index]} (report ${index})`,
  summary: "A summary that is long enough to be kept by the normalizer.",
  url: `https://www.bbc.com/news/story-${index}`,
  source_id: "bbc",
  source_name: "BBC News",
  domain: "bbc.com",
  lang: "en",
  tier: 1,
  published: `2026-10-30T${String(12 - (index % 5)).padStart(2, "0")}:${String(10 + index).padStart(2, "0")}:00Z`,
  image: index % 2 === 0 ? "https://img.test/one.jpg" : null,
  paragraphs: [
    "This is a long paragraph with enough words to be used by the edition template and the story cards.",
    "A second paragraph with more details about the story and its context for the reader.",
  ],
}));

const now = new Date("2026-10-30T13:00:00Z");
const items = normalize(raw, { now, currentYear: 2026 });
const sections = resolveSections([source], settings.weights);
rank(items, now, { bbc: 0 }, runtimeConfig(settings));
const edition = buildEdition(items, sections, { config: runtimeConfig(settings) });

describe("display payload", () => {
  it("builds display fields from an item", () => {
    const item = displayItem(items.find((candidate) => candidate.image)!, {}, {}, settings);
    expect(item.title_el).toBeTruthy();
    expect(item.body.length).toBeGreaterThanOrEqual(1);
    expect(item.img).toBe("https://img.test/one.jpg");
    expect(item.badge).toBe("EN");
  });

  it("computes totals, sections and index", () => {
    const payload = buildPayload({
      edition,
      today: now,
      settings,
      sources: [{ name: "BBC News", status: "ok", method: "rss", items: 2, last_ok: "13:00" }],
    });
    expect(payload.total_pages).toBe(1 + edition.pages.length + 2);
    expect(payload.briefs_page).toBe(payload.total_pages - 1);
    expect(payload.sources_page).toBe(payload.total_pages);
    expect(payload.sections.length).toBeGreaterThanOrEqual(1);
    expect(payload.index.length).toBeGreaterThan(0);
  });
});

describe("html rendering", () => {
  it("renders the cover, pages and escaped content", () => {
    const payload = buildPayload({ edition, today: now, settings });
    const html = renderEdition(payload, settings);
    expect(html).toContain("Η Ημερήσια");
    expect(html).toContain("page--cover");
    expect(html).toContain("page--briefs");
    expect(html).toContain("page--sources");
    expect(html).toContain("--paper:#f4efe1");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("handles an empty edition", () => {
    const emptyEdition = {
      lead: null,
      secondary: [],
      pages: [],
      briefs: [],
      today: [],
      numbers: {
        total: 0, counts: {}, rows: [], sources: 0, first_time: "—", last_time: "—",
        with_image: 0, image_ratio: 0, video: 0, briefs: 0, avg_score: 0,
      },
    };
    const payload = buildPayload({ edition: emptyEdition as never, today: now, settings });
    const html = renderEdition(payload, settings);
    expect(html).toContain("Το φύλλο της ημέρας");
    expect(html).toContain("Δεν υπάρχουν σύντομα σήμερα");
  });
});

export type { Item };
