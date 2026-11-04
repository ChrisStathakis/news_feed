/**
 * Source health / quarantine, ported from newspaper/health.py.
 */

export const QUARANTINE_HOURS = 24;
export const BROKEN_AFTER = 3;

export type SourceHealthStatus = "ok" | "degraded" | "broken" | "unknown";

export interface HealthEntry {
  status: SourceHealthStatus;
  failures: number;
  last_ok: string | null;
  last_method: string | null;
  items: number;
  history: { at: string; items: number; method: string }[];
}

export type HealthState = Record<string, HealthEntry>;

export interface HealthReportEntry {
  count: number;
  method: string;
}

export function updateHealth(
  data: HealthState,
  report: Record<string, HealthReportEntry>,
  now: Date = new Date(),
): HealthState {
  const next: HealthState = JSON.parse(JSON.stringify(data || {}));
  for (const [name, info] of Object.entries(report)) {
    const entry = next[name] || {
      status: "ok",
      failures: 0,
      last_ok: null,
      last_method: null,
      items: 0,
      history: [],
    };
    const count = Number(info.count || 0);
    entry.items = count;
    entry.last_method = info.method || null;

    if (count > 0) {
      entry.failures = 0;
      entry.status = count >= 3 ? "ok" : "degraded";
      entry.last_ok = now.toISOString();
    } else {
      entry.failures = Number(entry.failures || 0) + 1;
      entry.status = entry.failures >= BROKEN_AFTER ? "broken" : "degraded";
    }

    entry.history = [...(entry.history || []).slice(-6), {
      at: now.toISOString(),
      items: count,
      method: info.method || "",
    }];
    next[name] = entry;
  }
  return next;
}

export function isQuarantined(entry: HealthEntry | undefined, now: Date = new Date()): boolean {
  if (!entry || entry.status !== "broken" || !entry.last_ok) return false;
  const lastOk = new Date(entry.last_ok).getTime();
  if (!Number.isFinite(lastOk)) return false;
  return now.getTime() - lastOk < QUARANTINE_HOURS * 3_600_000;
}

export function healthSummary(data: HealthState) {
  const entries = Object.values(data || {});
  return {
    total: entries.length,
    ok: entries.filter((entry) => entry.status === "ok").length,
    degraded: entries.filter((entry) => entry.status === "degraded").length,
    broken: entries.filter((entry) => entry.status === "broken").length,
  };
}

export function healthRows(data: HealthState, order: string[] = []) {
  const names = order.length ? Array.from(new Set(order)) : Object.keys(data);
  return names.map((name) => {
    const entry = data[name];
    let status: SourceHealthStatus = entry?.status || "unknown";
    if (status === "broken" && !isQuarantined(entry)) status = "degraded";
    return {
      name,
      status,
      items: entry?.items || 0,
      method: (entry?.last_method || "—").toUpperCase(),
      last_ok: entry?.last_ok ? entry.last_ok.slice(11, 16) : "—",
    };
  });
}
