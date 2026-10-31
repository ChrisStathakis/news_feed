# -*- coding: utf-8 -*-
"""Διαγραφή παλαιών φύλλων και cache.

Ασφάλεια:
  * μόνο φάκελοι με μορφή YYYY-MM-DD μέσα στο output/
  * το σημερινό φύλλο δεν διαγράφεται ποτέ
  * dry-run πρώτα, πάντα
  * δεν αγγίζονται health.json, settings.json, sites.txt, translations/feeds
"""
from __future__ import annotations

import re
import shutil
from datetime import date, timedelta
from pathlib import Path

from config import CACHE_DIR, OUTPUT_DIR

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CACHE_DIRS = ("images_raw", "images_out", "articles")
KEEP_FILES = {"translations.json", "feeds.json", "collect.json"}
PDF_RE = re.compile(r"^efimerida-(\d{4}-\d{2}-\d{2})\.pdf$")


def pdf_dir() -> Path | None:
    """Ο φάκελος εξαγωγής PDF από τις ρυθμίσεις (ή None)."""
    try:
        import settings

        raw = str(settings.get("runtime.pdf_dir", "") or "").strip()
    except Exception:  # noqa: BLE001
        return None
    if not raw:
        return None
    path = Path(raw).expanduser()
    return path if path.is_dir() else None


def _size(path: Path) -> int:
    if path.is_file():
        try:
            return path.stat().st_size
        except OSError:
            return 0
    total = 0
    for child in path.rglob("*"):
        if child.is_file():
            try:
                total += child.stat().st_size
            except OSError:
                pass
    return total


def _mb(value: int) -> float:
    return round(value / 1_048_576, 1)


def scan(*, keep_days: int | None = None, before: date | None = None,
         include_cache: bool = False, include_logs: bool = True,
         today: date | None = None, pdf_folder: Path | None = None) -> dict:
    today = today or date.today()
    if before is not None:
        cutoff = before
    else:
        days = 7 if keep_days is None else max(0, int(keep_days))
        cutoff = today - timedelta(days=days)

    editions: list[dict] = []
    if OUTPUT_DIR.exists():
        for entry in sorted(OUTPUT_DIR.iterdir()):
            if not entry.is_dir() or not DATE_RE.match(entry.name):
                continue
            try:
                day = date.fromisoformat(entry.name)
            except ValueError:
                continue
            if day >= today:          # ποτέ το σημερινό
                continue
            if day >= cutoff:
                continue
            editions.append({
                "date": entry.name,
                "path": str(entry),
                "mb": _mb(_size(entry)),
            })

    logs: list[dict] = []
    if include_logs:
        log_dir = OUTPUT_DIR / "logs"
        if log_dir.exists():
            for log in sorted(log_dir.glob("run-*.log")):
                stem = log.stem.replace("run-", "")
                if not DATE_RE.match(stem):
                    continue
                try:
                    day = date.fromisoformat(stem)
                except ValueError:
                    continue
                if day >= today or day >= cutoff:
                    continue
                logs.append({"date": stem, "path": str(log), "mb": _mb(_size(log))})

    cache: list[dict] = []
    if include_cache and CACHE_DIR.exists():
        for name in CACHE_DIRS:
            target = CACHE_DIR / name
            if target.exists():
                cache.append({"name": name, "path": str(target), "mb": _mb(_size(target))})

    pdfs: list[dict] = []
    folder = pdf_folder if pdf_folder is not None else pdf_dir()
    if folder is not None and folder.is_dir():
        for pdf in sorted(folder.glob("efimerida-*.pdf")):
            match = PDF_RE.match(pdf.name)
            if not match:
                continue
            try:
                day = date.fromisoformat(match.group(1))
            except ValueError:
                continue
            if day >= today or day >= cutoff:
                continue
            pdfs.append({"date": match.group(1), "path": str(pdf), "mb": _mb(_size(pdf))})

    total_mb = _mb(
        sum(int(e["mb"] * 1_048_576) for e in editions)
        + sum(int(e["mb"] * 1_048_576) for e in logs)
        + sum(int(e["mb"] * 1_048_576) for e in cache)
        + sum(int(e["mb"] * 1_048_576) for e in pdfs)
    )

    return {
        "editions": editions,
        "logs": logs,
        "cache": cache,
        "pdfs": pdfs,
        "pdf_dir": str(folder) if folder is not None else "",
        "total_mb": total_mb,
        "cutoff": cutoff.isoformat(),
    }


def execute(plan: dict, *, include_cache: bool = True) -> dict:
    removed = {"editions": 0, "logs": 0, "cache": 0, "pdfs": 0, "mb": 0.0}

    for item in plan.get("editions", []):
        path = Path(item["path"])
        if not path.exists() or not DATE_RE.match(path.name):
            continue
        shutil.rmtree(path, ignore_errors=True)
        removed["editions"] += 1
        removed["mb"] += float(item.get("mb", 0))

    for item in plan.get("logs", []):
        path = Path(item["path"])
        if path.exists() and path.suffix == ".log":
            try:
                path.unlink()
                removed["logs"] += 1
            except OSError:
                pass

    for item in plan.get("pdfs", []):
        path = Path(item["path"])
        if path.exists() and PDF_RE.match(path.name):
            try:
                path.unlink()
                removed["pdfs"] += 1
                removed["mb"] += float(item.get("mb", 0))
            except OSError:
                pass

    if include_cache:
        for item in plan.get("cache", []):
            path = Path(item["path"])
            if not path.exists() or path.name not in CACHE_DIRS:
                continue
            for child in path.iterdir():
                if child.name in KEEP_FILES:
                    continue
                if child.is_dir():
                    shutil.rmtree(child, ignore_errors=True)
                else:
                    try:
                        child.unlink()
                    except OSError:
                        pass
            removed["cache"] += 1

    removed["mb"] = round(removed["mb"], 1)
    return removed


def delete_date(day: str, *, today: date | None = None) -> dict:
    """Διαγράφει ένα συγκεκριμένο φύλλο (ποτέ το σημερινό)."""
    today = today or date.today()
    if not DATE_RE.match(day):
        raise ValueError("invalid-date")
    if day >= today.isoformat():
        raise ValueError("today-protected")
    target = OUTPUT_DIR / day
    pdf_mb = 0.0
    folder = pdf_dir()
    if folder is not None:
        pdf = folder / f"efimerida-{day}.pdf"
        if pdf.is_file():
            pdf_mb = _mb(_size(pdf))
            try:
                pdf.unlink()
            except OSError:
                pdf_mb = 0.0
    if not target.exists() or not target.is_dir():
        return {"deleted": pdf_mb > 0, "date": day, "mb": pdf_mb}
    size = _mb(_size(target))
    shutil.rmtree(target, ignore_errors=True)
    return {"deleted": True, "date": day, "mb": round(size + pdf_mb, 1)}
