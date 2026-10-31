# -*- coding: utf-8 -*-
"""Κατηγοριοποίηση, βαθμολόγηση και σελιδοποίηση 20 σελίδων."""
from __future__ import annotations

import math
from datetime import datetime, timezone

from config import (
    BRIEFS_PER_PAGE,
    CATEGORIES,
    CATEGORY_KEYWORDS,
    CATEGORY_LABELS,
    COVER_SECONDARY,
    IMPACT_KEYWORDS,
    PAGE_LAYOUT,
    PAGE_MAP,
    RECENCY_WINDOW_H,
    SCORE_WEIGHTS,
    SOURCE_DEFAULT_CATEGORY,
    SPECIALIST_SOURCES,
    WEAK_KEYWORDS,
    WEIGHTS,
)


def _text(item: dict) -> str:
    return " ".join([
        item.get("title", ""),
        item.get("summary", ""),
        " ".join(item.get("categories") or []),
    ]).lower()


def classify(item: dict) -> str:
    """Επιστρέφει το key της κατηγορίας με τα περισσότερα hits."""
    if item.get("kind") == "video" or item.get("source_id", "").startswith("yt-"):
        return "video"

    text = _text(item)
    title = item.get("title", "").lower()
    scores: dict[str, float] = {key: 0.0 for key, _, _ in CATEGORIES}

    default = SOURCE_DEFAULT_CATEGORY.get(item.get("source_id"), "news")
    specialist = item.get("source_id") in SPECIALIST_SOURCES
    base = 6.0 if specialist else 2.0
    scores[default] += base

    for cat, words in CATEGORY_KEYWORDS.items():
        weak = set(WEAK_KEYWORDS.get(cat, []))
        for word in words:
            if word in weak:
                continue
            if word in title:
                scores[cat] += 3.5
            elif word in text:
                scores[cat] += 0.6
        for word in weak:
            if word in title:
                scores[cat] += 1.2
            elif word in text:
                scores[cat] += 0.25

    priority = ["politics", "sports", "economy", "tech", "culture", "news", "video"]
    best = max(scores, key=lambda k: (scores[k], -priority.index(k)))

    need = base + (2.5 if specialist else 1.0)
    if best != default and scores[best] < need:
        return default
    if scores[best] < 2.0:
        return default
    return best


def importance(item: dict, now: datetime) -> float:
    """Βαθμός 0–100."""
    published = datetime.fromisoformat(item["published"])
    age_h = max(0.0, (now - published).total_seconds() / 3600)
    recency = SCORE_WEIGHTS["recency"] * max(0.0, 1 - age_h / RECENCY_WINDOW_H)

    tier_pts = SCORE_WEIGHTS["tier"].get(int(item.get("tier", 3)), 10)
    coverage = min(SCORE_WEIGHTS["coverage"], 8 * (int(item.get("source_count", 1)) - 1))

    text = _text(item)
    hits = sum(1 for kw in IMPACT_KEYWORDS if kw in text)
    impact = min(SCORE_WEIGHTS["impact"], 4.0 * hits)

    exclusivity = 0.0
    if int(item.get("source_count", 1)) == 1:
        exclusivity = SCORE_WEIGHTS["exclusivity"] if int(item.get("tier", 3)) == 1 else 4.0

    total = recency + tier_pts + coverage + impact + exclusivity
    if item.get("image"):
        total += 4

    # Βάρος πηγής (settings.json → weights), κλειδί domain ή όνομα.
    weight = float(
        WEIGHTS.get(item.get("domain") or "")
        or WEIGHTS.get(item.get("source_name") or "")
        or 1.0
    )
    total *= max(0.3, min(2.0, weight))
    return round(min(100.0, total), 1)


def rank(items: list[dict], now: datetime | None = None) -> list[dict]:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    for item in items:
        item["category"] = classify(item)
        item["score"] = importance(item, now)
    items.sort(key=lambda x: (-x["score"], x["published"]))
    return items


def _allocate() -> list[list]:
    """PAGE_MAP + ανακατανομή σελίδων σε περίπτωση έλλειψης ύλης."""
    return [[key, count] for key, count in PAGE_MAP]


