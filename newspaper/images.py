# -*- coding: utf-8 -*-
"""Λήψη, επιλογή και επεξεργασία εικόνων σε vintage/sepia ύφος.

Δύο μεγέθη:
  * 520 px  — κάρτες και στήλες
  * 900 px  — lead / featured
Απόρριψη: λογότυπα, watermarks, σχεδόν λευκές εικόνες.
"""
from __future__ import annotations

import hashlib
import io
import logging
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from lxml import html as lxml_html
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

from config import CACHE_DIR

log = logging.getLogger("images")

RAW_CACHE = CACHE_DIR / "images_raw"
OUT_CACHE = CACHE_DIR / "images_out"
for _d in (RAW_CACHE, OUT_CACHE):
    _d.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Referer": "https://www.google.com/",
}

INK = (34, 29, 23)
PAPER = (241, 235, 221)
MID = (126, 113, 93)
PHOTOS = "sepia"
TAG = "sep-f1ebdd"


def _hex(value: str | None, fallback: tuple[int, int, int]) -> tuple[int, int, int]:
    try:
        value = (value or "").lstrip("#")
        if len(value) == 6:
            return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
    except Exception:
        pass
    return fallback


def configure(theme: dict) -> None:
    """Προσαρμόζει τα χρώματα/τρόπο φωτογραφίας στο θέμα του φύλλου."""
    global PAPER, INK, MID, PHOTOS, TAG
    PHOTOS = (theme.get("photos") or "sepia").lower()
    if PHOTOS not in ("sepia", "color"):
        PHOTOS = "sepia"
    PAPER = _hex(theme.get("paper"), PAPER)
    INK = _hex(theme.get("ink"), INK)
    MID = tuple(int((a + b) / 2) for a, b in zip(INK, PAPER))  # type: ignore[assignment]
    TAG = f"{PHOTOS[:3]}-{PAPER[0]:02x}{PAPER[1]:02x}{PAPER[2]:02x}"

SIZE_SMALL = 520
SIZE_LARGE = 900


