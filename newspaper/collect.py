# -*- coding: utf-8 -*-
"""Συλλογή ειδήσεων από το sites.txt, με fallback αλυσίδα για dynamic sites.

Σειρά στρατηγικής ανά πηγή:
  1. Native RSS/Atom  (γρήγορο, σταθερό)
  2. JSON-LD NewsArticle από την αρχική σελίδα
  3. Jina reader (r.jina.ai) για JS sites που μπλοκάρουν bots
  4. Google News RSS (`site:domain`)
  5. Headless Chrome --dump-dom + γενική εξαγωγή
"""
from __future__ import annotations

import html
import json
import logging
import re
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import quote_plus, urlsplit, urlunsplit

import requests
from lxml import etree, html as lxml_html

import youtube
import settings
from config import CACHE_DIR, ROOT, SOURCES, SITES_FILE, TZ
from health import is_quarantined, load as load_health

log = logging.getLogger("collect")

SOURCES_JSON = ROOT / "sources.json"
FEEDS_CACHE = CACHE_DIR / "feeds.json"
FEEDS_TTL_DAYS = 7

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7",
}

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

_session = requests.Session()
_session.headers.update(HEADERS)


# --------------------------------------------------------------------- utils
def strip_html(raw: str | None) -> str:
    if not raw:
        return ""
    if "<" not in raw:
        text = html.unescape(raw)
    else:
        try:
            text = lxml_html.fromstring(f"<div>{raw}</div>").text_content()
        except Exception:
            text = re.sub(r"<[^>]+>", " ", raw)
        text = html.unescape(text)
    # markdown που επιστρέφει το jina reader
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"(\*\*|__)(.+?)\1", r"\2", text)
    return re.sub(r"\s+", " ", text).strip()


def clean_url(url: str) -> str:
    try:
        p = urlsplit(url.strip())
        if not p.scheme:
            return url.strip()
        return urlunsplit((p.scheme, p.netloc, p.path, "", ""))
    except Exception:
        return url.strip()


def fetch(url: str, *, timeout: int = 20, retries: int = 2,
          headers: dict | None = None) -> requests.Response | None:
    for attempt in range(retries):
        try:
            r = _session.get(url, timeout=timeout, headers=headers)
            if r.status_code in (403, 429, 503) and attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            if r.status_code >= 400:
                log.debug("HTTP %s για %s", r.status_code, url)
                return None
            return r
        except Exception:  # noqa: BLE001
            time.sleep(1.2 * (attempt + 1))
    return None


def parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    value = value.strip()
    try:
        dt = parsedate_to_datetime(value)
        return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        pass
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d", "%d/%m/%Y %H:%M"):
        try:
            dt = datetime.strptime(value, fmt)
            return dt.replace(tzinfo=timezone.utc).astimezone(timezone.utc)
        except Exception:
            continue
    return None


def _localname(tag) -> str:
    return tag.rsplit("}", 1)[-1].lower() if isinstance(tag, str) else ""


def make_item(source: dict, **kw) -> dict:
    return {
        "source_id": source["id"],
        "source_name": source["name"],
        "domain": source["domain"],
        "lang": source["lang"],
        "tier": source["tier"],
        "title": kw.get("title", ""),
        "summary": (kw.get("summary") or "")[:600],
        "url": clean_url(kw.get("url", "")),
        "published": kw.get("published"),
        "categories": kw.get("categories") or [],
        "image": kw.get("image"),
    }


