/**
 * Time, hashing and rounding helpers shared by the engine.
 *
 * Python's datetime/round semantics differ from JavaScript in a few places
 * (naive timestamps are UTC in the pipeline, round() is half-even), so these
 * helpers keep the port close to the original behaviour.
 */

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { TZ } from "./settings";

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(Z|[+-]\d{2}:?\d{2})?$/i;

/** Parse an ISO timestamp like Python's datetime.fromisoformat. */
export function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = ISO_RE.exec(value.trim());
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, y, mo, d, h, mi, s, frac, offset] = match;
  const millis = frac ? Number(frac.padEnd(3, "0").slice(0, 3)) : 0;
  let utc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s || 0),
    millis,
  );
  if (offset && offset.toUpperCase() !== "Z") {
    const sign = offset[0] === "-" ? -1 : 1;
    const [oh, om] = offset.slice(1).replace(":", "").match(/\d{2}/g) || ["0", "0"];
    utc -= sign * (Number(oh) * 60 + Number(om)) * 60_000;
  }
  return new Date(utc);
}

/** Start of the given instant's day in Europe/Athens, as a UTC Date. */
export function athensStartOfDay(now: Date): Date {
  const day = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  return fromZonedTime(`${day}T00:00:00`, TZ);
}

/** HH:mm in Europe/Athens. */
export function athensTime(date: Date): string {
  return formatInTimeZone(date, TZ, "HH:mm");
}

/** Python's round(value, digits) — half-even, like the pipeline's scores. */
export function pyRound(value: number, digits = 0): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  // Tolerate binary floating point noise (e.g. 68.85 * 10 = 688.4999...).
  if (Math.abs(diff - 0.5) < 1e-9) {
    return (floor % 2 === 0 ? floor : floor + 1) / factor;
  }
  return Math.round(scaled) / factor;
}

/** SHA-1 hex digest. Hermes has no Node crypto, so this is pure JS. */
export function sha1(input: string): string {
  const bytes = utf8Bytes(input);
  const bitLength = bytes.length * 8;

  const withPadding = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
  withPadding.set(bytes);
  withPadding[bytes.length] = 0x80;
  const view = new DataView(withPadding.buffer);
  view.setUint32(withPadding.length - 4, bitLength >>> 0, false);
  view.setUint32(withPadding.length - 8, Math.floor(bitLength / 0x1_0000_0000), false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let offset = 0; offset < withPadding.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 80; i += 1) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (x << 1) | (x >>> 31);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i += 1) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4]
    .map((n) => n.toString(16).padStart(8, "0"))
    .join("");
}

function utf8Bytes(text: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
  const encoded = unescape(encodeURIComponent(text));
  const out = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i += 1) out[i] = encoded.charCodeAt(i);
  return out;
}
