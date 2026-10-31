# -*- coding: utf-8 -*-
"""Ρυθμίσεις για την εφημερίδα «Η Ημερήσια».

Οι τιμές έκδοσης (τίτλος, ενότητες, σελίδες, όρια, θέμα) έρχονται από
το settings.json μέσω του settings.py. Εδώ μένουν μόνο τα σταθερά
μονοπάτια και η γλωσσική/βαθμολογική λογική.
"""
from pathlib import Path
from zoneinfo import ZoneInfo

import settings

ROOT = settings.DATA_ROOT
APP_DIR = settings.BASE_DIR
NEWSPAPER_DIR = APP_DIR if settings.FROZEN else APP_DIR / "newspaper"
TEMPLATES_DIR = (APP_DIR / "templates") if settings.FROZEN else (NEWSPAPER_DIR / "templates")
OUTPUT_DIR = ROOT / "output"
CACHE_DIR = ROOT / "cache"
SITES_FILE = ROOT / "sites.txt"
STYLE_REF = APP_DIR / "image_2026-10-29_05-10-55.png"

TZ = ZoneInfo("Europe/Athens")

S = settings.load()

EDITION_NAME = S["edition"]["name"]
EDITION_NAME_EN = S["edition"]["name_en"]
EDITION_TAGLINE = S["edition"]["tagline"]

# ---------------------------------------------------------------- κατηγορίες
# Σταθερή σειρά εμφάνισης. Οι σελίδες ανά ενότητα ορίζονται στο settings.json.
CATEGORIES = [(s["key"], s["el"], s["en"]) for s in S["sections"]]
CATEGORY_LABELS = {k: (el, en) for k, el, en in CATEGORIES}

PAGE_MAP = [(s["key"], int(s.get("pages", 1))) for s in S["sections"]]
TOTAL_PAGES = settings.total_pages(S)
COVER_SECONDARY = int(S["layout"]["cover_secondary"])
BRIEFS_PER_PAGE = int(S["layout"]["briefs_per_page"])

PAGE_LAYOUT = {
    "lead": COVER_SECONDARY,
    "first_page": int(S["layout"]["first_page"]),
    "grid_page": int(S["layout"]["grid_page"]),
    "video_page": int(S["layout"]["video_page"]),
    "briefs": BRIEFS_PER_PAGE,
}

WORD_LIMITS = {k: int(v) for k, v in S["limits"].items()}

THEME = S["theme"]
LANGUAGE = S["language"]
WEIGHTS = S.get("weights", {}) or {}

# ---------------------------------------------------------------- trends
# Δημοφιλείς αναζητήσεις 24ώρου (Google Trends) στις δύο πρώτες σελίδες.
TRENDS = S.get("trends", {}) or {}
TRENDS_ENABLED = bool(TRENDS.get("enabled", True))
TRENDS_COUNTRY = str(TRENDS.get("country", "GR") or "GR").upper()
TRENDS_PER_PAGE = int(TRENDS.get("per_page", 10) or 10)

