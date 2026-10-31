# -*- coding: utf-8 -*-
"""Εξαγωγή κυρίως κειμένου άρθρου (trafilatura + fallback lxml).

Cache ανά URL στο cache/articles/<sha>.json, ώστε η ημερήσια εκτέλεση
να μη ξανακατεβάζει τα ίδια άρθρα.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import requests
from lxml import html as lxml_html

from config import CACHE_DIR

log = logging.getLogger("articles")

CACHE_ARTICLES = CACHE_DIR / "articles"
CACHE_ARTICLES.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7",
}

BOILERPLATE = re.compile(
    r"^(read more|read also|see also|sign up|subscribe|follow us|share this|"
    r"advertisement|photo(graph)?\s*:|image\s*:|getty images|afp|reuters|"
    r"διαβάστε (επίσης|περισσότερα)|δείτε (επίσης|περισσότερα)|περισσότερα\s*[»>]|"
    r"φωτογραφία\s*:|πηγή\s*:|διαφήμιση|εγγραφείτε|ακολουθήστε μας)\b",
    re.IGNORECASE,
)

CONSENT = re.compile(
    r"(we use cookies|this site uses cookies|cookie (policy|settings|consent)|"
    r"χρησιμοποιούμε cookies|πολιτική cookies|δεδομένων ip|"
    r"αποδοχή όλων|accept all|manage (preferences|consent)|gdpr|"
    r"consent to the use|third-party cookies|διαφημιστικούς συνεργάτες)",
    re.IGNORECASE,
)

MIN_LINE = 45


def _sha(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


def _cache_path(url: str) -> Path:
    return CACHE_ARTICLES / f"{_sha(url)}.json"


def _clean(lines: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in lines:
        line = re.sub(r"\s+", " ", (raw or "")).strip()
        if len(line) < MIN_LINE:
            continue
        if BOILERPLATE.match(line):
            continue
        if CONSENT.search(line):
            continue
        if line.lower() in seen:
            continue
        seen.add(line.lower())
        out.append(line)
    return out


def _from_trafilatura(html_text: str, url: str) -> list[str]:
    try:
        import trafilatura
    except ImportError:
        return []
    try:
        text = trafilatura.extract(
            html_text,
            url=url,
            include_comments=False,
            include_tables=False,
            favor_recall=True,
            deduplicate=True,
        )
    except Exception as e:  # noqa: BLE001
        log.debug("trafilatura απέτυχε %s: %s", url, e)
        return []
    if not text:
        return []
    return _clean(text.splitlines())


def _from_lxml(html_text: str) -> list[str]:
    try:
        doc = lxml_html.fromstring(html_text)
    except Exception:
        return []

    best: list[str] = []
    for node in doc.xpath("//article | //main | //div[@class or @id]"):
        paragraphs = [
            re.sub(r"\s+", " ", p.text_content()).strip()
            for p in node.xpath(".//p")
        ]
        paragraphs = [p for p in paragraphs if len(p) >= MIN_LINE]
        total = sum(len(p) for p in paragraphs)
        if total > sum(len(p) for p in best):
            best = paragraphs
    return _clean(best)


def _image_candidates(html_text: str) -> list[str]:
    """og:image, twitter:image, JSON-LD, πρώτο μεγάλο <img>."""
    try:
        doc = lxml_html.fromstring(html_text)
    except Exception:
        return []

    found: list[str] = []
    for key in ("property", "name", "itemprop"):
        for name in ("og:image", "og:image:url", "twitter:image", "twitter:image:src"):
            for value in doc.xpath(f'//meta[@{key}="{name}"]/@content'):
                if value and value.startswith("http"):
                    found.append(value)

    for script in doc.xpath('//script[@type="application/ld+json"]')[:6]:
        raw = script.text_content() or ""
        for match in re.findall(r'"(?:url|contentUrl)"\s*:\s*"(https?://[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"', raw):
            found.append(match)
        for match in re.findall(r'"image"\s*:\s*"([^"]+)"', raw):
            if match.startswith("http"):
                found.append(match)

    for img in doc.xpath("//article//img | //main//img | //img[@src]"):
        src = img.get("src") or img.get("data-src") or ""
        if not src.startswith("http"):
            continue
        if any(bad in src.lower() for bad in ("logo", "icon", "avatar", "sprite", "placeholder")):
            continue
        width = img.get("width") or ""
        if width.isdigit() and int(width) < 400:
            continue
        found.append(src)

    cleaned: list[str] = []
    seen: set[str] = set()
    for url in found:
        url = url.split("?")[0] if "?" not in url else url
        if url not in seen:
            seen.add(url)
            cleaned.append(url)
    return cleaned[:6]


def extract(url: str, *, timeout: int = 20, force: bool = False) -> dict:
    path = _cache_path(url)
    if path.exists() and not force:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass

    result = {
        "url": url,
        "ok": False,
        "title": "",
        "paragraphs": [],
        "images": [],
        "words": 0,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        response = requests.get(url, headers=HEADERS, timeout=timeout)
        if response.status_code < 400 and response.content:
            html_text = response.content.decode("utf-8", "ignore")
            paragraphs = _from_trafilatura(html_text, url) or _from_lxml(html_text)
            result["images"] = _image_candidates(html_text)
            if paragraphs:
                result.update(ok=True, paragraphs=paragraphs,
                              words=sum(len(p.split()) for p in paragraphs))
                try:
                    doc = lxml_html.fromstring(response.content)
                    title = doc.xpath("//meta[@property='og:title']/@content")
                    result["title"] = (title[0] if title else "").strip()
                except Exception:
                    pass
    except Exception as e:  # noqa: BLE001
        log.debug("άρθρο απέτυχε %s: %s", url, e)

    try:
        path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass
    return result


def excerpt(article: dict, max_words: int) -> str:
    """Παράγραφοι έως max_words λέξεις, χωρίς κομμένες προτάσεις."""
    if not article or not article.get("paragraphs"):
        return ""
    parts: list[str] = []
    used = 0
    for paragraph in article["paragraphs"]:
        words = paragraph.split()
        if used + len(words) <= max_words:
            parts.append(paragraph)
            used += len(words)
        else:
            remaining = max_words - used
            if remaining >= 25:
                parts.append(" ".join(words[:remaining]).rstrip(",;:") + "…")
            break
    return "\n".join(parts)


def attach(items: list[dict], *, workers: int = 8, min_words: int = 60) -> dict:
    """Κατεβάζει άρθρα για όσα θέματα δεν έχουν ήδη κείμενο."""
    targets = [x for x in items if x.get("url", "").startswith("http")
               and (x.get("words") or 0) < min_words]
    if not targets:
        return {"fetched": 0, "ok": 0}

    def work(item: dict) -> None:
        article = extract(item["url"])
        if article.get("ok"):
            item["paragraphs"] = article["paragraphs"]
            item["words"] = article["words"]
        else:
            item.setdefault("paragraphs", [])
        candidates = article.get("images") or []
        if candidates:
            item["image_candidates"] = candidates
            if not item.get("image"):
                item["image"] = candidates[0]

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(work, targets))

    ok = sum(1 for x in targets if (x.get("words") or 0) >= min_words)
    log.info("Άρθρα: %s/%s ανακτήθηκε", ok, len(targets))
    return {"fetched": len(targets), "ok": ok}
