# -*- coding: utf-8 -*-
"""Γλωσσική επικύρωση: ελληνικά, αγγλικά ή μείξη.

Κανόνας: ένα κείμενο είναι «καθαρό» μόνο αν ανήκει σε μία γλώσσα.
Η μείξη (π.χ. μισομεταφρασμένος τίτλος) απορρίπτεται και το θέμα
πέφτει στο πρωτότυπο.
"""
from __future__ import annotations

import re

GREEK_RE = re.compile(r"[\u0370-\u03ff\u1f00-\u1fff]")
LATIN_RE = re.compile(r"[A-Za-z]")
TOKEN_RE = re.compile(r"[A-Za-zΑ-Ωα-ωΆ-Ώά-ώ0-9'’\-]+")

EL_THRESHOLD = 0.58
EN_THRESHOLD = 0.22
LONG_LATIN_RUN = 6

# ετικέτες πηγής που μπερδεύουν την ανίχνευση γλώσσας
FOREIGN_TAGS = re.compile(
    r"\s*\((?:Αποκλειστικό|Αποκλειστική|Αποκλειστικά|Exclusive|Video|VIDEO|"
    r"Photos|Φωτογραφίες|Live|LIVE|Update|Ενημέρωση)\)\s*",
    re.IGNORECASE,
)


def letters(text: str) -> tuple[int, int]:
    """(ελληνικά γράμματα, λατινικά γράμματα)."""
    greek = len(GREEK_RE.findall(text or ""))
    latin = len(LATIN_RE.findall(text or ""))
    return greek, latin


def greek_ratio(text: str) -> float:
    greek, latin = letters(text)
    total = greek + latin
    return greek / total if total else 0.0


def _runs(text: str) -> tuple[int, int]:
    """(μεγαλύτερη ακολουθία λατινικών λέξεων, μεγαλύτερη ελληνικών)."""
    best_latin = best_greek = cur_latin = cur_greek = 0
    for token in TOKEN_RE.findall(text or ""):
        has_greek = bool(GREEK_RE.search(token))
        has_latin = bool(LATIN_RE.search(token))
        if has_latin and not has_greek:
            cur_latin += 1
            cur_greek = 0
        elif has_greek and not has_latin:
            cur_greek += 1
            cur_latin = 0
        else:
            # αριθμοί / μικτά tokens δεν σπάνε την ακολουθία
            continue
        best_latin = max(best_latin, cur_latin)
        best_greek = max(best_greek, cur_greek)
    return best_latin, best_greek


def classify(text: str) -> str:
    """'el' | 'en' | 'mixed' | 'none'."""
    clean = (text or "").strip()
    if len(clean) < 2:
        return "none"

    greek, latin = letters(clean)
    if greek + latin < 3:
        return "none"

    ratio = greek / (greek + latin)
    latin_run, greek_run = _runs(clean)

    if ratio <= EN_THRESHOLD and greek_run < 2:
        return "en"
    if ratio >= EL_THRESHOLD and latin_run < LONG_LATIN_RUN:
        return "el"
    if ratio >= EL_THRESHOLD and latin_run >= LONG_LATIN_RUN:
        return "mixed"
    return "mixed"


def is_greek(text: str) -> bool:
    return classify(text) == "el"


def is_english(text: str) -> bool:
    return classify(text) == "en"


def strip_foreign_tag(text: str) -> str:
    """Αφαιρεί ετικέτες της «άλλης» γλώσσας από τον τίτλο."""
    return re.sub(r"\s{2,}", " ", FOREIGN_TAGS.sub(" ", text or "")).strip(" -–|·")


def clean_gloss(text: str) -> str:
    """Κόβει ουρές τύπου «Τίτλος | Σύντομη ελληνική απόδοση»."""
    text = (text or "").strip()
    if " | " not in text:
        return text
    head, tail = text.split(" | ", 1)
    if len(head.split()) >= 5 and len(tail.split()) <= 4:
        return head.strip()
    return text


def accept(text: str, target: str = "el") -> bool:
    """Το κείμενο είναι αποδεκτό για τη γλώσσα-στόχο;"""
    if target == "el":
        return classify(text) == "el"
    return classify(text) == "en"
