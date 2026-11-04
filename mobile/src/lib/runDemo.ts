/**
 * On-device demo pipeline: collect → normalize → rank → paginate.
 *
 * This is the first end-to-end slice of the mobile engine. HTML/PDF/images
 * are the next milestones; today's screen proves that the JS port produces
 * a ranked edition from the live feeds.
 */

import {
  attachArticles,
  buildEdition,
  buildPayload,
  buildQrMap,
  buildTrendPages,
  collectYoutube,
  defaultFetch,
  enrichImages,
  fetchText,
  gnewsItems,
  loadSettings,
  loadSources,
  normalize,
  parseFeed,
  parseJina,
  rank,
  renderEdition,
  resolve as resolveSections,
  runtimeConfig,
  healthRows,
  isQuarantined,
  updateHealth,
  type Edition,
  type FetchLike,
  type HealthState,
  type ImageMap,
  type Item,
  type RawItem,
  type Source,
  type SourceStatus,
} from "@/engine";
import { setLatestEdition } from "./editionStore";
import { SEED_SETTINGS_JSON, SEED_SITES } from "./seed";

export type ProgressFn = (message: string, percent: number) => void;

export interface DemoResult {
  items: Item[];
  edition: Edition;
  report: { source: string; count: number; method: string }[];
  rawCount: number;
  health: HealthState;
}

export interface DemoOptions {
  health?: HealthState;
  renderHtml?: (url: string) => Promise<string | null>;
  resolveImages?: (items: Item[]) => Promise<ImageMap>;
}

const PER_SOURCE_LIMIT = 25;

function secureUrl(url: string): string {
  return url.replace(/^http:\/\//i, "https://");
}

function withTimeout(fetchImpl: FetchLike, ms = 20_000): FetchLike {
  return async (url, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

async function collectSource(
  source: Source,
  fetchImpl: FetchLike,
): Promise<{ items: RawItem[]; method: string }> {
  if (source.kind === "youtube") {
    return collectYoutube(source, fetchImpl, 6);
  }

  for (const feed of source.feeds || []) {
    const text = await fetchText(secureUrl(feed), fetchImpl);
    if (!text) continue;
    const items = parseFeed(text, source);
    if (items.length) return { items: items.slice(0, PER_SOURCE_LIMIT), method: "rss" };
  }

  if (source.jina) {
    const text = await fetchText(source.jina, fetchImpl);
    if (text) {
      const items = parseJina(text, source);
      if (items.length) return { items: items.slice(0, PER_SOURCE_LIMIT), method: "jina" };
    }
  }

  const query = source.gnews || `site:${source.domain}`;
  const items = await gnewsItems(query, source, fetchImpl, PER_SOURCE_LIMIT);
  if (items.length) return { items, method: "gnews" };

  return { items: [], method: "none" };
}

export async function runEditionDemo(
  onProgress: ProgressFn = () => {},
  options: DemoOptions = {},
): Promise<DemoResult> {
  const settings = loadSettings(SEED_SETTINGS_JSON);
  const config = runtimeConfig(settings);
  const allSources = loadSources({ sitesText: SEED_SITES, settings });
  const sources = allSources.filter((source) => !isQuarantined(options.health?.[source.name]));
  const sections = resolveSections(allSources, settings.weights);
  const fetchImpl = withTimeout(defaultFetch);

  onProgress(`Συλλογή από ${sources.length} πηγές…`, 5);

  const trendPromise = buildTrendPages({
    fetchImpl,
    country: config.trends.country,
    perPage: config.trends.perPage,
  }).catch(() => []);

  let done = 0;
  const results: { source: Source; items: RawItem[]; method: string }[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, sources.length) }, async () => {
    while (cursor < sources.length) {
      const source = sources[cursor];
      cursor += 1;
      const result = await collectSource(source, fetchImpl);
      done += 1;
      onProgress(
        `${source.name}: ${result.items.length} θέματα (${result.method})`,
        5 + Math.round((done / sources.length) * 55),
      );
      results.push({ source, ...result });
    }
  });
  await Promise.all(workers);

  const raw = results.flatMap((result) => result.items);
  onProgress(`Καθαρισμός & dedupe (${raw.length} θέματα)…`, 65);

  const now = new Date();
  const items = normalize(raw, { now });
  const order = Object.fromEntries(sections.map((section) => [section.key, section.order]));
  const ranked = rank(items, now, order, config);

  onProgress("Εμπλουτισμός εικόνων…", 70);
  const enrichment = await enrichImages(ranked.slice(0, 60), {
    fetchImpl,
    maxFetch: 45,
    concurrency: 4,
    onProgress: (done, total) =>
      onProgress(
        `Εικόνες ${done}/${total}`,
        70 + Math.round((done / Math.max(1, total)) * 6),
      ),
  });

  onProgress("Ανάκτηση άρθρων…", 77);
  const articles = await attachArticles(ranked.slice(0, 40), {
    fetchImpl,
    renderHtml: options.renderHtml,
    limit: 34,
    concurrency: 4,
    webviewLimit: 8,
    onProgress: (done, total, webview) =>
      onProgress(
        `Άρθρα ${done}/${total}${webview ? ` · webview ${webview}` : ""}`,
        77 + Math.round((done / Math.max(1, total)) * 7),
      ),
  });

  onProgress(`Σελιδοποίηση (${ranked.length} θέματα)…`, 84);
  const trendPages = await trendPromise;
  const edition = buildEdition(ranked, sections, {
    config,
    startNum: 2 + trendPages.length,
  });

  const visible = [
    ...(edition.lead ? [edition.lead] : []),
    ...edition.secondary,
    ...edition.pages.flatMap((page) => [
      ...(page.featured ? [page.featured] : []),
      ...page.stories,
    ]),
    ...edition.briefs,
    ...edition.today,
  ];
  const uniqueVisible = Array.from(new Map(visible.map((item) => [item.id, item])).values());
  const qr = buildQrMap(uniqueVisible);
  onProgress("Λήψη εικόνων…", 90);
  const images = options.resolveImages
    ? await options.resolveImages(uniqueVisible)
    : {};

  const healthReport = Object.fromEntries(
    results.map((entry) => [
      entry.source.name,
      { count: entry.items.length, method: entry.method },
    ]),
  );
  const health = updateHealth(options.health || {}, healthReport, now);
  const healthByName = new Map(
    healthRows(health, allSources.map((source) => source.name)).map((row) => [row.name, row]),
  );
  const sourceStatus: SourceStatus[] = allSources.map((source) => {
    const row = healthByName.get(source.name);
    return {
      name: source.name,
      status: row?.status || "unknown",
      method: row?.method || "—",
      items: row?.items || 0,
      last_ok: row?.last_ok || "—",
    };
  });

  const payload = buildPayload({
    edition,
    today: now,
    settings,
    generated: now,
    qr,
    images,
    trends: trendPages,
    stats: {
      sources_ok: sourceStatus.filter((entry) => entry.status === "ok").length,
      enriched_images: enrichment.images,
      articles: articles.ok,
      webview_fallbacks: articles.webview,
    },
    sources: sourceStatus,
  });
  const html = renderEdition(payload, settings);

  onProgress("Σύνθεση HTML…", 95);

  const result: DemoResult = {
    items: ranked,
    edition,
    rawCount: raw.length,
    health,
    report: results.map((entry) => ({
      source: entry.source.name,
      count: entry.items.length,
      method: entry.method,
    })),
  };

  setLatestEdition({
    html,
    payload,
    result,
    createdAt: Date.now(),
    date: payload.date_iso,
  });
  onProgress("Έτοιμο", 100);
  return result;
}
