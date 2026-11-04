/**
 * In-memory hand-off between the generator and the reader screen.
 * The next milestone moves this to expo-sqlite/expo-file-system.
 */

import type { DemoResult } from "./runDemo";
import type { EditionPayload } from "@/engine";

export interface StoredEdition {
  html: string;
  payload: EditionPayload;
  result?: DemoResult;
  createdAt: number;
  date: string;
}

let latest: StoredEdition | null = null;

export function setLatestEdition(edition: StoredEdition) {
  latest = edition;
}

export function getLatestEdition(): StoredEdition | null {
  return latest;
}