# ---------------------------------------------------------------- πηγές
# Το sites.txt είναι η «πηγή αλήθειας» για το ποια sites θέλουμε. Κάθε site
# αντιστοιχίζεται σε στρατηγική συλλογής. Αν προσθέσεις URL στο sites.txt που δεν
# υπάρχει εδώ, γίνεται αυτόματο discovery (RSS link / Google News fallback).
SOURCES = [
    {
        "id": "cnn_gr",
        "name": "CNN Greece",
        "domain": "cnn.gr",
        "lang": "el",
        "tier": 1,
        "category": "news",
        "home": "https://www.cnn.gr/",
        "feeds": [
            "https://www.cnn.gr/eidhseis?format=feed&type=rss",
        ],
    },
    {
        "id": "cnn",
        "name": "CNN International",
        "domain": "cnn.com",
        "lang": "en",
        "tier": 1,
        "category": "news",
        "home": "https://edition.cnn.com/",
        "feeds": [
            "http://rss.cnn.com/rss/edition.rss",
            "http://rss.cnn.com/rss/edition_world.rss",
            "http://rss.cnn.com/rss/edition_business.rss",
        ],
    },
    {
        "id": "bbc",
        "name": "BBC News",
        "domain": "bbc.com",
        "lang": "en",
        "tier": 1,
        "category": "news",
        "home": "https://www.bbc.com/news",
        "feeds": [
            "https://feeds.bbci.co.uk/news/rss.xml",
            "https://feeds.bbci.co.uk/news/world/rss.xml",
            "https://feeds.bbci.co.uk/news/business/rss.xml",
        ],
    },
    {
        "id": "yahoo",
        "name": "Yahoo Finance",
        "domain": "finance.yahoo.com",
        "lang": "en",
        "tier": 2,
        "category": "economy",
        "home": "https://finance.yahoo.com/",
        "feeds": [
            "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US",
            "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EIXIC&region=US&lang=en-US",
            "https://feeds.finance.yahoo.com/rss/2.0/headline?s=EURUSD%3DX&region=US&lang=en-US",
        ],
    },
    {
        "id": "gamespot",
        "name": "GameSpot",
        "domain": "gamespot.com",
        "lang": "en",
        "tier": 2,
        "category": "tech",
        "home": "https://www.gamespot.com/",
        "feeds": ["https://www.gamespot.com/feeds/news/"],
    },
    {
        "id": "nba",
        "name": "NBA",
        "domain": "nba.com",
        "lang": "en",
        "tier": 2,
        "category": "sports",
        "home": "https://www.nba.com/news",
        "jina": "https://r.jina.ai/https://www.nba.com/news",
        "gnews": "site:nba.com",
        "link_filter": r"^https://www\.nba\.com/(news|games|watch)/",
    },
    {
        "id": "euroleague",
        "name": "EuroLeague",
        "domain": "euroleaguebasketball.net",
        "lang": "en",
        "tier": 2,
        "category": "sports",
        "home": "https://www.euroleaguebasketball.net/euroleague/news/",
        "jina": "https://r.jina.ai/https://www.euroleaguebasketball.net/euroleague/news/",
        "gnews": "site:euroleaguebasketball.net",
        "link_filter": r"^https://www\.euroleaguebasketball\.net/",
    },
    {
        "id": "imdb",
        "name": "IMDb",
        "domain": "imdb.com",
        "lang": "en",
        "tier": 3,
        "category": "culture",
        "home": "https://www.imdb.com/news/",
        "jina": "https://r.jina.ai/https://www.imdb.com/news/",
        "gnews": "site:imdb.com",
        "link_filter": r"^https?://(?!www\.imdb\.com/(name|title|video|list|chart|tv|search|news/))",
    },
]

# ---------------------------------------------------------------- scoring
SCORE_WEIGHTS = {
    "recency": 30,      # γραμμικά από 30 → 0 σε 36 ώρες
    "tier": {1: 20, 2: 14, 3: 10},
    "coverage": 20,     # +8 ανά επιπλέον πηγή που έχει την ίδια είδηση
    "impact": 20,       # λέξεις-κλειδιά αντίκτυπου
    "exclusivity": 10,
}
RECENCY_WINDOW_H = 36
FRESH_WINDOW_H = 30      # «σήμερα» = τελευταίες 30 ώρες
MIN_ITEMS_PER_SOURCE = 1

IMPACT_KEYWORDS = [
    "dead", "death", "dies", "killed", "war", "attack", "strike", "crisis",
    "election", "resign", "collapse", "record", "historic", "emergency",
    "inflation", "recession", "rate cut", "rate hike", "bankruptcy", "war",
    "championship", "final", "trade", "ban", "lawsuit", "verdict", "protest",
    "νεκρ", "θάνατος", "πόλεμος", "επίθεση", "κρίση", "εκλογ", "παραίτηση",
    "ρεκόρ", "πληθωρισμός", "ύφεση", "χρεοκοπία", "πρωτάθλημα", "τελικός",
    "απόφαση", "δικαστήριο", "διαμαρτυρία", "έκτακτο",
]