# ------------------------------------------------------------------ RSS/Atom
def parse_feed(raw: bytes, source: dict) -> list[dict]:
    try:
        root = etree.fromstring(raw, parser=etree.XMLParser(recover=True, huge_tree=True))
    except Exception:
        return []

    entries = [el for el in root.iter() if _localname(el.tag) in ("item", "entry")]
    items: list[dict] = []
    for entry in entries:
        data: dict[str, list[str]] = {}
        media: list[str] = []
        for child in entry:
            name = _localname(child.tag)
            if name in ("content", "thumbnail") and "media" in (child.tag or ""):
                if child.get("url"):
                    media.append(child.get("url"))
                continue
            if name == "enclosure" and child.get("type", "").startswith("image") and child.get("url"):
                media.append(child.get("url"))
                continue
            if name == "link":
                href = child.get("href") or (child.text or "")
                if href:
                    data.setdefault("link", []).append(href.strip())
                continue
            if name in ("category", "subject"):
                data.setdefault("category", []).append((child.text or "").strip())
                continue
            txt = "".join(child.itertext()).strip()
            if txt:
                data.setdefault(name, []).append(txt)

        title = strip_html((data.get("title") or [""])[0])
        link = next((c for c in data.get("link", []) if c.startswith("http")), "")
        if not title or not link:
            continue

        summary = ""
        for key in ("description", "summary", "encoded", "content", "subtitle"):
            if data.get(key):
                summary = strip_html(data[key][0])
                break
        if summary == title:
            summary = ""

        published = None
        for key in ("pubdate", "published", "updated", "date"):
            if data.get(key):
                published = parse_date(data[key][0])
                if published:
                    break

        items.append(make_item(
            source, title=title, summary=summary, url=link,
            published=published.isoformat() if published else None,
            categories=[c for c in data.get("category", []) if c][:6],
            image=media[0] if media else None,
        ))
    return items


# --------------------------------------------------------------- JSON-LD
def _walk_json(node, out: list[dict]):
    if isinstance(node, dict):
        if node.get("headline") or (node.get("@type") in ("NewsArticle", "Article", "BlogPosting")):
            out.append(node)
        for v in node.values():
            _walk_json(v, out)
    elif isinstance(node, list):
        for v in node:
            _walk_json(v, out)


def parse_jsonld(doc, source: dict, limit: int = 30) -> list[dict]:
    items, seen = [], set()
    for script in doc.xpath('//script[@type="application/ld+json"]'):
        raw = script.text_content().strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except Exception:
            continue
        found: list[dict] = []
        _walk_json(data, found)
        for node in found:
            title = strip_html(node.get("headline") or node.get("name") or "")
            url = node.get("url") or node.get("mainEntityOfPage") or ""
            if isinstance(url, dict):
                url = url.get("@id") or url.get("url") or ""
            if not title or not url or not str(url).startswith("http"):
                continue
            url = str(url)
            if url in seen:
                continue
            seen.add(url)
            image = node.get("image")
            if isinstance(image, dict):
                image = image.get("url")
            elif isinstance(image, list):
                image = image[0] if image else None
                if isinstance(image, dict):
                    image = image.get("url")
            items.append(make_item(
                source, title=title, summary=strip_html(node.get("description") or ""),
                url=url, published=node.get("datePublished") if isinstance(node.get("datePublished"), str) else None,
                image=image,
            ))
            if len(items) >= limit:
                return items
    return items


# ---------------------------------------------------------------- jina reader
MD_LINK = re.compile(r"^\[([^\]]{12,240})\]\((https?://[^)\s]+)\)\s*$")


def parse_jina(raw: str, source: dict) -> list[dict]:
    link_filter = re.compile(source["link_filter"]) if source.get("link_filter") else None
    lines = raw.splitlines()
    items, seen = [], set()

    for i, line in enumerate(lines):
        m = MD_LINK.match(line.strip())
        if not m:
            continue
        title, url = strip_html(m.group(1)), m.group(2)
        if link_filter and not link_filter.search(url):
            continue
        if url in seen or len(title) < 20:
            continue
        if title.lower() in {"home", "news", "watch", "stats", "schedule", "games", "more"}:
            continue
        seen.add(url)

        summary, image = "", None
        for nxt in lines[i + 1: i + 8]:
            s = nxt.strip()
            if not s:
                continue
            img = re.match(r"^!\[[^\]]*\]\((https?://[^)\s]+)\)", s)
            if img and not image:
                image = img.group(1)
                continue
            if MD_LINK.match(s) or s.startswith(("*", "#", "-", "See full")):
                continue
            if len(s) > 60:
                summary = s
                break

        items.append(make_item(source, title=title, summary=summary or title, url=url, image=image))
    return items


# ------------------------------------------------------------- Google News
def gnews_items(query: str, source: dict, limit: int = 25) -> list[dict]:
    if source.get("lang") == "el":
        locale = "hl=el&gl=GR&ceid=GR:el"
    else:
        locale = "hl=en-US&gl=US&ceid=US:en"
    out: list[dict] = []
    for window in ("2d", "7d"):
        url = ("https://news.google.com/rss/search?q=" + quote_plus(f"{query} when:{window}")
               + "&" + locale)
        r = fetch(url, timeout=20)
        if not r:
            continue
        parsed = parse_feed(r.content, source)
        if parsed:
            out = parsed
            break
    for it in out:
        it["title"] = re.sub(r"\s+-\s+[^-]{2,40}$", "", it["title"]).strip()
    return out[:limit]


