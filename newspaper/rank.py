# -*- coding: utf-8 -*-
"""Βαθμολόγηση και σελιδοποίηση με μία ενότητα ανά πηγή."""
from __future__ import annotations

import math
from datetime import datetime, timezone

from config import (
    BRIEFS_PER_PAGE,
    COVER_SECONDARY,
    IMPACT_KEYWORDS,
    PAGE_LAYOUT,
    RECENCY_WINDOW_H,
    SCORE_WEIGHTS,
    WEIGHTS,
)


def _text(item: dict) -> str:
    return " ".join([
        item.get("title", ""),
        item.get("summary", ""),
        " ".join(item.get("categories") or []),
    ]).lower()


def classify(item: dict) -> str:
    """Η ενότητα είναι η πηγή που έφερε το θέμα."""
    return item.get("source_id") or "other"


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

    # Βάρος πηγής (settings.json → weights): domain για sites,
    # όνομα/handle για YouTube, ώστε κάθε κανάλι να έχει δικό του βάρος.
    if item.get("kind") == "video" or item.get("source_id", "").startswith("yt-"):
        raw_weight = (
            WEIGHTS.get(item.get("source_id") or "")
            or WEIGHTS.get(item.get("source_name") or "")
            or WEIGHTS.get(item.get("domain") or "")
            or 1.0
        )
    else:
        raw_weight = (
            WEIGHTS.get(item.get("domain") or "")
            or WEIGHTS.get(item.get("source_id") or "")
            or WEIGHTS.get(item.get("source_name") or "")
            or 1.0
        )
    try:
        weight = float(raw_weight)
    except (TypeError, ValueError):
        weight = 1.0
    total *= max(0.3, min(2.0, weight))
    return round(min(100.0, total), 1)


def _published_key(item: dict) -> float:
    """Νεότερα πρώτα σε ισοπαλία score/σειράς πηγής."""
    try:
        return -datetime.fromisoformat(item["published"]).timestamp()
    except Exception:
        return 0.0


def _order_map(sections: list[dict]) -> dict[str, int]:
    return {s["key"]: int(s.get("order", i)) for i, s in enumerate(sections)}


def rank(items: list[dict], now: datetime | None = None,
         order: dict[str, int] | None = None) -> list[dict]:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    order = order or {}
    for item in items:
        item["category"] = classify(item)
        item["score"] = importance(item, now)
    items.sort(key=lambda x: (
        -x["score"],
        order.get(x.get("source_id"), 9999),
        _published_key(x),
    ))
    return items


def _needed(pool: list[dict], kind: str) -> int:
    """Πόσες σελίδες αντέχει το υλικό της πηγής (χωρίς κενές τελευταίες)."""
    available = len(pool)
    if available <= 0:
        return 0
    if kind == "video":
        return max(1, math.ceil(available / PAGE_LAYOUT["video_page"]))
    if available <= PAGE_LAYOUT["first_page"]:
        return 1
    extra = available - PAGE_LAYOUT["first_page"]
    pages = 1 + math.ceil(extra / PAGE_LAYOUT["grid_page"])
    last = available - PAGE_LAYOUT["first_page"] - PAGE_LAYOUT["grid_page"] * (pages - 2)
    if pages > 1 and last < 4:
        pages -= 1
    return max(1, pages)


def build_edition(items: list[dict], section_plan: list[dict] | None = None,
                  *, start_num: int = 2) -> dict:
    """Σελιδοποιεί με μία ή περισσότερες σελίδες ανά πηγή.

    Το ``pages`` κάθε ενότητας είναι οδηγός από το βάρος της πηγής:
    κόβεται αν δεν υπάρχει αρκετό υλικό, αλλά δεν δανείζεται σε άλλες πηγές.
    """
    from sections import fallback_section

    section_list = [dict(s) for s in (section_plan or [])]
    known = {s["key"] for s in section_list}
    order = _order_map(section_list)

    ranked = sorted(items, key=lambda x: (
        -x["score"],
        order.get(x.get("source_id"), 9999),
        _published_key(x),
    ))

    used: set[str] = set()
    lead = next((x for x in ranked if x.get("image")), ranked[0] if ranked else None)
    if lead:
        lead["role"] = "lead"
        used.add(lead["id"])

    secondary = [x for x in ranked if x["id"] not in used][:COVER_SECONDARY]
    for item in secondary:
        item["role"] = "secondary"
        used.add(item["id"])

    pools: dict[str, list[dict]] = {}
    for item in ranked:
        if item["id"] in used:
            continue
        key = item.get("category") or item.get("source_id") or "other"
        if key not in known:
            if "other" not in known:
                section_list.append(fallback_section(len(section_list)))
                known.add("other")
                order["other"] = len(section_list) - 1
            key = "other"
        pools.setdefault(key, []).append(item)

    plan: list[tuple[dict, int]] = []
    for section in section_list:
        pool = pools.get(section["key"], [])
        if not pool:
            continue
        target = max(0, int(section.get("pages", 1)))
        if target <= 0:
            continue
        kind = section.get("kind", "grid")
        count = min(target, _needed(pool, kind))
        if count > 0:
            plan.append((section, count))

    pages: list[dict] = []
    num = start_num
    for section, count in plan:
        key = section["key"]
        label_el = section.get("label_el") or section.get("name") or key
        label_en = section.get("label_en") or ""
        kind = section.get("kind", "grid")
        pool = pools.get(key, [])

        for index in range(count):
            page = {
                "num": num,
                "key": key,
                "label_el": label_el,
                "label_en": label_en,
                "source_name": section.get("name") or label_el,
                "section_page": index + 1,
                "section_pages": count,
                "featured": None,
                "stories": [],
                "empty": False,
                "kind": "grid",
            }

            if kind == "video":
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
        "numbers": numbers(pages, items, briefs, section_list),
    }


def numbers(pages: list[dict], items: list[dict], briefs: list[dict],
            sections: list[dict]) -> dict:
    """Στοιχεία για τη σελίδα «ΤΟ ΦΥΛΛΟ ΜΕ ΑΡΙΘΜΟΥΣ» — ανά πηγή."""
    counts = {s["key"]: 0 for s in sections}
    for item in items:
        key = item.get("category") or item.get("source_id") or "other"
        counts[key] = counts.get(key, 0) + 1

    rows = [
        {
            "key": s["key"],
            "el": s.get("label_el") or s.get("name") or s["key"],
            "en": s.get("label_en") or "",
            "count": counts.get(s["key"], 0),
        }
        for s in sections
    ]

    sources = {item.get("source_name", "") for item in items if item.get("source_name")}
    published = sorted(item["published"] for item in items if item.get("published"))
    with_image = sum(1 for item in items if item.get("image"))
    video = sum(1 for page in pages if page.get("kind") == "video" for _ in page["stories"])

    return {
        "total": len(items),
        "counts": counts,
        "rows": rows,
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