def _sha(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


# ------------------------------------------------------------------ metadata
def fetch_meta(url: str) -> dict:
    """og:title / og:description / og:image / article:published_time."""
    try:
        r = requests.get(url, headers={**HEADERS, "Accept": "text/html,*/*"}, timeout=20)
        if r.status_code >= 400 or not r.content:
            return {}
        doc = lxml_html.fromstring(r.content)

        def meta(*names: str) -> str:
            for name in names:
                for key in ("property", "name", "itemprop"):
                    node = doc.xpath(f'//meta[@{key}="{name}"]/@content')
                    if node and node[0].strip():
                        return node[0].strip()
            return ""

        image = meta("og:image", "twitter:image", "twitter:image:src")
        if not image:
            for img in doc.xpath("//article//img/@src | //main//img/@src | //img[@src]/@src")[:8]:
                if img.startswith("http") and not any(x in img for x in ("logo", "icon", "avatar", "sprite")):
                    image = img
                    break
        return {
            "title": meta("og:title", "twitter:title", "headline"),
            "description": meta("og:description", "twitter:description", "description"),
            "image": image,
            "published": meta("article:published_time", "datePublished", "og:updated_time"),
        }
    except Exception as e:  # noqa: BLE001
        log.debug("meta απέτυχε για %s: %s", url, e)
        return {}


def enrich(items: list[dict], *, max_fetch: int = 60) -> list[dict]:
    """Συμπληρώνει σύνοψη/εικόνα για όσα το χρειάζονται."""
    budget = max_fetch
    for item in items:
        if budget <= 0:
            break
        needs = (not item.get("image")) or len(item.get("summary") or "") < 90
        if not needs:
            continue
        meta = fetch_meta(item["url"])
        budget -= 1
        if meta.get("image") and not item.get("image"):
            item["image"] = meta["image"]
        desc = (meta.get("description") or "").strip()
        if desc and len(desc) > len(item.get("summary") or ""):
            item["summary"] = desc[:520]
        if meta.get("title") and len(item.get("title") or "") < 25:
            item["title"] = meta["title"]
        if meta.get("published") and not item.get("published_exact"):
            item["published_exact"] = meta["published"]
    return items


# -------------------------------------------------------------------- images
def _download(url: str) -> bytes | None:
    if not url:
        return None
    cached = RAW_CACHE / f"{_sha(url)}.bin"
    if cached.exists():
        return cached.read_bytes() or None
    try:
        r = requests.get(url, headers=HEADERS, timeout=25)
        if r.status_code >= 400 or len(r.content) < 4000:
            return None
        cached.write_bytes(r.content)
        return r.content
    except Exception as e:  # noqa: BLE001
        log.debug("εικόνα απέτυχε %s: %s", url, e)
        return None


def _halftone_layer(size: tuple[int, int]) -> Image.Image:
    """Διακριτικό μοτίβο κουκκίδων, σαν εκτύπωση εφημερίδας."""
    w, h = size
    step = 4
    tile = Image.new("L", (step, step), 255)
    d = ImageDraw.Draw(tile)
    d.ellipse((0, 0, 1, 1), fill=214)
    pattern = Image.new("L", (w // step + 1, h // step + 1))
    for y in range(0, pattern.height, tile.height):
        for x in range(0, pattern.width, tile.width):
            pattern.paste(tile, (x, y))
    return pattern.crop((0, 0, w, h)).convert("L")


def vintage(data: bytes, dest: Path, *, ratio: float = 1.33, width: int = SIZE_SMALL) -> Path | None:
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            img = img.convert("RGBA")
            bg.paste(img, mask=img.split()[-1])
            img = bg
        else:
            img = img.convert("RGB")

        w, h = img.size
        target_h = int(w / ratio)
        if h > target_h:
            top = max(0, (h - target_h) // 2)
            img = img.crop((0, top, w, top + target_h))
        else:
            target_w = int(h * ratio)
            left = max(0, (w - target_w) // 2)
            img = img.crop((left, 0, left + target_w, h))

        img = img.resize((width, int(width / ratio)), Image.LANCZOS)
        gray0 = img.convert("L")

        hist = gray0.histogram()
        total = max(1, sum(hist))

        def pct(q: float) -> int:
            acc = 0
            for value, count in enumerate(hist):
                acc += count
                if acc >= total * q:
                    return value
            return 255

        lo, hi = pct(0.02), pct(0.98)
        if hi - lo < 55:
            return None

        lut = [
            max(0, min(255, int((max(0.0, (i - lo) / (hi - lo)) ** 1.06) * 255)))
            for i in range(256)
        ]
        if PHOTOS == "color":
            # Έγχρωμη λειτουργία: καθαρή φωτογραφία με ελαφρύ φιλμ, χωρίς duotone.
            duo = ImageOps.autocontrast(img, cutoff=1)
            duo = ImageEnhance.Color(duo).enhance(0.92)
            duo = ImageEnhance.Contrast(duo).enhance(1.06)
            noise = Image.effect_noise(duo.size, 8).convert("L")
            grain = Image.merge("RGB", (noise, noise, noise))
            duo = Image.blend(duo, grain, 0.03)
        else:
            gray = gray0.point(lut)

            hist2 = gray.histogram()
            total2 = max(1, sum(hist2))

            def median() -> int:
                acc = 0
                for value, count in enumerate(hist2):
                    acc += count
                    if acc >= total2 * 0.5:
                        return value
                return 255

            med = median()
            if med > 214:
                return None
            if med > 168:
                gamma = math.log(160 / 255) / math.log(max(1, med) / 255)
                gamma = max(1.0, min(2.4, gamma))
                gray = gray.point(lambda v: int(255 * ((v / 255) ** gamma)))

            duo = ImageOps.colorize(gray, black=INK, white=PAPER, mid=MID)

            dots = _halftone_layer(duo.size)
            duo = Image.composite(duo, duo.point(lambda v: int(v * 0.86)), dots)
            noise = Image.effect_noise(duo.size, 10).convert("L")
            grain = Image.merge("RGB", (noise, noise, noise))
            duo = Image.blend(duo, grain, 0.05)
            duo = ImageEnhance.Contrast(duo).enhance(1.14)
            duo = ImageEnhance.Brightness(duo).enhance(0.96)

        vig = Image.new("L", duo.size, 0)
        dv = ImageDraw.Draw(vig)
        dv.ellipse((-duo.width * 0.15, -duo.height * 0.15,
                    duo.width * 1.15, duo.height * 1.15), fill=255)
        vig = vig.filter(ImageFilter.GaussianBlur(60))
        vig_color = tuple(min(255, c + 16) for c in PAPER)
        duo = Image.composite(duo, Image.new("RGB", duo.size, vig_color), vig)

        duo = ImageOps.expand(duo, border=5, fill=PAPER)
        duo = ImageOps.expand(duo, border=1, fill=INK)

        dest.parent.mkdir(parents=True, exist_ok=True)
        duo.save(dest, "JPEG", quality=84, optimize=True)
        return dest
    except Exception as e:  # noqa: BLE001
        log.debug("επεξεργασία εικόνας απέτυχε: %s", e)
        return None


def _candidate_urls(item: dict) -> list[str]:
    urls: list[str] = []
    for url in [item.get("image"), *(item.get("image_candidates") or [])]:
        if not url:
            continue
        lowered = url.lower()
        # διαφημίσεις / banners που μοιάζουν με φωτογραφία
        if any(bad in lowered for bad in ("credit-card", "creditcard", "learn-more",
                                          "advertisement", "sponsor", "promo-")):
            continue
        urls.append(url)
        # YouTube: το maxresdefault μπορεί να λείπει
        if "maxresdefault" in url:
            urls.append(url.replace("maxresdefault", "hqdefault"))
    seen: set[str] = set()
    return [u for u in urls if not (u in seen or seen.add(u))]


def prepare(item: dict, dest_dir: Path, *, width: int = SIZE_SMALL) -> Path | None:
    """Κατεβάζει + επεξεργάζεται την καλύτερη διαθέσιμη εικόνα."""
    for url in _candidate_urls(item):
        out = OUT_CACHE / f"{_sha(url)}_{width}_{TAG}.jpg"
        marker = OUT_CACHE / f"{_sha(url)}_{width}_{TAG}.none"
        if marker.exists():
            continue
        if not out.exists():
            data = _download(url)
            if not data:
                continue
            if not vintage(data, out, width=width):
                marker.write_text("rejected", encoding="utf-8")
                continue

        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"{item['id']}_{width}_{TAG}.jpg"
        if not dest.exists():
            dest.write_bytes(out.read_bytes())
        item["image_used"] = url
        return dest
    return None


def prepare_many(items: list[dict], dest_dir: Path, *, workers: int = 6) -> dict[str, dict]:
    """Επιστρέφει {item_id: {'s': path, 'l': path}} για όσα έχουν εικόνα."""
    mapping: dict[str, dict] = {}

    def work(item: dict) -> None:
        small = prepare(item, dest_dir, width=SIZE_SMALL)
        if not small:
            return
        entry = {"s": small.name}
        if item.get("role") in ("lead", "featured", "video"):
            large = prepare(item, dest_dir, width=SIZE_LARGE)
            if large:
                entry["l"] = large.name
        mapping[item["id"]] = entry

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(work, items))

    log.info("Εικόνες: %s/%s θέματα", len(mapping), len(items))
    return mapping


def coverage(items: list[dict], mapping: dict[str, dict]) -> dict:
    with_image = sum(1 for x in items if x["id"] in mapping)
    return {
        "items": len(items),
        "with_image": with_image,
        "percent": round(100 * with_image / len(items)) if items else 0,
    }
