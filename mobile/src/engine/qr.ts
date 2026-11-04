/**
 * QR codes for video/links, rendered as SVG data URIs so they work in the
 * WebView without any native image processing.
 */

import createQrCode from "qrcode-generator";

export function qrSvg(text: string, size = 120): string {
  const qr = createQrCode(0, "L");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({
    cellSize: Math.max(2, Math.round(size / (qr.getModuleCount() + 2))),
    margin: 2,
    scalable: true,
  });
}

export function qrDataUri(text: string, size = 120): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(text, size))}`;
}

export function buildQrMap(
  items: { id: string; url: string; kind?: string | null; source_id?: string }[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of items) {
    if (item.kind === "video" || String(item.source_id || "").startsWith("yt-")) {
      map[item.id] = qrDataUri(item.url);
    }
  }
  return map;
}
