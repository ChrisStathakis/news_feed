# -*- coding: utf-8 -*-
"""YouTube: νέα βίντεο καναλιών + extractive περίληψη.

Χωρίς API key:
  1. Επίλυση channelId από το HTML του καναλιού (cache).
  2. RSS  youtube.com/feeds/videos.xml?channel_id=…
  3. Απομαγνητοφώνηση (youtube-transcript-api) ή περιγραφή.
  4. Περίληψη TextRank-lite: πρόταση = συχνότητα όρων + θέση.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit, parse_qs

import requests
from lxml import etree

from config import CACHE_DIR

log = logging.getLogger("youtube")

CHANNEL_CACHE = CACHE_DIR / "yt_channels.json"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")

HEADERS = {
    "User-Agent": UA,
    "Accept-Language": "en-US,en;q=0.9,el;q=0.8",
    "Cookie": "SOCS=CAI",
}

CHANNEL_ID_RE = re.compile(r'"channelId":"(UC[0-9A-Za-z_-]{22})"')
EXTERNAL_ID_RE = re.compile(r'"externalId":"(UC[0-9A-Za-z_-]{22})"')
CHANNEL_META_RE = re.compile(r'<meta itemprop="identifier" content="(UC[0-9A-Za-z_-]{22})"')


def _extract_channel_id(html_text: str) -> str | None:
    for pattern in (EXTERNAL_ID_RE, CHANNEL_ID_RE, CHANNEL_META_RE):
        match = pattern.search(html_text or "")
        if match:
            return match.group(1)
    return None


def _fetch_page(url: str):
    try:
        return requests.get(url, headers=HEADERS, timeout=25, params={"gl": "US", "hl": "en"})
    except Exception as e:  # noqa: BLE001
        log.debug("youtube σελίδα απέτυχε %s: %s", url, e)
        return None

STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
    "is", "are", "was", "were", "be", "been", "it", "its", "this", "that", "as",
    "at", "by", "from", "we", "you", "they", "he", "she", "i", "not", "so", "if",
    "και", "να", "το", "η", "ο", "τα", "οι", "του", "της", "των", "στο", "στη",
    "με", "για", "από", "που", "θα", "είναι", "ένα", "μια", "δεν", "αλλά",
}


def is_youtube(url: str) -> bool:
    try:
        host = urlsplit(url).netloc.lower()
    except Exception:
        return False
    return any(h in host for h in ("youtube.com", "youtu.be"))


def video_id(url: str) -> str | None:
    try:
        parts = urlsplit(url)
    except Exception:
        return None
    if "youtu.be" in parts.netloc:
        return parts.path.strip("/").split("/")[0] or None
    if parts.path.startswith("/watch"):
        return (parse_qs(parts.query).get("v") or [None])[0]
    for prefix in ("/shorts/", "/embed/", "/live/"):
        if parts.path.startswith(prefix):
            return parts.path[len(prefix):].split("/")[0].split("?")[0]
    return None


# ------------------------------------------------------------------ channel
def _load_cache() -> dict:
    if CHANNEL_CACHE.exists():
        try:
            return json.loads(CHANNEL_CACHE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_cache(data: dict) -> None:
    CHANNEL_CACHE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def resolve_channel(url: str) -> dict | None:
    """Επιστρέφει {id, title, url} για κανάλι/χειριστή/βίντεο."""
    cache = _load_cache()
    key = url.rstrip("/")
    if key in cache and cache[key].get("id"):
        return cache[key]

    target = url
    direct = re.search(r"/(channel|user)/(UC[0-9A-Za-z_-]{22})", url)
    if direct:
        info = {"id": direct.group(2), "title": "", "url": url}
        cache[key] = info
        _save_cache(cache)
        return info

    if "/watch" in url or "youtu.be" in url:
        vid = video_id(url)
        target = f"https://www.youtube.com/watch?v={vid}" if vid else url

    response = _fetch_page(target)
    html_text = response.text if response is not None and response.status_code < 400 else ""
    channel = _extract_channel_id(html_text)

    # Συχνά το /@handle γυρίζει σε consent page· δοκιμάζουμε legacy URLs.
    if not channel:
        handle = url.rstrip("/").split("/")[-1].lstrip("@")
        for alternative in (f"https://www.youtube.com/user/{handle}",
                            f"https://www.youtube.com/c/{handle}"):
            alt = _fetch_page(alternative)
            if alt is not None and alt.status_code < 400:
                channel = _extract_channel_id(alt.text)
                if channel:
                    html_text = alt.text
                    break

    if not channel:
        log.warning("Δεν βρέθηκε channelId για %s", url)
        return None

    title = ""
    title_match = re.search(r'<meta property="og:title" content="([^"]+)"', html_text)
    if title_match:
        title = title_match.group(1).strip()

    info = {"id": channel, "title": title, "url": url}
    cache[key] = info
    _save_cache(cache)
    return info


# --------------------------------------------------------------------- feed
def _text(node, path: str, ns: dict | None = None) -> str:
    found = node.find(path, ns) if ns else node.find(path)
    return (found.text or "").strip() if found is not None else ""


def latest_videos(channel_id: str, limit: int = 8) -> list[dict]:
    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    try:
        response = requests.get(url, headers={"User-Agent": UA}, timeout=20)
        if response.status_code >= 400:
            return []
        root = etree.fromstring(response.content)
    except Exception as e:  # noqa: BLE001
        log.debug("rss καναλιού απέτυχε %s: %s", channel_id, e)
        return []

    ns = {
        "a": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
        "media": "http://search.yahoo.com/mrss/",
    }

    videos: list[dict] = []
    for entry in root.findall("a:entry", ns):
        vid = _text(entry, "yt:videoId", ns)
        title = _text(entry, "a:title", ns)
        if not vid or not title:
            continue
        published = _text(entry, "a:published", ns)
        description = _text(entry, "media:group/media:description", ns)
        thumb = ""
        thumb_node = entry.find("media:group/media:thumbnail", ns)
        if thumb_node is not None:
            thumb = thumb_node.get("url", "")
        channel = _text(entry, "a:author/a:name", ns)
        videos.append({
            "video_id": vid,
            "title": title,
            "published": published,
            "description": description,
            "thumbnail": thumb or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
            "channel": channel,
            "url": f"https://www.youtube.com/watch?v={vid}",
        })
        if len(videos) >= limit:
            break
    return videos


# --------------------------------------------------------------- transcript
def transcript(video_id_str: str) -> str:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        return ""

    try:
        api = YouTubeTranscriptApi()
        fetched = api.fetch(video_id_str, languages=["el", "en", "en-US"])
        snippets = getattr(fetched, "snippets", None)
        if snippets is None:
            snippets = fetched
        parts = []
        for snippet in snippets:
            text = getattr(snippet, "text", None)
            if text is None and isinstance(snippet, dict):
                text = snippet.get("text", "")
            if text:
                parts.append(str(text).replace("\n", " ").strip())
        return " ".join(parts)
    except Exception as e:  # noqa: BLE001
        log.debug("transcript απέτυχε %s: %s", video_id_str, e)
        return ""


# ------------------------------------------------------------------ summary
SENTENCE_RE = re.compile(r"(?<=[.!?;])\s+|\n+")


def _tokens(text: str) -> list[str]:
    words = re.findall(r"[A-Za-zΑ-Ωα-ωΆ-Ώά-ώ0-9']{3,}", text.lower())
    return [w for w in words if w not in STOPWORDS]


def summarize(text: str, *, sentences: int = 6, max_words: int = 180) -> str:
    """Extractive περίληψη: συχνότητα όρων + θέση πρότασης."""
    clean = re.sub(r"https?://\S+", " ", text or "")
    clean = re.sub(r"(?i)(subscribe|ακολουθήστε|εγγραφείτε|περισσότερα στο|more at)\s*:?\s*", " ", clean)
    clean = re.sub(r"#\w+", " ", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    if not clean:
        return ""

    parts = [s.strip() for s in SENTENCE_RE.split(clean) if len(s.strip()) > 40]
    if len(parts) <= sentences:
        return " ".join(parts)[:max_words * 8]

    freq: dict[str, int] = {}
    for part in parts:
        for token in _tokens(part):
            freq[token] = freq.get(token, 0) + 1

    scored: list[tuple[float, int, str]] = []
    for index, part in enumerate(parts):
        tokens = _tokens(part)
        if not tokens:
            continue
        weight = sum(freq.get(t, 1) for t in tokens) / (len(tokens) ** 0.6)
        position = 1.0 if index < 3 else 1.0 / (index + 1) ** 0.4
        scored.append((weight * position, index, part))

    chosen = sorted(sorted(scored, reverse=True)[:sentences], key=lambda x: x[1])
    out: list[str] = []
    used = 0
    for _, _, part in chosen:
        if used + len(part.split()) > max_words:
            break
        out.append(part)
        used += len(part.split())
    return " ".join(out) if out else " ".join(parts[:sentences])


# ------------------------------------------------------------------ collect
def collect(source: dict, *, limit: int = 8) -> tuple[list[dict], dict]:
    url = source.get("home") or source.get("domain")
    info = resolve_channel(url)
    if not info:
        return [], {"method": "youtube", "note": "δεν βρέθηκε κανάλι"}

    videos = latest_videos(info["id"], limit=limit)
    if not videos:
        return [], {"method": "youtube", "note": "rss κενό"}

    items: list[dict] = []
    with_text = 0
    for video in videos:
        script = transcript(video["video_id"])
        if script:
            with_text += 1
            summary = summarize(script, sentences=6, max_words=170)
            summary_source = "transcript"
        else:
            summary = summarize(video.get("description") or "", sentences=4, max_words=90)
            summary_source = "description"

        published = video.get("published")
        try:
            dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
            published_iso = dt.astimezone(timezone.utc).isoformat()
        except Exception:
            published_iso = datetime.now(timezone.utc).isoformat()

        channel = video.get("channel") or info.get("title") or source.get("name", "")
        items.append({
            "source_id": source["id"],
            "source_name": channel or source["name"],
            "domain": "youtube.com",
            "lang": "en",
            "tier": 3,
            "title": video["title"],
            "summary": summary,
            "url": video["url"],
            "published": published_iso,
            "image": video["thumbnail"],
            "categories": ["video"],
            "kind": "video",
            "video_id": video["video_id"],
            "channel": channel,
            "summary_source": summary_source,
        })

    note = f"youtube {len(items)} (transcripts {with_text})"
    return items, {"method": "youtube", "note": note}