def build_edition(items: list[dict], *, pages_total: int = 20,
                  start_num: int = 2) -> dict:
    """Σελιδοποιεί σε σταθερό χάρτη 20 σελίδων."""
    ranked = sorted(items, key=lambda x: x["score"], reverse=True)

    used: set[str] = set()
    lead = next((x for x in ranked if x.get("image")), ranked[0] if ranked else None)
    if lead:
        lead["role"] = "lead"
        used.add(lead["id"])

    secondary = [x for x in ranked if x["id"] not in used][:COVER_SECONDARY]
    for item in secondary:
        item["role"] = "secondary"
        used.add(item["id"])

    pools: dict[str, list[dict]] = {key: [] for key, _, _ in CATEGORIES}
    for item in ranked:
        if item["id"] in used:
            continue
        pools.setdefault(item["category"], []).append(item)

    plan = [[key, count] for key, count in PAGE_MAP
            if not (key == "video" and not pools.get("video"))]
    if not any(entry[0] == "video" for entry in plan):
        # χωρίς κανάλια: οι σελίδες των βίντεο πάνε στις Ειδήσεις
        plan[0][1] += sum(count for key, count in PAGE_MAP if key == "video")

    def capacity(entry) -> int:
        key, count = entry
        if key == "video":
            return PAGE_LAYOUT["video_page"] * count
        return PAGE_LAYOUT["first_page"] + PAGE_LAYOUT["grid_page"] * (count - 1)

    def needed(key: str) -> int:
        available = len(pools.get(key, []))
        if key == "video":
            return max(1, math.ceil(available / PAGE_LAYOUT["video_page"]))
        if available <= PAGE_LAYOUT["first_page"]:
            return 1
        extra = available - PAGE_LAYOUT["first_page"]
        pages = 1 + math.ceil(extra / PAGE_LAYOUT["grid_page"])
        # μια τελευταία σελίδα με 1–3 θέματα δεν αξίζει· τα θέματα μένουν εκτός
        last = available - PAGE_LAYOUT["first_page"] - PAGE_LAYOUT["grid_page"] * (pages - 2)
        if pages > 1 and last < 4:
            pages -= 1
        return pages

    # --- περισσότερες σελίδες από την ύλη → οι πλεονάζουσες πάνε αλλού ----
    surplus = 0
    for entry in plan:
        want = needed(entry[0])
        if entry[1] > want:
            surplus += entry[1] - want
            entry[1] = want

    while surplus > 0:
        best = None
        best_slack = 0
        for entry in plan:
            key = entry[0]
            if key == "video":
                continue
            slack = len(pools.get(key, [])) - capacity(entry)
            if slack > best_slack:
                best, best_slack = entry, slack
        if not best:
            break
        best[1] += 1
        surplus -= 1

    pages: list[dict] = []
    num = start_num
    for key, count in plan:
        label_el, label_en = CATEGORY_LABELS[key]
        pool = pools.get(key, [])

        for index in range(count):
            page = {
                "num": num,
                "key": key,
                "label_el": label_el,
                "label_en": label_en,
                "section_page": index + 1,
                "section_pages": count,
                "featured": None,
                "stories": [],
                "empty": False,
                "kind": "grid",
            }

            if key == "video":
                page["kind"] = "video"
                page["stories"] = pool[: PAGE_LAYOUT["video_page"]]
                del pool[: PAGE_LAYOUT["video_page"]]
                for item in page["stories"]:
                    item.setdefault("role", "video")
                page["empty"] = not page["stories"]
            elif index == 0:
                page["kind"] = "first"
                if pool:
                    featured = pool.pop(0)
                    featured["role"] = "featured"
                    page["featured"] = featured
                    take = PAGE_LAYOUT["first_page"] - 1
                    page["stories"] = pool[:take]
                    del pool[:take]
                page["empty"] = page["featured"] is None
            else:
                page["kind"] = "grid"
                page["stories"] = pool[: PAGE_LAYOUT["grid_page"]]
                del pool[: PAGE_LAYOUT["grid_page"]]
                page["empty"] = not page["stories"]

            for item in page["stories"]:
                item.setdefault("role", "story")
            pages.append(page)
            num += 1

    # --- σύντομα --------------------------------------------------------
    used.update(x["id"] for page in pages for x in page["stories"])
    for page in pages:
        if page["featured"]:
            used.add(page["featured"]["id"])

    briefs = [x for x in ranked if x["id"] not in used and x.get("kind") != "video"][:BRIEFS_PER_PAGE]
    for item in briefs:
        item["role"] = "brief"

    today = [x for x in ranked if x.get("kind") != "video"][:5]

    return {
        "lead": lead,
        "secondary": secondary,
        "pages": pages,
        "briefs": briefs,
        "today": today,
        "numbers": numbers(pages, items, briefs),
    }


def numbers(pages: list[dict], items: list[dict], briefs: list[dict]) -> dict:
    """Στοιχεία για τη σελίδα «ΤΟ ΦΥΛΛΟ ΜΕ ΑΡΙΘΜΟΥΣ»."""
    counts = {key: 0 for key, _, _ in CATEGORIES}
    for item in items:
        counts[item.get("category", "news")] = counts.get(item.get("category", "news"), 0) + 1

    sources = {item.get("source_name", "") for item in items if item.get("source_name")}
    published = sorted(item["published"] for item in items if item.get("published"))
    with_image = sum(1 for item in items if item.get("image"))
    video = sum(1 for page in pages if page["key"] == "video" for _ in page["stories"])

    return {
        "total": len(items),
        "counts": counts,
        "sources": len(sources),
        "first_time": published[0][11:16] if published else "—",
        "last_time": published[-1][11:16] if published else "—",
        "with_image": with_image,
        "image_ratio": round(100 * with_image / len(items)) if items else 0,
        "video": video,
        "briefs": len(briefs),
        "avg_score": round(sum(i["score"] for i in items) / len(items), 1) if items else 0,
    }


def stats(edition: dict, items: list[dict]) -> dict:
    pages_filled = sum(1 for p in edition["pages"] if not p["empty"])
    return {
        "total_items": len(items),
        "sections_filled": pages_filled,
        "sections_total": len(edition["pages"]),
        "avg_score": round(sum(x["score"] for x in items) / len(items), 1) if items else 0,
        "lead_score": edition["lead"]["score"] if edition.get("lead") else 0,
    }
