# -*- coding: utf-8 -*-
"""Δημοφιλείς αναζητήσεις Google Trends για τις τελευταίες 24 ώρες.

Το φύλλο παίρνει δύο σελίδες μπροστά:
  • σελίδα 1 — παγκόσμια (η Google δεν δίνει «worldwide» geo· χρησιμοποιούμε US)
  • σελίδα 2 — η χώρα από τις ρυθμίσεις (default GR)

Το RSS είναι ανεπίσημο. Κάθε αποτυχία (δίκτυο, 400, αλλαγή μορφής) γυρίζει
κενή λίστα ώστε το φύλλο να βγει κανονικά, χωρίς τις δύο σελίδες.
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
import urllib.request
from email.utils import parsedate_to_datetime
from pathlib import Path

from xml.etree import ElementTree as ET

from config import CACHE_DIR

log = logging.getLogger("trends")

RSS_URL = "https://trends.google.com/trending/rss?geo={geo}"
WORLD_GEO = "US"
CACHE_TTL = 60 * 60  # 1 ώρα
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
NS = {"ht": "https://trends.google.com/trending/rss"}

# Χώρες για το dropdown (κωδικοί Google Trends).
COUNTRIES: list[tuple[str, str]] = [
    ("GR", "Ελλάδα"),
    ("CY", "Κύπρος"),
    ("GB", "Ηνωμένο Βασίλειο"),
    ("US", "ΗΠΑ"),
    ("DE", "Γερμανία"),
    ("FR", "Γαλλία"),
    ("IT", "Ιταλία"),
    ("ES", "Ισπανία"),
    ("PT", "Πορτογαλία"),
    ("NL", "Ολλανδία"),
    ("BE", "Βέλγιο"),
    ("AT", "Αυστρία"),
    ("CH", "Ελβετία"),
    ("SE", "Σουηδία"),
    ("NO", "Νορβηγία"),
    ("DK", "Δανία"),
    ("FI", "Φινλανδία"),
    ("PL", "Πολωνία"),
    ("RO", "Ρουμανία"),
    ("BG", "Βουλγαρία"),
    ("TR", "Τουρκία"),
    ("RU", "Ρωσία"),
    ("UA", "Ουκρανία"),
    ("IL", "Ισραήλ"),
    ("AE", "Ηνωμένα Αραβικά Εμιράτα"),
    ("SA", "Σαουδική Αραβία"),
    ("IN", "Ινδία"),
    ("JP", "Ιαπωνία"),
    ("KR", "Νότια Κορέα"),
    ("AU", "Αυστραλία"),
    ("CA", "Καναδάς"),
    ("MX", "Μεξικό"),
    ("BR", "Βραζιλία"),
    ("AR", "Αργεντινή"),
    ("ZA", "Νότια Αφρική"),
    ("EG", "Αίγυπτος"),
]
LABELS = dict(COUNTRIES)


def country_label(code: str) -> str:
    code = (code or "").upper()
    return LABELS.get(code, code or "—")


def _text(node, path: str) -> str:
    el = node.find(path, NS)
    if el is None or el.text is None:
        return ""
    return el.text.strip()


def _clock(pub_date: str) -> str:
    """RFC 2822 pubDate → τοπική ώρα Ελλάδας «HH:MM»."""
    if not pub_date:
        return ""
    try:
        dt = parsedate_to_datetime(pub_date)
    except (TypeError, ValueError):
        return ""
    try:
        from config import TZ

        dt = dt.astimezone(TZ)
    except Exception:  # noqa: BLE001
        pass
    return dt.strftime("%H:%M")


def parse(raw: bytes) -> list[dict]:
    root = ET.fromstring(raw)
    items: list[dict] = []
    for node in root.findall("./channel/item"):
        term = _text(node, "title")
        if not term:
            continue
        news = []
        for ni in node.findall("ht:news_item", NS):
            title = _text(ni, "ht:news_item_title")
            url = _text(ni, "ht:news_item_url")
            if not (title and url):
                continue
            news.append({
                "title": title,
                "url": url,
                "source": _text(ni, "ht:news_item_source"),
            })
        items.append({
            "term": term,
            "traffic": _text(node, "ht:approx_traffic"),
            "image": _text(node, "ht:picture"),
            "image_source": _text(node, "ht:picture_source"),
            "time": _clock(_text(node, "pubDate")),
            "news": news[:3],
        })
    return items


def fetch(geo: str, *, timeout: int = 12) -> list[dict]:
    geo = (geo or WORLD_GEO).upper()
    req = urllib.request.Request(
        RSS_URL.format(geo=geo),
        headers={"User-Agent": UA, "Accept-Language": "el,en;q=0.8"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = res.read()
    return parse(raw)


def _cache_file(geo: str) -> Path:
    return Path(CACHE_DIR) / f"trends-{(geo or WORLD_GEO).upper()}.json"


def load(geo: str, *, refresh: bool = False) -> list[dict]:
    """Λίστα τάσεων με cache 60′· ποτέ exception.

    Αν η Google αποτύχει (500/429/δίκτυο), δοκιμάζει μια φορά ακόμη και μετά
    πέφτει στην παλιά cache ώστε το φύλλο να μη χάσει τη σελίδα.
    """
    geo = (geo or WORLD_GEO).upper()
    path = _cache_file(geo)
    if not refresh:
        try:
            if path.exists() and (time.time() - path.stat().st_mtime) < CACHE_TTL:
                data = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(data, list) and data:
                    return data
        except Exception:  # noqa: BLE001
            pass

    items: list[dict] = []
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            items = fetch(geo)
            break
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt == 0:
                time.sleep(1.5)

    if not items:
        log.warning("Google Trends %s: %s", geo, last_error)
        try:
            if path.exists():
                stale = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(stale, list) and stale:
                    log.info("Google Trends %s: χρήση παλιάς cache (%s)", geo,
                             time.strftime("%d/%m %H:%M", time.localtime(path.stat().st_mtime)))
                    return stale
        except Exception:  # noqa: BLE001
            pass
        return []

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        log.debug("trends cache: %s", exc)
    return items


def _suffix(data: bytes) -> str:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    return ".jpg"


def _download(url: str, dest_stem: Path, *, timeout: int = 10) -> str | None:
    """Κατεβάζει εικόνα (με cache ανά URL)· επιστρέφει το όνομα αρχείου ή None."""
    if not url:
        return None

    key = hashlib.md5(url.encode("utf-8")).hexdigest()[:16]
    cache_dir = Path(CACHE_DIR) / "trends" / "img"

    hit = None
    if cache_dir.exists():
        hit = next(iter(cache_dir.glob(f"{key}.*")), None)

    if hit is not None:
        try:
            data = hit.read_bytes()
            suffix = hit.suffix
        except OSError:
            hit = None

    if hit is None:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as res:
                data = res.read(2_500_000)
        except Exception as exc:  # noqa: BLE001
            log.debug("trends image %s: %s", url, exc)
            return None
        if len(data) < 512:
            return None
        suffix = _suffix(data)
        try:
            cache_dir.mkdir(parents=True, exist_ok=True)
            (cache_dir / f"{key}{suffix}").write_bytes(data)
        except OSError as exc:
            log.debug("trends image cache: %s", exc)

    dest = dest_stem.with_suffix(suffix)
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    except OSError as exc:
        log.debug("trends image write: %s", exc)
        return None
    return dest.name


def _page(out_dir: Path, geo: str, *, scope_el: str, scope_en: str,
          num: int, limit: int) -> dict:
    items = load(geo)[:limit]
    img_dir = Path(out_dir) / "assets" / "trends"

    rows = []
    for index, item in enumerate(items, start=1):
        rel = None
        name = _download(item.get("image", ""),
                         img_dir / f"{(geo or 'xx').lower()}-{num}-{index}")
        if name:
            rel = f"assets/trends/{name}"

        news = item.get("news") or []
        first = news[0] if news else {}
        rows.append({
            "rank": index,
            "term": item.get("term", ""),
            "traffic": item.get("traffic", ""),
            "image": rel,
            "time": item.get("time", ""),
            "source": item.get("image_source") or first.get("source") or "",
            "headline": first.get("title", ""),
            "headline_url": first.get("url", ""),
            "headline_source": first.get("source", ""),
            "news": news,
        })

    return {
        "num": num,
        "geo": (geo or "").upper(),
        "scope_el": scope_el,
        "scope_en": scope_en,
        "rows": rows,
    }


def build_pages(out_dir: Path, *, country: str = "GR", per_page: int = 10) -> list[dict]:
    """Οι δύο σελίδες trends (παγκόσμιο + χώρα). Κενή λίστα αν δεν υπάρχουν."""
    limit = max(3, min(12, int(per_page or 10)))
    country = (country or "GR").upper()

    pages: list[dict] = []

    world = _page(out_dir, WORLD_GEO, scope_el="ΠΑΓΚΟΣΜΙΟ", scope_en="WORLDWIDE",
                  num=1, limit=limit)
    if world["rows"]:
        pages.append(world)

    if country and country != WORLD_GEO:
        local = _page(out_dir, country, scope_el=country_label(country).upper(),
                      scope_en=country, num=len(pages) + 1, limit=limit)
        if local["rows"]:
            pages.append(local)

    return pages


__all__ = ["build_pages", "load", "fetch", "parse", "COUNTRIES", "country_label",
           "WORLD_GEO"]

