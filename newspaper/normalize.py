# -*- coding: utf-8 -*-
"""Καθαρισμός, φίλτρο ημερομηνίας και deduplication."""
from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from config import FRESH_WINDOW_H, SOURCES, TZ

STOPWORDS = {
    "the", "a", "an", "of", "in", "on", "to", "for", "and", "with", "as", "at",
    "by", "from", "is", "are", "was", "were", "be", "been", "it", "its", "his",
    "her", "their", "this", "that", "after", "over", "into", "about", "new",
    "says", "said", "will", "may", "can", "how", "why", "what", "who",
    "ο", "η", "το", "οι", "τα", "του", "της", "των", "στο", "στη", "στην",
    "και", "με", "για", "από", "που", "να", "θα", "είναι", "ένα", "μια",
    "μετά", "πριν", "νέα", "νέο", "σήμερα",
}

EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U00002B00-\U00002BFF"
    "\U0001F1E6-\U0001F1FF\uFE0F\u200d]+"
)

TITLE_NOISE = [    r"\s*[-–|]\s*(CNN Greece|CNN|BBC News|BBC|GameSpot|Yahoo Finance|NBA\.com|NBA|IMDb|EuroLeague)\s*$",
    r"^(VIDEO|LIVE|WATCH|READ|BREAKING|ΑΠΟΚΛΕΙΣΤΙΚΟ|ΒΙΝΤΕΟ|ΖΩΝΤΑΝΑ|ΔΙΑΒΑΣΤΕ|ΔΕΙΤΕ)\s*[:·-]\s*",
]

JUNK_TITLE = re.compile(
    r"(cookies? (policy|settings|notice)|privacy policy|sign in|log in|subscribe|newsletter|"
    r"advertise with us|terms of (use|service)|all rights reserved|follow us|download the app|"
    r"for more information visit|visit our|click here|read more|accept all|"
    r"πολιτική (απορρήτου|cookies)|πολιτική μας|περισσότερες πληροφορίες|"
    r"σύνδεση|εγγραφή|διαφήμιση|αποδοχή όλων|όροι χρήσης|διαβάστε περισσότερα)",
    re.IGNORECASE,
)
MATCH_LISTING = re.compile(
    r"(\b\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s*$)"
    r"|(\bvs\.?\s+.+\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4})"
    r"|(\b(Ιανουαρίου|Φεβρουαρίου|Μαρτίου|Απριλίου|Μαΐου|Ιουνίου|Ιουλίου|Αυγούστου|Σεπτεμβρίου|Οκτωβρίου|Νοεμβρίου|Δεκεμβρίου)\s+\d{1,2},\s+\d{4})",
    re.IGNORECASE,
)

# «…of 2022» / «…του 2024» = παλιό evergreen άρθρο
STALE_TITLE = re.compile(r"\b(?:of|in|into|for|του|για το)\s+(20\d{2})\b", re.IGNORECASE)

# --- διαφημίσεις / sponsored περιεχόμενο -----------------------------------
AD_HARD = re.compile(
    r"(sponsored|advertorial|paid post|partner content|native ad|"
    r"διαφήμιση|χορηγούμενο|καταχώρηση)",
    re.IGNORECASE,
)
AD_URL = re.compile(r"/(sponsored|partner|advertorial|offers|deals|promo)(/|$)", re.IGNORECASE)
# Καθαρές «προσφορές» — σχεδόν ποτέ είδηση, κόβονται πάντα.
AD_OFFER = re.compile(
    r"(home equity|refinance|personal loan|insurance quote|cash back|"
    r"credit card interest|avoid .{0,20}interest|0% intro apr|intro apr|"
    r"balance transfer|turn your .{0,40}into|best .{0,30}card|"
    r"αναχρηματοδότηση|προσωπικό δάνειο)",
    re.IGNORECASE,
)
# Χρήσιμες λέξεις που όμως εμφανίζονται και σε ειδήσεις — φιλτράρονται
# μόνο αν το θέμα δεν έχει σώμα κειμένου.
AD_SOFT = re.compile(
    r"(credit card|offer ends|πιστωτική κάρτα|δάνειο|προσφορά)",
    re.IGNORECASE,
)

