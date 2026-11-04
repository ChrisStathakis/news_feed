/**
 * sites.txt → source registry, ported from newspaper/collect.py.
 */

import { SOURCES } from "./config";
import type { Settings, Source } from "./types";

export function isYoutube(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("youtube.com") || host.includes("youtu.be");
  } catch {
    return false;
  }
}

function sameDomain(host: string, domain: string): boolean {
  const h = (host || "").toLowerCase().replace("www.", "");
  const d = (domain || "").toLowerCase().replace("www.", "");
  return Boolean(h && d) && (h === d || h.endsWith(`.${d}`));
}

function baseForHost(host: string, known: Source[]): Source | undefined {
  return known.find((base) => sameDomain(host, base.domain));
}

function sourceFromLine(
  line: string,
  overrides: Record<string, Partial<Source>>,
  known: Source[],
): Source | null {
  if (isYoutube(line)) {
    const handle = line.replace(/\/+$/, "").split("/").pop() || "youtube";
    const sourceId = `yt-${handle.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    return {
      id: sourceId,
      name: handle,
      domain: "youtube.com",
      lang: "en",
      tier: 3,
      category: "video",
      home: line,
      auto: true,
      kind: "youtube",
      site_url: line,
      ...(overrides[sourceId] || {}),
    };
  }

  let host: string;
  try {
    host = new URL(line).hostname.toLowerCase().replace("www.", "");
  } catch {
    return null;
  }
  if (!host) return null;

  const base = baseForHost(host, known);
  if (base) {
    return {
      ...base,
      ...(overrides[base.domain] || {}),
      ...(overrides[host] || {}),
      site_url: line,
    };
  }
  return {
    id: host.replace(/[^a-z0-9]+/g, "_"),
    name: host,
    domain: host,
    lang: host.endsWith(".gr") ? "el" : "en",
    tier: 3,
    category: "news",
    home: line,
    auto: true,
    ...(overrides[host] || {}),
    site_url: line,
  };
}

function normSource(url: string): string {
  let value = (url || "").trim().toLowerCase().replace(/\/+$/, "");
  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/^www\./, "");
  return value;
}

function isDisabled(source: Source, disabled: string[]): boolean {
  const home = normSource(source.home || "");
  const domain = normSource(source.domain || "");
  for (const key of disabled) {
    if (!key) continue;
    if (key === domain || key === home) return true;
    if (home.startsWith(`${key}/`) || key.startsWith(`${home}/`)) return true;
  }
  return false;
}

export interface LoadSourcesOptions {
  /**
   * Contents of sites.txt. Pass `null` to simulate a missing file (known
   * sources are used); pass `""` for an intentionally empty file.
   */
  sitesText: string | null;
  overrides?: Record<string, Partial<Source>>;
  settings?: Pick<Settings, "sources_disabled">;
  includeDisabled?: boolean;
}

export function loadSources(options: LoadSourcesOptions): Source[] {
  const overrides = options.overrides || {};
  const disabled = (options.settings?.sources_disabled || [])
    .filter(Boolean)
    .map((url) => normSource(String(url)));

  const lines =
    options.sitesText === null
      ? []
      : options.sitesText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("#") && line.includes("://"));

  const sources: Source[] = [];
  const seenIds = new Set<string>();
  const seenHosts = new Set<string>();

  if (options.sitesText !== null) {
    for (const line of lines) {
      const entry = sourceFromLine(line, overrides, SOURCES);
      if (!entry) continue;
      if (seenIds.has(entry.id)) continue;
      if (entry.kind !== "youtube") {
        const host = (entry.domain || "").toLowerCase().replace("www.", "");
        if (seenHosts.has(host)) continue;
        seenHosts.add(host);
      }
      entry.order = sources.length;
      sources.push(entry);
      seenIds.add(entry.id);
    }
  } else {
    // First launch / missing sites.txt: keep the known sources.
    for (const base of SOURCES) {
      const entry: Source = {
        ...base,
        ...(overrides[base.domain] || {}),
        site_url: base.home,
      };
      entry.order = sources.length;
      sources.push(entry);
      seenIds.add(entry.id);
    }
  }

  for (const source of sources) {
    source.active = disabled.length ? !isDisabled(source, disabled) : true;
  }
  return options.includeDisabled
    ? sources
    : sources.filter((source) => source.active !== false);
}

export function serializeSites(sources: Source[]): string {
  return sources.map((source) => source.site_url || source.home).join("\n");
}
