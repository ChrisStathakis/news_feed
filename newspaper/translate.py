# -*- coding: utf-8 -*-
"""Μετάφραση en→el με cache, chunking και γλωσσικό έλεγχο.

Κανόνας: αν το αποτέλεσμα δεν είναι καθαρά ελληνικό, δοκιμάζεται άλλος
πάροχος· αν αποτύχει ξανά, το θέμα πέφτει στο πρωτότυπο (ποτέ μισομετάφραση).
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import threading
import time

import requests

from config import CACHE_DIR, LANGUAGE
import lang

log = logging.getLogger("translate")

CACHE_FILE = CACHE_DIR / "translations.json"
_lock = threading.Lock()
_cache: dict[str, str] | None = None

CHUNK_CHARS = 1400
PROVIDERS = ("google_dict", "google_gtx", "mymemory")


def _load() -> dict[str, str]:
    global _cache
    if _cache is None:
        if CACHE_FILE.exists():
            try:
                _cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            except Exception:
                _cache = {}
        else:
            _cache = {}
    return _cache


def _save() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CACHE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(_load(), ensure_ascii=False), encoding="utf-8")
    tmp.replace(CACHE_FILE)


def is_greek(text: str) -> bool:
    return lang.is_greek(text)


def _key(text: str, sl: str, tl: str) -> str:
    return hashlib.sha1(f"{sl}|{tl}|{text}".encode("utf-8")).hexdigest()


# ------------------------------------------------------------------ providers
def _google_dict_chrome(text: str, sl: str, tl: str) -> str | None:
    try:
        r = requests.get(
            "https://clients5.google.com/translate_a/t",
            params={"client": "dict-chrome-ex", "sl": sl, "tl": tl, "q": text},
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128"},
            timeout=25,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        if isinstance(data, list) and data and isinstance(data[0], str):
            return data[0]
        if isinstance(data, list) and data and isinstance(data[0], list):
            return "".join(part[0] for part in data[0] if part)
        return None
    except Exception:
        return None


def _google_gtx(text: str, sl: str, tl: str) -> str | None:
    try:
        r = requests.get(
            "https://translate.googleapis.com/translate_a/single",
            params={"client": "gtx", "sl": sl, "tl": tl, "dt": "t", "q": text},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=25,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        return "".join(seg[0] for seg in data[0] if seg and seg[0])
    except Exception:
        return None


def _mymemory(text: str, sl: str, tl: str) -> str | None:
    try:
        r = requests.get(
            "https://api.mymemory.translated.net/get",
            params={"q": text[:900], "langpair": f"{sl}|{tl}"},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=30,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        out = (data.get("responseData") or {}).get("translatedText") or ""
        if not out or data.get("responseStatus") not in (200, "200"):
            return None
        if "MYMEMORY WARNING" in out.upper():
            return None
        return out
    except Exception:
        return None


_PROVIDER_FUNCS = {
    "google_dict": _google_dict_chrome,
    "google_gtx": _google_gtx,
    "mymemory": _mymemory,
}


def _call_provider(name: str, text: str, sl: str, tl: str) -> str | None:
    result = _PROVIDER_FUNCS[name](text, sl, tl)
    if not result:
        return None
    result = re.sub(r"\s+", " ", result).strip()
    return result or None


# ------------------------------------------------------------------ core
def _translate_raw(text: str, sl: str, tl: str, *, attempts: int = 2) -> str | None:
    """Μετάφραση με εναλλαγή παρόχων· επιστρέφει ό,τι δώσει ο πρώτος."""
    cache = _load()
    key = _key(text, sl, tl)
    if key in cache:
        return cache[key]

    for attempt in range(attempts):
        for name in PROVIDERS[attempt % len(PROVIDERS):] + PROVIDERS[:attempt % len(PROVIDERS)]:
            out = _call_provider(name, text, sl, tl)
            if out:
                with _lock:
                    cache[key] = out
                    _save()
                return out
        time.sleep(1.0 * (attempt + 1))
    return None


def translate(text: str, sl: str = "en", tl: str = "el", *, attempts: int = 2) -> str:
    text = (text or "").strip()
    if not text or sl == tl or lang.is_greek(text):
        return text
    return _translate_raw(text, sl, tl, attempts=attempts) or text


def translate_checked(text: str, *, target: str = "el") -> tuple[str, bool]:
    """Επιστρέφει (κείμενο, ok). Αν δεν είναι καθαρό, γυρίζει το πρωτότυπο."""
    source = (text or "").strip()
    if not source:
        return "", True
    if target == "el" and lang.is_greek(source):
        return source, True
    if target == "en" and lang.is_english(source):
        return source, True

    seen: list[str] = []
    for _ in range(2):
        out = _translate_raw(source, "en", target, attempts=1)
        if out and out not in seen:
            seen.append(out)
            if lang.accept(out, target):
                return out, True

    # τελευταία ευκαιρία: το καλύτερο από τα δύο, μόνο αν είναι αποδεκτό
    for out in seen:
        if lang.accept(out, target):
            return out, True
    return source, False


# ------------------------------------------------------------------ chunks
def _split_chunks(text: str, limit: int = CHUNK_CHARS) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n{1,}", text) if p.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if len(paragraph) > limit:
            # σπάσιμο σε προτάσεις
            sentences = re.split(r"(?<=[.!?·])\s+", paragraph)
            for sentence in sentences:
                if len(current) + len(sentence) + 1 <= limit:
                    current = f"{current} {sentence}".strip()
                else:
                    if current:
                        chunks.append(current)
                    current = sentence[:limit]
            continue
        if len(current) + len(paragraph) + 1 <= limit:
            current = f"{current} {paragraph}".strip()
        else:
            if current:
                chunks.append(current)
            current = paragraph
    if current:
        chunks.append(current)
    return chunks or ([text[:limit]] if text else [])


def translate_long(text: str, *, target: str = "el") -> tuple[str, bool]:
    """Μετάφραση εκτενούς κειμένου ανά chunk· επιστρέφει (κείμενο, όλα_ok)."""
    text = (text or "").strip()
    if not text:
        return "", True
    if target == "el" and lang.is_greek(text):
        return text, True

    translated: list[str] = []
    ok = True
    for chunk in _split_chunks(text):
        out = None
        for _ in range(2):
            candidate = _translate_raw(chunk, "en", target, attempts=1)
            if candidate and lang.accept(candidate, target):
                out = candidate
                break
        if out:
            translated.append(out)
        else:
            ok = False
            translated.append(chunk)
    return "\n\n".join(translated), ok


# ------------------------------------------------------------------ items
def translate_item(item: dict, words: int = 240) -> dict:
    """Γεμίζει title_el / body_el και σημαίες γλώσσας."""
    title = (item.get("title") or "").strip()
    body = (item.get("body") or "").strip()
    source_is_greek = item.get("lang") == "el"
    translate_english = bool(LANGUAGE.get("translate_english", False))

    # Οι ελληνικές πηγές μένουν ελληνικά ακόμη κι αν περιέχουν ξένα ονόματα.
    if source_is_greek or lang.is_greek(title):
        item["title_el"] = title
        item["title_lang"] = "el"
        item["translated"] = False
        item["body_el"] = body
        item["body_lang"] = "el"
        item["fallback"] = False
        return item

    # Αγγλικά χωρίς μετάφραση (προεπιλογή): μένουν ως έχουν.
    if not translate_english:
        item["title_el"] = title
        item["title_lang"] = "en"
        item["translated"] = False
        item["body_el"] = body
        item["body_lang"] = "en"
        item["fallback"] = True
        return item

    else:
        title_el, ok = translate_checked(title)
        item["title_el"] = lang.clean_gloss(lang.strip_foreign_tag(title_el))
        item["title_lang"] = "el" if ok else "en"
        item["translated"] = ok

    if body:
        if source_is_greek or lang.is_greek(body):
            item["body_el"] = body
            item["body_lang"] = "el"
        else:
            body_el, ok = translate_long(body)
            item["body_el"] = body_el if ok else body
            item["body_lang"] = "el" if ok else "en"
    else:
        item["body_el"] = ""
        item["body_lang"] = item["title_lang"]

    item["fallback"] = item["title_lang"] != "el" and not lang.is_greek(title)

    # Ένα θέμα δεν ανακατεύει γλώσσες: αν ο τίτλος έμεινε αγγλικός,
    # και το σώμα μένει αγγλικό· αν ο τίτλος είναι ελληνικός, δεν
    # τυπώνεται αγγλικό σώμα.
    if item["title_lang"] == "en":
        item["body_el"] = body
        item["body_lang"] = "en"
    elif item.get("body_lang") != "el":
        item["body_el"] = ""
        item["body_lang"] = "el"

    return item


def translate_many(items: list[dict], workers: int = 6) -> dict:
    from concurrent.futures import ThreadPoolExecutor

    if not items:
        return {"items": 0, "fallback": 0}

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(translate_item, items))

    fallback = sum(1 for x in items if x.get("fallback"))
    return {"items": len(items), "fallback": fallback}
