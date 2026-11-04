/**
 * Persistent source health (one JSON blob in SQLite).
 */

import * as SQLite from "expo-sqlite";
import type { HealthState } from "@/engine";

const DB_NAME = "hmerisia.db";
let database: Promise<SQLite.SQLiteDatabase> | null = null;

function open(): Promise<SQLite.SQLiteDatabase> {
  if (!database) {
    database = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS source_health (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          data TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      return db;
    })();
  }
  return database;
}

export async function loadHealth(): Promise<HealthState> {
  try {
    const db = await open();
    const row = await db.getFirstAsync<{ data: string }>(
      "SELECT data FROM source_health WHERE id = 1",
    );
    return row ? (JSON.parse(row.data) as HealthState) : {};
  } catch {
    return {};
  }
}

export async function saveHealth(data: HealthState): Promise<void> {
  const db = await open();
  await db.runAsync(
    "INSERT OR REPLACE INTO source_health (id, data, updated_at) VALUES (1, ?, ?)",
    JSON.stringify(data),
    Date.now(),
  );
}