CATEGORY_KEYWORDS = {
    "news": [
        "world", "international", "breaking", "earthquake", "storm", "climate",
        "migration", "refugee", "united nations", "nato", "conflict",
        "κόσμος", "σεισμός", "κακοκαιρία", "κλίμα", "μετανάστ", "προσφυγ",
        "νατο", "σύγκρουση", "έκτακτο",
    ],
    "politics": [
        "election", "government", "minister", "parliament", "president",
        "senate", "congress", "prime minister", "policy", "sanctions", "war",
        "diplomat", "vote", "coalition", "trump", "putin", "eu ",
        "εκλογ", "κυβέρνηση", "υπουργ", "βουλή", "πρόεδρος", "πολιτικ",
        "ψήφισ", "διπλωματ", "κυρώσεις", "πόλεμος", "σύνοδος κορυφής",
        "τρουμπ", "πουτιν", "ευρωπαϊκή ένωση",
    ],
    "sports": [
        "nba", "euroleague", "basketball", "football", "soccer", "match",
        "game", "team", "player", "coach", "playoff", "final", "season",
        "trade", "draft", "injury", "olympiacos", "panathinaikos",
        "μπάσκετ", "ποδόσφαιρο", "αγώνας", "ομάδα", "παίκτης", "προπονητής",
        "τελικός", "πρωτάθλημα", "ολυμπιακός", "παναθηναϊκός", "τραυματισμ",
    ],
    "economy": [
        "market", "stocks", "shares", "inflation", "fed", "interest rate",
        "earnings", "revenue", "oil", "gold", "dollar", "euro", "gdp",
        "tariff", "economy", "investors", "wall street", "bitcoin", "crypto",
        "χρηματιστήριο", "οικονομία", "πληθωρισμός", "επιτόκια", "ευρώ",
        "πετρέλαιο", "αγορές", "επενδυτ", "τράπεζ", "ανάπτυξη", "α.επ",
    ],
    "tech": [
        "ai", "artificial intelligence", "apple", "google", "microsoft",
        "playstation", "xbox", "nintendo", "steam", "gaming", "game",
        "software", "chip", "openai", "tesla", "cyber", "hack", "review",
        "τεχνητή νοημοσύνη", "τεχνολογ", "κονσόλα", "παιχνίδι", "εφαρμογ",
        "κυβερνο", "ηλεκτρονικ",
    ],
    "culture": [
        "film", "movie", "actor", "actress", "series", "music", "album",
        "oscar", "emmy", "celebrity", "director", "netflix", "box office",
        "trailer", "premiere", "dies at",
        "ταινία", "ηθοποι", "σειρά", "μουσικ", "άλμπουμ", "όσκαρ",
        "σκηνοθέτ", "πρεμιέρα", "θάνατος",
    ],
}

# Λέξεις που εμφανίζονται σε πολλές κατηγορίες — μετράνε λιγότερο.
WEAK_KEYWORDS = {
    "sports": ["match", "game", "team", "player", "coach", "season", "final",
               "trade", "draft", "injury", "αγώνας", "ομάδα", "παίκτης",
               "σεζόν", "τελικός", "προπονητής"],
    "economy": ["market", "shares", "investors", "oil", "gold", "dollar",
                "αγορές", "επενδυτ", "τράπεζ"],
    "tech": ["game", "software", "review", "παιχνίδι", "εφαρμογ"],
    "culture": ["series", "film", "movie", "album", "σειρά", "μουσικ"],
    "politics": ["policy", "vote", "πολιτικ"],
    "news": ["world", "breaking", "κόσμος", "έκτακτο"],
}

# Προεπιλογή ανά πηγή, ώστε να μην πάνε όλα στο «news».
SOURCE_DEFAULT_CATEGORY = {s["id"]: s["category"] for s in SOURCES}

# Πηγές με σαφή θεματική ταυτότητα: μένουν στην κατηγορία τους
# εκτός αν οι λέξεις-κλειδιά άλλης κατηγορίας κερδίζουν καθαρά.
SPECIALIST_SOURCES = {"gamespot", "imdb", "yahoo", "nba", "euroleague"}

# Πόσα items ζητάμε συνολικά ανά κατηγορία πριν το κόψιμο της σελίδας.
CATEGORY_POOL = 12