# τίτλοι-«μανίκι» από nav/homepage (όχι ειδήσεις)
GENERIC_TITLES = {
    "euroleague basketball", "nba news", "nba.com", "imdb", "bbc news", "cnn",
    "latest news", "top stories", "news", "home", "sports", "culture",
}


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = text.replace("\u00a0", " ")
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\]\([^)]*\)", "", text)
    return re.sub(r"\s+", " ", text).strip()


def clean_title(title: str) -> str:
    t = normalize_text(title)
    for pattern in TITLE_NOISE:
        t = re.sub(pattern, "", t, flags=re.IGNORECASE)
    # hashtags και emoji δεν τυπώνονται
    t = re.sub(r"#\w+", "", t)
    t = EMOJI_RE.sub("", t)
    t = re.sub(r"\s{2,}", " ", t)
    return t.strip(" -–|·")


def tokens(title: str) -> set[str]:
    t = unicodedata.normalize("NFKD", title.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    words = re.findall(r"[a-zα-ω0-9]{3,}", t)
    return {w for w in words if w not in STOPWORDS}


def similarity(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def item_id(url: str, title: str) -> str:
    return hashlib.sha1(f"{url}|{title}".encode("utf-8")).hexdigest()[:12]


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


LAST_STATS: dict[str, int] = {"hard_ads": 0, "ad_like": 0, "total": 0}


def normalize(items: list[dict], *, now: datetime | None = None, window_h: int = FRESH_WINDOW_H) -> list[dict]:
    global LAST_STATS
    LAST_STATS = {"hard_ads": 0, "ad_like": 0, "total": 0}
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    start_local = (now.astimezone(TZ).replace(hour=0, minute=0, second=0, microsecond=0))
    start_utc = start_local.astimezone(timezone.utc)
    window_start = min(start_utc, now - timedelta(hours=window_h))
    video_start = now - timedelta(hours=96)

    cleaned: list[dict] = []
    seen_urls: set[str] = set()

    for raw in items:
        title = clean_title(raw.get("title") or "")
        if len(title) < 18 or len(title) > 220:
            continue
        if title.lower().strip(" .·") in GENERIC_TITLES:
            continue
        if JUNK_TITLE.search(title) or MATCH_LISTING.search(title):
            continue
        stale = STALE_TITLE.search(title)
        if stale and int(stale.group(1)) < datetime.now().year:
            continue
        if AD_HARD.search(title) or AD_OFFER.search(title) or AD_URL.search(raw.get("url", "")):
            LAST_STATS["hard_ads"] += 1
            continue
        if re.search(r"\bvs\.?\b", title, re.IGNORECASE) and re.search(r"\b20\d{2}\b", title):
            continue
        if title.count("|") >= 2:
            continue
        if not raw.get("url"):
            continue

        published = parse_iso(raw.get("published"))
        if published is None:
            published = now  # jina / gnews χωρίς ημερομηνία
        if published - now > timedelta(hours=6):
            continue
        cutoff = video_start if raw.get("kind") == "video" else window_start
        if published < cutoff:
            continue

        url = raw["url"].split("#")[0]
        if url in seen_urls:
            continue
        seen_urls.add(url)

        summary = normalize_text(raw.get("summary") or "")
        if summary.lower().startswith(title.lower()):
            summary = summary[len(title):].strip(" .-–—")
        if len(summary) < 28 or summary.lower().strip(" .") in {
            raw.get("domain", ""), raw.get("source_name", "").lower(), "nba.com", "imdb.com",
        }:
            summary = ""

        if AD_SOFT.search(title):
            LAST_STATS["ad_like"] += 1

        cleaned.append({
            "id": item_id(url, title),
            "title": title,
            "summary": summary[:520],
            "url": url,
            "source_id": raw["source_id"],
            "source_name": raw["source_name"],
            "domain": raw.get("domain", ""),
            "lang": raw.get("lang", "en"),
            "tier": int(raw.get("tier", 3)),
            "published": published.isoformat(),
            "local_time": published.astimezone(TZ).strftime("%H:%M"),
            "image": raw.get("image"),
            "categories": raw.get("categories") or [],
            "kind": raw.get("kind"),
            "video_id": raw.get("video_id"),
            "channel": raw.get("channel"),
            "paragraphs": raw.get("paragraphs") or [],
            "ad_like": bool(AD_SOFT.search(title)),
            "also": [],
        })

    # --- dedupe με ομοιότητα τίτλου -------------------------------------
    cleaned.sort(key=lambda x: (-x["tier"], x["published"]))
    merged: list[dict] = []
    for item in cleaned:
        tset = tokens(item["title"])
        match = None
        for cand in merged:
            if similarity(tset, cand["_tokens"]) >= 0.72:
                match = cand
                break
        if not match:
            item["_tokens"] = tset
            merged.append(item)
            continue

        if item["source_id"] not in match["also"] and item["source_id"] != match["source_id"]:
            match["also"].append(item["source_id"])
            match["source_names"] = match.get("source_names", []) + [item["source_name"]]
        if len(item["summary"]) > len(match["summary"]):
            match["summary"] = item["summary"]
        if not match.get("image") and item.get("image"):
            match["image"] = item["image"]
        if item["tier"] < match["tier"]:
            # Η πηγή αλλάζει ΜΑΖΙ με το URL — ποτέ «δανεική» ταμπέλα.
            match["tier"] = item["tier"]
            match["source_name"] = item["source_name"]
            match["source_id"] = item["source_id"]
            match["domain"] = item.get("domain", "")
            match["url"] = item["url"]
            match["id"] = item["id"]
            match["image"] = item.get("image") or match.get("image")
        if item["published"] < match["published"]:
            match["published"] = item["published"]
            match["local_time"] = item["local_time"]

    for m in merged:
        m.pop("_tokens", None)
        m["source_names"] = sorted(set(m.get("source_names", []) + [m["source_name"]]))
        m["source_count"] = 1 + len(m.get("also", []))
        _align_source(m)

    merged.sort(key=lambda x: x["published"], reverse=True)
    LAST_STATS["total"] = len(merged)
    return merged


KNOWN_BY_HOST = {s["domain"].replace("www.", ""): s["name"] for s in SOURCES}
KNOWN_BY_HOST.update({
    "bbc.co.uk": "BBC News",
    "bbc.com": "BBC News",
    "cnn.it": "CNN International",
    "cnn.com": "CNN International",
    "finance.yahoo.com": "Yahoo Finance",
    "gamespot.com": "GameSpot",
    "imdb.com": "IMDb",
    "nba.com": "NBA",
    "euroleaguebasketball.net": "EuroLeague",
})
KNOWN_NAMES = {s["name"] for s in SOURCES}

KNOWN_ID_BY_HOST = {s["domain"].replace("www.", ""): s["id"] for s in SOURCES}
KNOWN_ID_BY_HOST.update({
    "bbc.co.uk": "bbc",
    "bbc.com": "bbc",
    "cnn.it": "cnn",
    "cnn.com": "cnn",
    "finance.yahoo.com": "yahoo",
    "gamespot.com": "gamespot",
    "imdb.com": "imdb",
    "nba.com": "nba",
    "euroleaguebasketball.net": "euroleague",
})


def host_owner(host: str) -> str | None:
    host = (host or "").lower().replace("www.", "")
    for known_host, name in KNOWN_BY_HOST.items():
        if host == known_host or host.endswith("." + known_host):
            return name
    return None


def host_source_id(host: str) -> str | None:
    host = (host or "").lower().replace("www.", "")
    for known_host, source_id in KNOWN_ID_BY_HOST.items():
        if host == known_host or host.endswith("." + known_host):
            return source_id
    return None


def _align_source(item: dict) -> None:
    """Αν το URL ανήκει σε άλλη γνωστή πηγή, διορθώνεται η ταμπέλα."""
    try:
        host = urlsplit(item.get("url", "")).netloc.lower().replace("www.", "")
    except Exception:
        return
    if not host:
        return

    domain = (item.get("domain") or "").lower().replace("www.", "")
    if domain and (host == domain or host.endswith("." + domain)):
        return

    owner = host_owner(host)
    if owner and item.get("source_name") in KNOWN_NAMES and owner != item["source_name"]:
        item["source_name"] = owner
        item["source_names"] = [owner] + [
            n for n in item.get("source_names", []) if n != owner
        ]
        owner_id = host_source_id(host)
        if owner_id:
            item["source_id"] = owner_id
        item["domain"] = host
        item["source_aligned"] = True


def group_by_source(items: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for it in items:
        counts[it["source_name"]] = counts.get(it["source_name"], 0) + 1
    return counts
