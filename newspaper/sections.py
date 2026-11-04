# -*- coding: utf-8 -*-
"""Ενότητες φύλλου με βάση τις πηγές.

Κάθε ενεργή πηγή γίνεται δική της ενότητα. Η σειρά των πηγών (sites.txt)
είναι και η σειρά των ενοτήτων. Οι σελίδες που δικαιούται κάθε πηγή
βγαίνουν από το βάρος της (settings.json → weights):

    pages = max(1, round(weight))      weight 0.3–2.0

Το αποτέλεσμα είναι οδηγός: αν μια πηγή δεν έχει αρκετό υλικό, ο
σελιδοποιητής της δίνει λιγότερες σελίδες (ή καμία).
"""
from __future__ import annotations

import math

import settings


def target_pages(weight: float | int | str | None) -> int:
    """Προτεινόμενες σελίδες από το βάρος της πηγής (1 ή 2)."""
    try:
        value = float(weight)
    except (TypeError, ValueError):
        value = 1.0
    value = max(0.3, min(2.0, value))
    # Στρογγυλοποίηση μισού προς τα πάνω, ίδια συμπεριφορά με JS Math.round.
    return max(1, min(4, int(math.floor(value + 0.5))))


def source_weight(source: dict, weights: dict | None = None) -> float:
    """Βάρος πηγής: domain για sites, όνομα/handle για YouTube."""
    if weights is None:
        weights = settings.get("weights", {}) or {}
    if source.get("kind") == "youtube":
        keys = (
            source.get("id"),
            source.get("name"),
            source.get("domain"),
            source.get("site_url"),
            source.get("home"),
        )
    else:
        keys = (
            source.get("domain"),
            source.get("id"),
            source.get("name"),
            source.get("site_url"),
            source.get("home"),
        )
    for key in keys:
        if not key:
            continue
        try:
            return float(weights.get(key))
        except (TypeError, ValueError):
            continue
    return 1.0


def resolve(sources: list[dict], weights: dict | None = None) -> list[dict]:
    """Μετατρέπει τη λίστα πηγών σε λίστα ενοτήτων, με τη σειρά τους."""
    sections: list[dict] = []
    for index, source in enumerate(sources):
        name = (
            source.get("name")
            or source.get("domain")
            or source.get("home")
            or f"source-{index + 1}"
        )
        sections.append({
            "key": source.get("id") or f"source-{index + 1}",
            "source_id": source.get("id") or f"source-{index + 1}",
            "name": name,
            "label_el": name,
            "label_en": name,
            "pages": target_pages(source_weight(source, weights)),
            "kind": "video" if source.get("kind") == "youtube" else "grid",
            "order": index,
            "url": source.get("site_url") or source.get("home") or "",
            "domain": source.get("domain") or "",
        })
    return sections


def fallback_section(order: int = 9999) -> dict:
    """Ενότητα για θέματα που δεν ανήκουν σε γνωστή ενεργή πηγή."""
    return {
        "key": "other",
        "source_id": "other",
        "name": "Άλλα",
        "label_el": "ΑΛΛΑ",
        "label_en": "OTHER",
        "pages": 1,
        "kind": "grid",
        "order": order,
        "url": "",
        "domain": "",
    }


__all__ = ["resolve", "target_pages", "source_weight", "fallback_section"]
