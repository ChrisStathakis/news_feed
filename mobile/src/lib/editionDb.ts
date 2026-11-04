/**
 * Persistent edition archive (SQLite).
 * One row per calendar edition; HTML + payload are stored as text.
 */

import * as SQLite from "expo-sqlite";
import type { StoredEdition } from "./editionStore";

const DB_NAME = "hmerisia.db";
let database: Promise<SQLite.SQLiteDatabase> | null = null;

export interface EditionSummary {
  date: string;
  title: string;
  items: number;
  pages: number;
  createdAt: number;
}

function open(): Promise<SQLite.SQLiteDatabase> {
  if (!database) {
    database = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS editions (
          date TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          html TEXT NOT NULL,
          payload TEXT NOT NULL,
          items INTEGER NOT NULL,
          pages INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);
      return db;
    })();
  }
  return database;
}

export async function saveEdition(edition: StoredEdition): Promise<void> {
  const db = await open();
  const numbers = edition.payload.numbers as Record<string, unknown>;
  await db.runAsync(
    `INSERT OR REPLACE INTO editions (date, title, html, payload, items, pages, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    edition.date,
    edition.payload.lead?.title_el || edition.payload.date_long,
    edition.html,
    JSON.stringify(edition.payload),
    Number(numbers.total ?? 0),
    edition.payload.total_pages,
    edition.createdAt,
  );
}

export async function listEditions(limit = 60): Promise<EditionSummary[]> {
  const db = await open();
  const rows = await db.getAllAsync<{
    date: string;
    title: string;
    items: number;
    pages: number;
    created_at: number;
  }>(
    `SELECT date, title, items, pages, created_at
     FROM editions ORDER BY date DESC LIMIT ?`,
    limit,
  );
  return rows.map((row) => ({
    date: row.date,
    title: row.title,
    items: row.items,
    pages: row.pages,
    createdAt: row.created_at,
  }));
}

export async function loadEdition(date: string): Promise<StoredEdition | null> {
  const db = await open();
  const row = await db.getFirstAsync<{
    date: string;
    html: string;
    payload: string;
    created_at: number;
  }>("SELECT date, html, payload, created_at FROM editions WHERE date = ?", date);
  if (!row) return null;
  return {
    date: row.date,
    html: row.html,
    payload: JSON.parse(row.payload),
    createdAt: row.created_at,
  };
}

export async function deleteEdition(date: string): Promise<void> {
  const db = await open();
  await db.runAsync("DELETE FROM editions WHERE date = ?", date);
}

export async function pruneEditions(keep = 30): Promise<void> {
  const db = await open();
  await db.runAsync(
    `DELETE FROM editions WHERE date NOT IN (
       SELECT date FROM editions ORDER BY date DESC LIMIT ?
     )`,
    keep,
  );
}
