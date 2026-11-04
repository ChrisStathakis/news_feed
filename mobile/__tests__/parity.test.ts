import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildEdition,
  loadSettings,
  loadSources,
  normalize,
  rank,
  resolve as resolveSections,
  runtimeConfig,
  type RawItem,
  type Section,
} from "../src/engine";

const repoRoot = resolve(__dirname, "../..");
const fixture = JSON.parse(
  readFileSync(resolve(__dirname, "../parity/fixtures/parity.json"), "utf8"),
);
const settings = loadSettings(
  JSON.parse(readFileSync(resolve(repoRoot, "settings.json"), "utf8")),
);
const sites = readFileSync(resolve(repoRoot, "sites.txt"), "utf8");
const now = new Date(fixture.now);

describe("sources", () => {
  it("maps sites.txt to the same 11 sources as Python", () => {
    // parity fixture was generated with collect.load_sources(); compare keys.
    const sources = loadSources({ sitesText: sites, settings });
    expect(sources.map((source) => source.id)).toEqual(
      fixture.sections.map((section: Section) => section.key),
    );
  });

  it("builds sections with the same page targets", () => {
    const sources = loadSources({ sitesText: sites, settings });
    const sections = resolveSections(sources, settings.weights);
    expect(
      sections.map((section) => ({
        key: section.key,
        pages: section.pages,
        kind: section.kind,
        order: section.order,
      })),
    ).toEqual(
      fixture.sections.map((section: Section) => ({
        key: section.key,
        pages: section.pages,
        kind: section.kind,
        order: section.order,
      })),
    );
  });
});

describe("normalize parity", () => {
  const items = normalize(fixture.raw as RawItem[], {
    now,
    currentYear: 2026,
  });

  it("keeps the same items, in the same order", () => {
    expect(items.map((item) => item.id)).toEqual(
      fixture.normalized.map((item: { id: string }) => item.id),
    );
  });

  it("matches titles, summaries, source counts and local times", () => {
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const expected of fixture.normalized) {
      const actual = byId.get(expected.id);
      expect(actual, `missing ${expected.id}`).toBeTruthy();
      expect({
        title: actual!.title,
        summary: actual!.summary,
        source_id: actual!.source_id,
        source_name: actual!.source_name,
        source_count: actual!.source_count,
        source_names: actual!.source_names,
        local_time: actual!.local_time,
        tier: actual!.tier,
        ad_like: actual!.ad_like,
      }).toEqual({
        title: expected.title,
        summary: expected.summary,
        source_id: expected.source_id,
        source_name: expected.source_name,
        source_count: expected.source_count,
        source_names: expected.source_names,
        local_time: expected.local_time,
        tier: expected.tier,
        ad_like: expected.ad_like,
      });
    }
  });
});

describe("rank parity", () => {
  const items = normalize(fixture.raw as RawItem[], { now, currentYear: 2026 });
  const sections: Section[] = fixture.sections;
  const order = Object.fromEntries(
    sections.map((section) => [section.key, section.order]),
  );
  const ranked = rank(items, now, order, runtimeConfig(settings));

  it("produces the same order and scores", () => {
    expect(ranked.map((item) => item.id)).toEqual(
      fixture.ranked.map((item: { id: string }) => item.id),
    );
    for (const [index, expected] of fixture.ranked.entries()) {
      expect(Math.abs(ranked[index].score - expected.score)).toBeLessThan(0.05);
      expect(ranked[index].category).toBe(expected.category);
    }
  });

  it("paginates the same edition", () => {
    const edition = buildEdition(
      ranked.map((item) => ({ ...item })),
      sections,
    );
    expect(edition.lead?.id ?? null).toBe(fixture.edition.lead);
    expect(edition.secondary.map((item) => item.id)).toEqual(
      fixture.edition.secondary,
    );
    expect(
      edition.pages.map((page) => ({
        num: page.num,
        key: page.key,
        kind: page.kind,
        featured: page.featured?.id ?? null,
        stories: page.stories.map((item) => item.id),
      })),
    ).toEqual(fixture.edition.pages);
    expect(edition.briefs.map((item) => item.id)).toEqual(fixture.edition.briefs);
    expect(edition.today.map((item) => item.id)).toEqual(fixture.edition.today);
    expect(edition.numbers).toEqual(fixture.edition.numbers);
  });
});
