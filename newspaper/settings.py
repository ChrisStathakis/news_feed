# -*- coding: utf-8 -*-
"""Εξωτερικές ρυθμίσεις από το settings.json.

Σειρά προτεραιότητας:  defaults (εδώ)  ←  settings.json  ←  env.
Το config.py διαβάζει από εδώ, ώστε καμία ρύθμιση έκδοσης να μην
είναι θαμμένη στον κώδικα.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

FROZEN = bool(getattr(sys, "frozen", False))

# Όταν τρέχει ως .exe: τα πρότυπα είναι στο bundle (_MEIPASS),
# τα δεδομένα (settings, sites, cache, output) σε writable φάκελο.
if FROZEN:
    BASE_DIR = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    EXE_DIR = Path(sys.executable).resolve().parent
else:
    BASE_DIR = Path(__file__).resolve().parent.parent
    EXE_DIR = BASE_DIR

DATA_ROOT = Path(os.environ.get("HMERISIA_DATA") or EXE_DIR)
ROOT = BASE_DIR
SETTINGS_FILE = DATA_ROOT / "settings.json"

DEFAULTS: dict[str, Any] = {
    "edition": {
        "name": "Η ΗΜΕΡΗΣΙΑ",
        "name_en": "THE DAILY",
        "tagline": "Καθημερινή εφημερίδα · Επιμέλεια αρχείου",
    },
    "sections": [
        {"key": "news",     "el": "ΕΙΔΗΣΕΙΣ",            "en": "NEWS",          "pages": 3},
        {"key": "politics", "el": "ΠΟΛΙΤΙΚΗ",            "en": "POLITICS",      "pages": 2},
        {"key": "sports",   "el": "ΑΘΛΗΤΙΚΑ",            "en": "SPORTS",        "pages": 3},
        {"key": "economy",  "el": "ΟΙΚΟΝΟΜΙΑ",           "en": "ECONOMY",       "pages": 3},
        {"key": "tech",     "el": "ΤΕΧΝΟΛΟΓΙΑ & GAMING", "en": "TECH & GAMING", "pages": 2},
        {"key": "culture",  "el": "ΠΟΛΙΤΙΣΜΟΣ",          "en": "CULTURE",       "pages": 2},
        {"key": "video",    "el": "ΒΙΝΤΕΟ & ΚΑΝΑΛΙΑ",    "en": "VIDEO",         "pages": 2},
    ],
    "layout": {
        "cover_secondary": 3,
        "first_page": 7,
        "grid_page": 9,
        "video_page": 6,
        "briefs_per_page": 10,
    },
    "limits": {
        "lead": 900,
        "featured": 420,
        "story": 240,
        "brief": 90,
        "video": 190,
    },
    "language": {
        "target": "el",
        "fallback": "original",
        "translate_english": False,
    },
    "weights": {},
    "sources_disabled": [],
    "theme": {
        "preset": "light",
        "font_scale": 1.0,
        "photos": "sepia",
        "paper": "#f4efe1",
        "paper_deep": "#e9e0cb",
        "ink": "#1c1a17",
        "ink_soft": "#49423a",
        "accent": "#8f2b23",
        "navy": "#2c3b4c",
        "serif": '"Bookman Old Style","Bookman","Georgia","Palatino Linotype",Georgia,serif',
        "mono": '"Courier New",Courier,monospace',
    },
    "runtime": {
        "python": "",
        "pdf": False,
        "pdf_dir": "",
        "workers_articles": 8,
        "workers_images": 6,
        "workers_translate": 6,
    },
    "schedule": {
        "enabled": True,
        "at": "07:00",
    },
    "trends": {
        "enabled": True,
        "country": "GR",
        "per_page": 10,
    },
}

_cache: dict[str, Any] | None = None
_mtime: float | None = None


def _merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _merge(out[key], value)
        else:
            out[key] = value
    return out


def load(force: bool = False) -> dict[str, Any]:
    global _cache, _mtime

    if _cache is not None and not force:
        try:
            if SETTINGS_FILE.exists() and SETTINGS_FILE.stat().st_mtime != _mtime:
                pass
            else:
                return _cache
        except OSError:
            return _cache

    data: dict[str, Any] = {}
    if SETTINGS_FILE.exists():
        try:
            data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            _mtime = SETTINGS_FILE.stat().st_mtime
        except Exception:
            data = {}

    merged = _merge(DEFAULTS, data)

    # env overrides (χρήσιμο για CI / δοκιμές)
    if os.environ.get("HMERISIA_PAGES"):
        pass  # οι σελίδες ορίζονται ανά ενότητα
    if os.environ.get("HMERISIA_PDF") in ("1", "true", "yes"):
        merged["runtime"]["pdf"] = True
    if os.environ.get("HMERISIA_PYTHON"):
        merged["runtime"]["python"] = os.environ["HMERISIA_PYTHON"]

    _cache = merged
    return merged


def get(path: str, default: Any = None) -> Any:
    node: Any = load()
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            return default
        node = node[part]
    return node


def save(data: dict[str, Any]) -> dict[str, Any]:
    """Γράφει ολόκληρο το settings.json (merge με τα defaults)."""
    merged = _merge(DEFAULTS, data)
    SETTINGS_FILE.write_text(
        json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return load(force=True)


def ensure() -> Path:
    """Δημιουργεί settings.json με τις προεπιλογές αν λείπει."""
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    if not SETTINGS_FILE.exists():
        SETTINGS_FILE.write_text(
            json.dumps(DEFAULTS, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    return SETTINGS_FILE


def total_pages(data: dict[str, Any] | None = None) -> int:
    data = data or load()
    sections = data.get("sections") or []
    trends = data.get("trends") or {}
    extra = 2 if trends.get("enabled", True) else 0
    return 1 + sum(int(s.get("pages", 1)) for s in sections) + 2 + extra
