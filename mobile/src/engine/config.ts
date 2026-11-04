/**
 * Static configuration, ported from newspaper/config.py.
 */

import type { Settings, Source } from "./types";
import { loadSettings } from "./settings";

export const SOURCES: Source[] = [
  {
    id: "cnn_gr",
    name: "CNN Greece",
    domain: "cnn.gr",
    lang: "el",
    tier: 1,
    category: "news",
    home: "https://www.cnn.gr/",
    feeds: ["https://www.cnn.gr/eidhseis?format=feed&type=rss"],
  },
  {
    id: "cnn",
    name: "CNN International",
    domain: "cnn.com",
    lang: "en",
    tier: 1,
    category: "news",
    home: "https://edition.cnn.com/",
    feeds: [
      "http://rss.cnn.com/rss/edition.rss",
      "http://rss.cnn.com/rss/edition_world.rss",
      "http://rss.cnn.com/rss/edition_business.rss",
    ],
  },
  {
    id: "bbc",
    name: "BBC News",
    domain: "bbc.com",
    lang: "en",
    tier: 1,
    category: "news",
    home: "https://www.bbc.com/news",
    feeds: [
      "https://feeds.bbci.co.uk/news/rss.xml",
      "https://feeds.bbci.co.uk/news/world/rss.xml",
      "https://feeds.bbci.co.uk/news/business/rss.xml",
    ],
  },
  {
    id: "yahoo",
    name: "Yahoo Finance",
    domain: "finance.yahoo.com",
    lang: "en",
    tier: 2,
    category: "economy",
    home: "https://finance.yahoo.com/",
    feeds: [
      "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US",
      "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EIXIC&region=US&lang=en-US",
      "https://feeds.finance.yahoo.com/rss/2.0/headline?s=EURUSD%3DX&region=US&lang=en-US",
    ],
  },
  {
    id: "gamespot",
    name: "GameSpot",
    domain: "gamespot.com",
    lang: "en",
    tier: 2,
    category: "tech",
    home: "https://www.gamespot.com/",
    feeds: ["https://www.gamespot.com/feeds/news/"],
  },
  {
    id: "nba",
    name: "NBA",
    domain: "nba.com",
    lang: "en",
    tier: 2,
    category: "sports",
    home: "https://www.nba.com/news",
    jina: "https://r.jina.ai/https://www.nba.com/news",
    gnews: "site:nba.com",
    link_filter: "^https://www\\.nba\\.com/(news|games|watch)/",
  },
  {
    id: "euroleague",
    name: "EuroLeague",
    domain: "euroleaguebasketball.net",
    lang: "en",
    tier: 2,
    category: "sports",
    home: "https://www.euroleaguebasketball.net/euroleague/news/",
    jina: "https://r.jina.ai/https://www.euroleaguebasketball.net/euroleague/news/",
    gnews: "site:euroleaguebasketball.net",
    link_filter: "^https://www\\.euroleaguebasketball\\.net/",
  },
  {
    id: "imdb",
    name: "IMDb",
    domain: "imdb.com",
    lang: "en",
    tier: 3,
    category: "culture",
    home: "https://www.imdb.com/news/",
    jina: "https://r.jina.ai/https://www.imdb.com/news/",
    gnews: "site:imdb.com",
    link_filter: "^https?://(?!www\\.imdb\\.com/(name|title|video|list|chart|tv|search|news/))",
  },
];

export const SCORE_WEIGHTS = {
  recency: 30,
  tier: { 1: 20, 2: 14, 3: 10 } as Record<number, number>,
  coverage: 20,
  impact: 20,
  exclusivity: 10,
};

export const RECENCY_WINDOW_H = 36;
export const FRESH_WINDOW_H = 30;
export const MIN_ITEMS_PER_SOURCE = 1;

export const IMPACT_KEYWORDS = [
  "dead", "death", "dies", "killed", "war", "attack", "strike", "crisis",
  "election", "resign", "collapse", "record", "historic", "emergency",
  "inflation", "recession", "rate cut", "rate hike", "bankruptcy", "war",
  "championship", "final", "trade", "ban", "lawsuit", "verdict", "protest",
  "νεκρ", "θάνατος", "πόλεμος", "επίθεση", "κρίση", "εκλογ", "παραίτηση",
  "ρεκόρ", "πληθωρισμός", "ύφεση", "χρεοκοπία", "πρωτάθλημα", "τελικός",
  "απόφαση", "δικαστήριο", "διαμαρτυρία", "έκτακτο",
];

/** Runtime config derived from settings, mirroring config.py. */
export function runtimeConfig(settings: Settings = loadSettings()) {
  const pageLayout = {
    lead: Number(settings.layout.cover_secondary),
    first_page: Number(settings.layout.first_page),
    grid_page: Number(settings.layout.grid_page),
    video_page: Number(settings.layout.video_page),
    briefs: Number(settings.layout.briefs_per_page),
  };
  return {
    settings,
    pageLayout,
    coverSecondary: Number(settings.layout.cover_secondary),
    briefsPerPage: Number(settings.layout.briefs_per_page),
    wordLimits: {
      lead: Number(settings.limits.lead),
      featured: Number(settings.limits.featured),
      story: Number(settings.limits.story),
      brief: Number(settings.limits.brief),
      video: Number(settings.limits.video),
    },
    theme: settings.theme,
    language: settings.language,
    weights: settings.weights || {},
    trends: {
      enabled: Boolean(settings.trends?.enabled ?? true),
      country: String(settings.trends?.country || "GR").toUpperCase(),
      perPage: Number(settings.trends?.per_page || 10),
    },
  };
}

export type RuntimeConfig = ReturnType<typeof runtimeConfig>;
