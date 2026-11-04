# -*- coding: utf-8 -*-
"""Η Ημερήσια — κεντρικός ορχηστρωτής (20 σελίδες).

Χρήση:
    python run.py --today
    python run.py --date 2026-10-28
    python run.py --check-sources
    python run.py --check-language
    python run.py --today --offline --no-images
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from config import (
    CACHE_DIR,
    OUTPUT_DIR,
    TZ,
    WORD_LIMITS,
)
import config
import articles as article_tools
import build as builder
import collect
import health as health_mod
import images as image_tools
import lang
import normalize as normalizer
import rank as ranker
import sections as section_tools
import settings
import translate as translator
import trends as trends_mod


def setup_logging(target: date, *, json_mode: bool = False) -> None:
    log_dir = OUTPUT_DIR / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    stream = sys.stderr if json_mode else sys.stdout
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-7s %(name)-9s %(message)s",
        datefmt="%H:%M:%S",
        handlers=[
            logging.StreamHandler(stream),
            logging.FileHandler(log_dir / f"run-{target.isoformat()}.log", encoding="utf-8"),
        ],
        force=True,
    )


_JSON_MODE = False


def emit(stage: str, percent: int, **extra) -> None:
    """Γραμμή JSON στο stdout για το Electron UI."""
    if not _JSON_MODE:
        return
    payload = {"stage": stage, "pct": percent, **extra}
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Η Ημερήσια — αυτόματη εφημερίδα σε PDF")
    p.add_argument("--today", action="store_true", help="φύλλο για σήμερα")
    p.add_argument("--date", help="ημερομηνία φύλλου (YYYY-MM-DD)")
    p.add_argument("--offline", action="store_true", help="χρήση cache, χωρίς δίκτυο")
    p.add_argument("--no-images", action="store_true", help="χωρίς φωτογραφίες")
    p.add_argument("--no-translate", action="store_true", help="χωρίς μετάφραση")
    p.add_argument("--translate-english", action="store_true",
                   help="μετάφραση και των αγγλικών (default: μένουν αγγλικά)")
    p.add_argument("--no-articles", action="store_true", help="χωρίς λήψη άρθρων")
    p.add_argument("--check-sources", action="store_true", help="διαγνωστικό πηγών")
    p.add_argument("--check-source", help="δοκιμή μίας πηγής (URL)")
    p.add_argument("--check-language", action="store_true", help="έλεγχος μείξης γλωσσών")
    p.add_argument("--check-quality", action="store_true", help="έλεγχος διαφημίσεων/ποιότητας")
    p.add_argument("--print-settings", action="store_true",
                   help="εκτύπωση των merged ρυθμίσεων σε JSON (για το UI)")
    p.add_argument("--cleanup", action="store_true", help="διαγραφή παλαιών φύλλων")
    p.add_argument("--keep", type=int, help="κράτα τις τελευταίες N ημέρες")
    p.add_argument("--before", help="διαγραφή φύλλων πριν από YYYY-MM-DD")
    p.add_argument("--cache", action="store_true", help="καθαρισμός cache εικόνων/άρθρων")
    p.add_argument("--dry-run", action="store_true", help="μόνο εκτύπωση του πλάνου")
    p.add_argument("--yes", action="store_true", help="επιβεβαίωση διαγραφής")
    p.add_argument("--delete-date", help="διαγραφή ενός φύλλου (YYYY-MM-DD)")
    p.add_argument("--pdf", action="store_true", help="εξαγωγή και PDF (προαιρετικό)")
    p.add_argument("--json-progress", action="store_true",
                   help="γραμμές JSON προόδου στο stdout (για το UI)")
    p.add_argument("--screenshot", action="store_true", help="PNG προεπισκόπηση")
    p.add_argument("--open", action="store_true", help="άνοιγμα του PDF στο τέλος")
    return p.parse_args()


def print_source_check(rows: list[dict]) -> None:
    print()
    print(f"{'ΠΗΓΗ':<22}{'ΜΕΘΟΔΟΣ':<11}{'ΘΕΜΑΤΑ':>7}{'ΔΕΥΤ.':>7}  {'STATUS':<9} ΣΗΜΕΙΩΣΗ")
    print("-" * 100)
    for r in rows:
        print(f"{r['site'][:21]:<22}{r['method'][:10]:<11}{r['items']:>7}{r['seconds']:>7}  "
              f"{r['status']:<9} {r['note'][:44]}")
    print("-" * 100)
    ok = sum(1 for r in rows if r["status"] == "ok")
    print(f"{ok}/{len(rows)} πηγές OK\n")


def check_language(path: Path) -> int:
    if not path.exists():
        print(f"Δεν βρέθηκε: {path}")
        return 1
    items = json.loads(path.read_text(encoding="utf-8"))
    mixed = [x for x in items if x.get("title_lang") == "en" or x.get("body_lang") == "en"]
    print(f"\nΘέματα: {len(items)} · στο πρωτότυπο: {len(mixed)}")
    for x in mixed[:40]:
        print(f"  [{x.get('title_lang')}/{x.get('body_lang')}] {x.get('source_name','')[:16]:<16} "
              f"{(x.get('title_el') or x.get('title',''))[:88]}")
    print()
    return 0


def gather_visible(edition: dict) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []

    def add(item):
        if item and item["id"] not in seen:
            seen.add(item["id"])
            out.append(item)

    add(edition.get("lead"))
    for item in edition.get("secondary", []):
        add(item)
    for page in edition.get("pages", []):
        add(page.get("featured"))
        for item in page.get("stories", []):
            add(item)
    for item in edition.get("briefs", []):
        add(item)
    return out


def _limit_words(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]).rstrip(",;:") + "…"


def build_bodies(items: list[dict]) -> None:
    """Κόβει το εκτενές απόσπασμα ανάλογα με τον ρόλο του θέματος."""
    from normalize import similarity, tokens

    for item in items:
        role = item.get("role", "story")
        limit = WORD_LIMITS.get(role, WORD_LIMITS["story"])
        paragraphs = [p for p in (item.get("paragraphs") or []) if p.strip()]

        if not paragraphs:
            summary = (item.get("summary") or "").strip()
            if summary:
                paragraphs = [summary]

        # standfirst που επαναλαμβάνει τον τίτλο δεν τυπώνεται δύο φορές
        title_tokens = tokens(item.get("title") or "")
        if title_tokens:
            paragraphs = [p for p in paragraphs
                          if similarity(tokens(p), title_tokens) < 0.62]
        if not paragraphs:
            paragraphs = []

        if item.get("kind") == "video" and paragraphs:
            source = paragraphs[0] if paragraphs[0] else item.get("summary", "")
            item["body"] = _limit_words(source, WORD_LIMITS["video"])
            continue

        chosen: list[str] = []
        used = 0
        for paragraph in paragraphs:
            words = paragraph.split()
            if used + len(words) <= limit:
                chosen.append(paragraph)
                used += len(words)
            else:
                remaining = limit - used
                if remaining >= 20:
                    chosen.append(" ".join(words[:remaining]).rstrip(",;:") + "…")
                break
        item["body"] = "\n\n".join(chosen)


def check_quality(path: Path) -> int:
    if not path.exists():
        print(f"Δεν βρέθηκε: {path}")
        return 1
    items = json.loads(path.read_text(encoding="utf-8"))
    from urllib.parse import urlsplit

    ads = [x for x in items if x.get("ad_like")]
    no_body = [x for x in items if (x.get("words") or 0) < 60]
    mismatched = []
    for x in items:
        host = urlsplit(x.get("url", "")).netloc.lower().replace("www.", "")
        owner = normalizer.host_owner(host)
        if owner and owner != x.get("source_name"):
            mismatched.append(x)

    print(f"\nΘέματα: {len(items)}")
    print(f"  ύποπτα διαφήμισης: {len(ads)}")
    print(f"  χωρίς σώμα:        {len(no_body)}")
    print(f"  source≠domain:     {len(mismatched)}")

    for label, rows in (("AD", ads[:15]), ("NO-BODY", no_body[:10]), ("MISMATCH", mismatched[:10])):
        for x in rows:
            print(f"  [{label}] {x.get('source_name','')[:16]:<16} {(x.get('title') or '')[:78]}")
    print()
    return 0


def run(args: argparse.Namespace) -> int:
    global _JSON_MODE
    _JSON_MODE = bool(getattr(args, "json_progress", False))

    target = date.today()
    if args.date:
        target = datetime.strptime(args.date, "%Y-%m-%d").date()
    setup_logging(target, json_mode=_JSON_MODE)
    settings.ensure()

    log = logging.getLogger("run")
    started = time.time()
    log.info("Η ΗΜΕΡΗΣΙΑ · φύλλο %s", target.isoformat())

    out_dir = OUTPUT_DIR / target.isoformat()
    data_dir = out_dir / "data"

    if args.print_settings:
        settings.ensure()
        print(json.dumps(settings.load(force=True), ensure_ascii=False))
        return 0

    # --- διαγραφή παλαιών φύλλων ----------------------------------------
    if args.delete_date or args.cleanup:
        import cleanup

        if args.delete_date:
            try:
                result = cleanup.delete_date(args.delete_date)
            except ValueError as exc:
                if _JSON_MODE:
                    emit("cleanup", 100, error=str(exc))
                else:
                    print(f"Δεν επιτρέπεται: {exc}")
                return 1
            if _JSON_MODE:
                emit("cleanup", 100, **result)
            else:
                print(f"Διαγράφηκε: {result['date']} ({result['mb']} MB)" if result["deleted"]
                      else f"Δεν βρέθηκε: {result['date']}")
            return 0

        before = None
        if args.before:
            try:
                before = datetime.strptime(args.before, "%Y-%m-%d").date()
            except ValueError:
                print("Μη έγκυρη ημερομηνία (YYYY-MM-DD).")
                return 1

        plan = cleanup.scan(keep_days=args.keep, before=before, include_cache=args.cache)
        if _JSON_MODE:
            emit("cleanup", 100, **plan)
        else:
            print(f"\nΘα διαγραφούν {len(plan['editions'])} φύλλα "
                  f"({plan['total_mb']} MB συνολικά, cache {'ναι' if args.cache else 'όχι'})")
            for entry in plan["editions"]:
                print(f"  {entry['date']}  {entry['mb']:>6} MB")
            for entry in plan["cache"]:
                print(f"  cache/{entry['name']}  {entry['mb']:>6} MB")
            for entry in plan["logs"]:
                print(f"  logs/{entry['date']}  {entry['mb']:>6} MB")
            if plan.get("pdfs"):
                print(f"  PDF ({plan.get('pdf_dir')}):")
                for entry in plan["pdfs"]:
                    print(f"    efimerida-{entry['date']}.pdf  {entry['mb']:>6} MB")

        if args.dry_run or not args.yes:
            if not _JSON_MODE:
                print("\nDry-run — δεν διαγράφηκε τίποτα. Πρόσθεσε --yes για εκτέλεση.")
            return 0

        removed = cleanup.execute(plan, include_cache=args.cache)
        if _JSON_MODE:
            emit("cleanup_done", 100, **removed)
        else:
            print(f"\n✓ Διαγράφηκαν {removed['editions']} φύλλα · "
                  f"{removed['mb']} MB · cache {removed['cache']} φάκελοι · "
                  f"PDF {removed.get('pdfs', 0)}")
        return 0

    if args.check_source:
        row = collect.probe_source(args.check_source)
        if _JSON_MODE:
            emit("check", 100, **row)
        else:
            print(f"\n{row['site']}  [{row['method']}]  {row['items']} θέματα  "
                  f"{row['status']}  {row['note']}\n")
        return 0

    if args.check_sources:
        rows = collect.check_sources()
        print_source_check(rows)
        builder.dump_json(data_dir / "sources_check.json", rows)
        return 0

    if args.check_language:
        return check_language(data_dir / "items.json")

    if args.check_quality:
        return check_quality(data_dir / "items.json")

    # 0. πηγές + ενότητες ------------------------------------------------
    sources = collect.load_sources()
    source_order = {s["id"]: i for i, s in enumerate(sources)}
    section_plan = section_tools.resolve(sources, config.WEIGHTS)
    estimated_pages = settings.total_pages(section_plan)
    log.info("Ενότητες: %s πηγές · budget %s σελίδες", len(section_plan), estimated_pages)
    emit("start", 0, date=target.isoformat(), pages=estimated_pages)

    # 1. συλλογή ---------------------------------------------------------
    t0 = time.time()
    emit("collect", 10)
    raw_items, report = collect.collect_all(offline=args.offline, sources=sources)
    health_data = health_mod.update(report)
    log.info("Συλλογή: %s ακατέργαστα θέματα σε %.1fs", len(raw_items), time.time() - t0)
    emit("collect", 25, items=len(raw_items))

    # 2. καθαρισμός + κατάταξη -------------------------------------------
    items = normalizer.normalize(raw_items)
    norm_stats = dict(normalizer.LAST_STATS)
    log.info("Μετά τον καθαρισμό/dedupe: %s θέματα · %s διαφημίσεις εκτός",
             len(items), norm_stats.get("hard_ads", 0))
    if not items:
        log.warning("Καμία είδηση για σήμερα — το φύλλο θα βγει χωρίς ενότητες πηγών")

    items = ranker.rank(items, order=source_order)

    # 2b. δημοφιλείς αναζητήσεις 24ώρου (Google Trends) -------------------
    trend_pages: list[dict] = []
    if config.TRENDS_ENABLED and not args.offline:
        t_trends = time.time()
        try:
            trend_pages = trends_mod.build_pages(
                out_dir,
                country=config.TRENDS_COUNTRY,
                per_page=config.TRENDS_PER_PAGE,
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("Google Trends: %s", exc)
            trend_pages = []
        if trend_pages:
            log.info("Trends: %s σελίδες · %s όροι σε %.1fs",
                     len(trend_pages),
                     sum(len(p["rows"]) for p in trend_pages),
                     time.time() - t_trends)

    # 3. γρήγορος εμπλουτισμός για επιλογή lead με φωτογραφία -------------
    if not args.offline:
        image_tools.enrich(items[:60], max_fetch=45)

    # 3b. κείμενο για τους κορυφαίους ΠΡΙΝ τη σελιδοποίηση (πύλη ποιότητας)
    filtered_ads = 0
    if not args.no_articles:
        emit("articles", 35)
        article_tools.attach(items[:70], workers=8)
        before = len(items)
        items = [x for x in items
                 if not (x.get("ad_like") and (x.get("words") or 0) < 120)]
        filtered_ads = before - len(items)
        if filtered_ads:
            log.info("Πύλη ποιότητας: %s διαφημίσεις/χορηγούμενα εκτός", filtered_ads)
        emit("articles", 42, filtered_ads=filtered_ads)

    edition = ranker.build_edition(items, section_plan,
                                   start_num=2 + len(trend_pages))
    planned_pages = 1 + len(trend_pages) + len(edition["pages"]) + 2
    log.info("Σελιδοποίηση: %s σελίδες · %s θέματα",
             planned_pages, len(gather_visible(edition)))
    emit("plan", 45, items=len(items), pages=planned_pages)

    visible = gather_visible(edition)

    # 4. άρθρα για όσα δεν έχουν ήδη κείμενο ------------------------------
    if not args.no_articles:
        t0 = time.time()
        article_tools.attach(visible, workers=8)
        ok = sum(1 for x in visible if (x.get("words") or 0) >= 60)
        log.info("Άρθρα: %s/%s με κείμενο σε %.1fs", ok, len(visible), time.time() - t0)
        build_bodies(visible)
        emit("articles", 50, ok=ok, total=len(visible))

    # 5. μετάφραση --------------------------------------------------------
    if args.translate_english:
        translator.LANGUAGE["translate_english"] = True

    if not args.no_translate:
        t0 = time.time()
        emit("translate", 55)
        result = translator.translate_many(visible)
        log.info("Μετάφραση: %s θέματα · %s στα αγγλικά σε %.1fs",
                 result["items"], result["fallback"], time.time() - t0)
        emit("translate", 68, fallback=result["fallback"])
    else:
        for item in visible:
            item["title_el"] = item["title"]
            item["title_lang"] = "el" if lang.is_greek(item["title"]) else "en"
            item["body_el"] = item.get("body") or ""
            item["body_lang"] = item["title_lang"]
            item["badge"] = ""

    # καθαρισμός μεταφρασμένων τίτλων
    for item in visible:
        item["title_el"] = re.sub(
            r"^(ΔΙΑΒΑΣΤΕ|ΔΕΙΤΕ|ΑΠΟΚΛΕΙΣΤΙΚΟ|ΒΙΝΤΕΟ|ΖΩΝΤΑΝΑ|READ|WATCH|VIDEO|LIVE)\s*[:·-]\s*",
            "", item.get("title_el") or "", flags=re.IGNORECASE,
        ).strip()

    # ό,τι ξέφυγε από τον καθαρισμό (cookie/consent) κόβεται και μετά τη μετάφραση
    for item in visible:
        body = item.get("body_el") or ""
        if body:
            body = normalizer.EMOJI_RE.sub("", body)
            body = re.sub(r"#\w+", "", body)
            parts = [p for p in body.split("\n\n")
                     if not article_tools.CONSENT.search(p)]
            item["body_el"] = "\n\n".join(parts)

    # 6. εικόνες + QR -----------------------------------------------------
    images_dir = out_dir / "assets" / "img"
    images_map: dict[str, dict] = {}
    qr_map: dict[str, str] = {}

    if not args.no_images:
        t0 = time.time()
        emit("images", 70)
        image_tools.configure(config.THEME)
        images_map = image_tools.prepare_many(visible, images_dir, workers=6)
        log.info("Εικόνες: %s/%s σε %.1fs", len(images_map), len(visible), time.time() - t0)
    emit("images", 82, images=len(images_map))

    for item in visible:
        if item.get("kind") == "video":
            name = builder.make_qr(item["url"], out_dir / "assets" / "qr" / f"{item['id']}.png")
            if name:
                qr_map[item["id"]] = name

    # 7. σύνθεση ----------------------------------------------------------
    stats = ranker.stats(edition, items)
    stats["sources_ok"] = sum(
        1 for s in sources
        if (health_data.get(s["name"]) or {}).get("status") == "ok"
    )
    coverage = image_tools.coverage(visible, images_map)

    payload = builder.build_payload(
        edition,
        today=target,
        stats=stats,
        sources=health_mod.status_rows(order=[s["name"] for s in sources]),
        images=images_map,
        qr=qr_map,
        coverage=coverage,
        generated=datetime.now(TZ),
        trends=trend_pages,
    )

    html_path = builder.render(payload, out_dir)
    log.info("HTML: %s", html_path)
    emit("render", 92, html=str(html_path))

    pdf_name = f"efimerida-{target.isoformat()}.pdf"
    pdf_path = out_dir / pdf_name
    custom_dir = str(settings.get("runtime.pdf_dir", "") or "").strip()
    if custom_dir:
        try:
            candidate = Path(custom_dir).expanduser()
            candidate.mkdir(parents=True, exist_ok=True)
            probe = candidate / f".write-test-{target.isoformat()}"
            probe.write_text("", encoding="utf-8")
            probe.unlink()
            pdf_path = candidate / pdf_name
        except OSError as exc:
            log.warning("Ο φάκελος PDF «%s» δεν είναι εγγράψιμος (%s) — το PDF πάει στο %s",
                        custom_dir, exc, out_dir)

    want_pdf = bool(args.pdf or settings.get("runtime.pdf", False))
    result = builder.to_pdf(html_path, pdf_path) if want_pdf else None
    if want_pdf:
        emit("pdf", 97, pdf=str(pdf_path) if result else "")

    builder.dump_json(data_dir / "items.json", items)
    builder.dump_json(data_dir / "edition.json", {
        "date": target.isoformat(),
        "generated": datetime.now(timezone.utc).isoformat(),
        "stats": stats,
        "coverage": coverage,
        "quality": {
            "ads_removed": norm_stats.get("hard_ads", 0),
            "ad_like": norm_stats.get("ad_like", 0),
            "filtered_ads": filtered_ads,
            "no_body": sum(1 for x in visible if (x.get("words") or 0) < 60),
        },
        "sources": report,
        "health": health_data,
        "lead": payload["lead"]["id"] if payload["lead"] else None,
        "total_pages": payload["total_pages"],
        "trends_pages": len(payload.get("trends") or []),
        "sections": [{"key": s["key"], "label": s["label_el"], "pages": s["pages"]}
                     for s in section_plan],
        "pages": [{"key": p["key"], "num": p["num"], "kind": p["kind"],
                   "featured": p["featured"]["id"] if p["featured"] else None,
                   "stories": [x["id"] for x in p["stories"]],
                   "empty": p["empty"]} for p in payload["pages"]],
    })

    if args.screenshot:
        png = out_dir / "preview.png"
        builder.screenshot(html_path, png)
        log.info("Preview: %s", png)

    elapsed = time.time() - started
    emit("done", 100, html=str(html_path), items=len(items),
         images=coverage["with_image"], seconds=round(elapsed, 1))

    if want_pdf and not result:
        log.error("Αποτυχία παραγωγής PDF")
        return 1

    if result:
        size_mb = result.stat().st_size / 1_048_576
        log.info("Ολοκληρώθηκε σε %.1fs · %.1f MB · %s", elapsed, size_mb, result)
        print(f"\n✓ {result}")
    else:
        log.info("Ολοκληρώθηκε σε %.1fs · %s", elapsed, html_path)
        print(f"\n✓ {html_path}")

    print(f"  φωτογραφίες: {coverage['with_image']}/{coverage['items']} ({coverage['percent']}%)")

    if args.open:
        import os
        target_path = result or html_path
        os.startfile(target_path)
    return 0


if __name__ == "__main__":
    sys.exit(run(parse_args()))

