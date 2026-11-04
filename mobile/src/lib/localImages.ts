/**
 * Downloads edition images, resizes them and returns base64 data URIs.
 * This makes archived editions self-contained (no network needed to read).
 */

import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { sha1, type ImageMap, type Item } from "@/engine";

const cache = new Map<string, string>();
const IMAGE_DIR = `${FileSystem.cacheDirectory}hmerisia-images/`;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(IMAGE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_DIR, { intermediates: true });
  }
}

async function localize(url: string, width = 640): Promise<string | null> {
  if (!/^https?:/i.test(url)) return null;
  const cached = cache.get(url);
  if (cached) return cached;

  const hash = sha1(url).slice(0, 16);
  const dest = `${IMAGE_DIR}${hash}.img`;
  try {
    await ensureDir();
    let uri = dest;
    const info = await FileSystem.getInfoAsync(dest);
    if (!info.exists) {
      const download = await FileSystem.downloadAsync(url, dest, {
        headers: { "User-Agent": "Mozilla/5.0 Chrome/128" },
      });
      if (download.status >= 400) return null;
      uri = download.uri;
    }
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width } }],
      { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (!result.base64) return null;
    const dataUri = `data:image/jpeg;base64,${result.base64}`;
    cache.set(url, dataUri);
    return dataUri;
  } catch {
    return null;
  }
}

export async function resolveLocalImages(items: Item[]): Promise<ImageMap> {
  const urls = Array.from(
    new Set(
      items
        .map((item) => item.image)
        .filter((url): url is string => Boolean(url && /^https?:/i.test(url))),
    ),
  ).slice(0, 45);

  const map: ImageMap = {};
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, urls.length) }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor];
      cursor += 1;
      const dataUri = await localize(url);
      if (dataUri) {
        for (const item of items) {
          if (item.image === url) map[item.id] = { s: dataUri, l: dataUri };
        }
      }
    }
  });
  await Promise.all(workers);
  return map;
}
