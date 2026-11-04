import { describe, expect, it } from "vitest";
import {
  healthRows,
  healthSummary,
  isQuarantined,
  updateHealth,
  type HealthState,
} from "../src/engine";

const now = new Date("2026-10-30T12:00:00Z");

describe("health", () => {
  it("marks ok, degraded and broken sources", () => {
    let state: HealthState = {};
    state = updateHealth(state, { BBC: { count: 10, method: "rss" } }, now);
    expect(state.BBC.status).toBe("ok");
    expect(state.BBC.items).toBe(10);

    state = updateHealth(state, { BBC: { count: 1, method: "rss" } }, now);
    expect(state.BBC.status).toBe("degraded");

    state = updateHealth(state, { BBC: { count: 0, method: "rss" } }, now);
    expect(state.BBC.status).toBe("degraded");

    state = updateHealth(state, { CNN: { count: 0, method: "rss" } }, now);
    state = updateHealth(state, { CNN: { count: 0, method: "rss" } }, now);
    state = updateHealth(state, { CNN: { count: 0, method: "rss" } }, now);
    expect(state.CNN.status).toBe("broken");
  });

  it("quarantines broken sources for 24h after the last success", () => {
    const state = updateHealth(
      {
        CNN: {
          status: "degraded",
          failures: 2,
          last_ok: "2026-10-30T11:00:00Z",
          last_method: "rss",
          items: 5,
          history: [],
        },
      },
      { CNN: { count: 0, method: "rss" } },
      now,
    );
    expect(state.CNN.status).toBe("broken");
    expect(isQuarantined(state.CNN, now)).toBe(true);
    const later = new Date("2026-10-31T13:00:00Z");
    expect(isQuarantined(state.CNN, later)).toBe(false);
  });

  it("builds status rows and a summary", () => {
    const state = updateHealth({}, { BBC: { count: 5, method: "rss" } }, now);
    const rows = healthRows(state, ["BBC", "CNN"]);
    expect(rows[0]).toMatchObject({ name: "BBC", status: "ok", items: 5 });
    expect(rows[1].status).toBe("unknown");
    expect(healthSummary(state)).toEqual({ total: 1, ok: 1, degraded: 0, broken: 0 });
  });
});