# --------------------------------------------------------------- Chrome DOM
def chrome_dump(url: str, wait_ms: int = 8000) -> str | None:
    exe = next((p for p in CHROME_CANDIDATES if Path(p).exists()), None)
    if not exe:
        return None
    with tempfile.TemporaryDirectory(prefix="hmerisia-") as tmp:
        cmd = [exe, "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
               f"--user-data-dir={tmp}", f"--virtual-time-budget={wait_ms}", "--dump-dom", url]
        try:
            return subprocess.run(cmd, capture_output=True, timeout=45).stdout.decode("utf-8", "ignore")
        except Exception:
            return None


def parse_dom(raw: str, source: dict) -> list[dict]:
    try:
        doc = lxml_html.fromstring(raw)
    except Exception:
        return []
    link_filter = re.compile(source["link_filter"]) if source.get("link_filter") else None
    items, seen = [], set()
    for a in doc.iter("a"):
        title = strip_html(a.text_content()).strip()
        href = (a.get("href") or "").strip()
        if not href.startswith("http"):
            continue
        if link_filter and not link_filter.search(href):
            continue
        if len(title) < 25 or href in seen:
            continue
        seen.add(href)
        items.append(make_item(source, title=title, url=href))
    return items


# ------------------------------------------------------------ discovery
def discover_feeds(home: str, domain: str) -> list[str]:
    """Βρες RSS/Atom feed από την αρχική σελίδα, με cache 7 ημερών."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = {}
    if FEEDS_CACHE.exists():
        try:
            cache = json.loads(FEEDS_CACHE.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    entry = cache.get(domain)
    if entry:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(entry["at"])).days
        if age < FEEDS_TTL_DAYS:
            return entry.get("feeds", [])

    r = fetch(home, timeout=20)
    if not r:
        return []
    try:
        doc = lxml_html.fromstring(r.content)
    except Exception:
        return []

    feeds: list[str] = []
    for link in doc.xpath("//link[contains(@type,'rss') or contains(@type,'atom')]"):
        href = link.get("href")
        if href:
            feeds.append(requests.compat.urljoin(home, href))
    if not feeds:
        for guess in ("/feed", "/rss", "/rss.xml", "/feed.xml", "/news/rss.xml"):
            feeds.append(home.rstrip("/") + guess)

    feeds = list(dict.fromkeys(feeds))[:4]
    cache[domain] = {"at": datetime.now(timezone.utc).isoformat(), "feeds": feeds}
    FEEDS_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info("Ανακάλυψη feeds για %s: %s", domain, feeds)
    return feeds


# ------------------------------------------------------------- source config
def _known(host: str, known: set[str]) -> bool:
    return any(host == k or host.endswith("." + k) for k in known)


def load_sources() -> list[dict]:
    """SOURCES + sources.json + ό,τι υπάρχει μόνο στο sites.txt."""
    overrides: dict[str, dict] = {}
    if SOURCES_JSON.exists():
        try:
            overrides = json.loads(SOURCES_JSON.read_text(encoding="utf-8"))
        except Exception:
            overrides = {}

    sources: list[dict] = []
    for base in SOURCES:
        entry = dict(base)
        entry.update(overrides.get(base["domain"], {}))
        sources.append(entry)

    known = {s["domain"].replace("www.", "") for s in sources}
    youtube_ids = {s["id"] for s in sources}
    if SITES_FILE.exists():
        for line in SITES_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "://" not in line:
                continue

            # Κανάλια YouTube: κάθε URL είναι ξεχωριστή πηγή (όχι dedupe ανά host).
            if youtube.is_youtube(line):
                handle = line.rstrip("/").split("/")[-1] or "youtube"
                source_id = f"yt-{re.sub(r'[^a-z0-9]+', '_', handle.lower())}"
                if source_id in youtube_ids:
                    continue
                entry = {
                    "id": source_id,
                    "name": handle,
                    "domain": "youtube.com",
                    "lang": "en",
                    "tier": 3,
                    "category": "video",
                    "home": line,
                    "auto": True,
                    "kind": "youtube",
                }
                entry.update(overrides.get(source_id, {}))
                sources.append(entry)
                youtube_ids.add(source_id)
                continue

            host = urlsplit(line).netloc.lower().replace("www.", "")
            if _known(host, known):
                continue
            entry = {
                "id": re.sub(r"[^a-z0-9]+", "_", host),
                "name": host,
                "domain": host,
                "lang": "en",
                "tier": 3,
                "category": "news",
                "home": line,
                "auto": True,
            }
            entry.update(overrides.get(host, {}))
            sources.append(entry)
            known.add(host)

    disabled = [_norm_source(url) for url in (settings.get("sources_disabled") or []) if url]
    if disabled:
        sources = [s for s in sources if not _is_disabled(s, disabled)]
    return sources


def _norm_source(url: str) -> str:
    """Κανονικοποίηση URL πηγής για σύγκριση (χωρίς πηγή, www, τελικό /)."""
    value = (url or "").strip().lower().rstrip("/")
    value = re.sub(r"^https?://", "", value)
    value = re.sub(r"^www\.", "", value)
    return value


def _is_disabled(source: dict, disabled: list[str]) -> bool:
    home = _norm_source(source.get("home", ""))
    domain = _norm_source(source.get("domain", ""))
    for key in disabled:
        if not key:
            continue
        if key == domain or key == home:
            return True
        # Πλήρες URL (π.χ. κανάλι YouTube) ή υποδιαδρομή του site
        if home.startswith(key + "/") or key.startswith(home + "/"):
            return True
    return False


def persist_discovered(source: dict, feeds: list[str]) -> None:
    """Γράφει τα feeds που βρέθηκαν αυτόματα στο sources.json."""
    if source.get("probe") or not source.get("auto") or not feeds:
        return
    data = {}
    if SOURCES_JSON.exists():
        try:
            data = json.loads(SOURCES_JSON.read_text(encoding="utf-8"))
        except Exception:
            data = {}
    entry = data.get(source["domain"], {})
    entry.update({
        "name": source["name"],
        "lang": source.get("lang", "en"),
        "tier": source.get("tier", 3),
        "category": source.get("category", "news"),
        "feeds": feeds,
        "auto": True,
    })
    data[source["domain"]] = entry
    SOURCES_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ------------------------------------------------------------------- source
def collect_source(source: dict) -> tuple[list[dict], dict]:
    items: list[dict] = []
    meta = {"method": "—", "note": ""}
    notes: list[str] = []

    health = load_health().get(source["name"], {})
    if is_quarantined(health):
        return [], {"method": "quarantine", "note": "σε καραντίνα"}

    # 0. auto discovery για άγνωστα sites
    if source.get("auto") and not source.get("feeds"):
        discovered = discover_feeds(source.get("home", ""), source["domain"])
        if discovered:
            source = {**source, "feeds": discovered}
            persist_discovered(source, discovered)

    if not source.get("feeds") and not source.get("jina") and not source.get("gnews"):
        source = {**source, "gnews": f"site:{source['domain']}"}

    # 1. RSS
    for feed in source.get("feeds", []):
        r = fetch(feed, timeout=20)
        if not r:
            notes.append("feed down")
            continue
        parsed = parse_feed(r.content, source)
        if parsed:
            items.extend(parsed)
            notes.append(f"rss {len(parsed)}")
        else:
            notes.append("feed κενό")

    # 2. JSON-LD από την αρχική
    if len(items) < 3 and source.get("home"):
        r = fetch(source["home"], timeout=20)
        if r:
            try:
                doc = lxml_html.fromstring(r.content)
                parsed = parse_jsonld(doc, source)
                if parsed:
                    items.extend(parsed)
                    notes.append(f"jsonld {len(parsed)}")
            except Exception:
                pass

    # 3. Jina
    if len(items) < 3 and source.get("jina"):
        r = fetch(source["jina"], timeout=40, headers={"User-Agent": UA, "Accept": "text/plain"})
        if r and r.text and "Security Checkpoint" not in r.text:
            parsed = parse_jina(r.text, source)
            if parsed:
                items.extend(parsed)
                notes.append(f"jina {len(parsed)}")
            else:
                notes.append("jina κενό")
        else:
            notes.append("jina blocked")

    # 4. Google News
    if len(items) < 3 and source.get("gnews"):
        parsed = gnews_items(source["gnews"], source)
        if parsed:
            items.extend(parsed)
            notes.append(f"gnews {len(parsed)}")

    # 5. Headless Chrome
    if len(items) < 3 and source.get("home"):
        dom = chrome_dump(source["home"])
        if dom:
            parsed = parse_dom(dom, source)
            if parsed:
                items.extend(parsed)
                notes.append(f"chrome {len(parsed)}")

    uniq: dict[str, dict] = {}
    for it in items:
        key = it["url"] or it["title"].lower()
        if key not in uniq or len(it.get("summary") or "") > len(uniq[key].get("summary") or ""):
            uniq[key] = it

    ordered = [n.split()[0] for n in notes if n.split()]
    meta["method"] = ordered[0] if ordered else "—"
    meta["note"] = ", ".join(notes) or "καμία πηγή"
    return list(uniq.values()), meta


def collect_all(offline: bool = False) -> tuple[list[dict], dict]:
    sources = load_sources()
    cache_file = CACHE_DIR / "collect.json"
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    if offline and cache_file.exists():
        data = json.loads(cache_file.read_text(encoding="utf-8"))
        log.info("Offline: %s items από cache", len(data.get("items", [])))
        return data.get("items", []), data.get("report", {})

    all_items: list[dict] = []
    report: dict[str, dict] = {}

    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {}
        for source in sources:
            worker = youtube.collect if source.get("kind") == "youtube" else collect_source
            futures[pool.submit(worker, source)] = source
        for fut in as_completed(futures):
            s = futures[fut]
            try:
                items, meta = fut.result()
            except Exception as e:  # noqa: BLE001
                items, meta = [], {"method": "error", "note": str(e)[:80]}
            all_items.extend(items)
            report[s["name"]] = {"count": len(items), **meta}
            log.info("%-18s %3d  [%s] %s", s["name"], len(items), meta["method"], meta["note"])

    cache_file.write_text(json.dumps({
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "items": all_items, "report": report,
    }, ensure_ascii=False), encoding="utf-8")
    return all_items, report


def probe_source(url: str) -> dict:
    """Δοκιμή μίας πηγής (για το UI «Δοκιμή πηγής»)."""
    host = urlsplit(url).netloc.lower().replace("www.", "")

    if youtube.is_youtube(url):
        handle = url.rstrip("/").split("/")[-1] or "youtube"
        entry = {
            "id": f"yt-{re.sub(r'[^a-z0-9]+', '_', handle.lower())}",
            "name": handle,
            "domain": "youtube.com",
            "lang": "en",
            "tier": 3,
            "category": "video",
            "home": url,
            "kind": "youtube",
        }
        items, meta = youtube.collect(entry)
    else:
        # Αν η πηγή είναι ήδη ρυθμισμένη, δοκιμάζουμε την πραγματική της διαμόρφωση.
        entry = next(
            (s for s in load_sources()
             if host == s["domain"] or host.endswith("." + s["domain"])
             or s.get("home") == url),
            None,
        )
        if entry is None:
            entry = {
                "id": re.sub(r"[^a-z0-9]+", "_", host),
                "name": host,
                "domain": host,
                "lang": "el" if host.endswith(".gr") else "en",
                "tier": 3,
                "category": "news",
                "home": url,
                "auto": True,
                "probe": True,
            }
        items, meta = collect_source(dict(entry))

    return {
        "site": entry["name"],
        "domain": host,
        "method": meta["method"],
        "items": len(items),
        "status": "ok" if len(items) >= 3 else ("degraded" if items else "broken"),
        "note": meta["note"],
    }


def check_sources() -> list[dict]:
    """Διαγνωστικό: τι επιστρέφει κάθε πηγή αυτή τη στιγμή."""
    rows = []
    for source in load_sources():
        start = time.time()
        worker = youtube.collect if source.get("kind") == "youtube" else collect_source
        items, meta = worker(source)
        rows.append({
            "site": source["name"],
            "domain": source["domain"],
            "method": meta["method"],
            "items": len(items),
            "seconds": round(time.time() - start, 1),
            "status": "ok" if len(items) >= 3 else ("degraded" if items else "broken"),
            "note": meta["note"],
        })
    return rows
