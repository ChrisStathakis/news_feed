# -*- coding: utf-8 -*-
"""Σύνθεση HTML και εκτύπωση σε PDF μέσω headless Chrome."""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
import tempfile
from datetime import date, datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

import settings
from config import (
    EDITION_NAME,
    EDITION_NAME_EN,
    OUTPUT_DIR,
    TEMPLATES_DIR,
    TZ,
)
from collect import CHROME_CANDIDATES

log = logging.getLogger("build")

WEEKDAYS = ["Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή"]
MONTHS = ["Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου", "Μαΐου", "Ιουνίου",
          "Ιουλίου", "Αυγούστου", "Σεπτεμβρίου", "Οκτωβρίου", "Νοεμβρίου", "Δεκεμβρίου"]
MONTHS_SHORT = ["ΙΑΝ", "ΦΕΒ", "ΜΑΡ", "ΑΠΡ", "ΜΑΪ", "ΙΟΥΝ", "ΙΟΥΛ", "ΑΥΓ", "ΣΕΠ", "ΟΚΤ", "ΝΟΕ", "ΔΕΚ"]

ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]


def greek_date(d: date) -> str:
    return f"{WEEKDAYS[d.weekday()]} {d.day} {MONTHS[d.month - 1]} {d.year}"


def edition_number(d: date) -> int:
    return (d - date(2026, 1, 1)).days + 1


def _find_chrome() -> str | None:
    for path in CHROME_CANDIDATES:
        if Path(path).exists():
            return path
    return shutil.which("chrome") or shutil.which("msedge")


def make_qr(url: str, dest: Path) -> str | None:
    """Μικρό QR για βίντεο/άρθρα. Επιστρέφει το όνομα αρχείου."""
    try:
        import qrcode
        from qrcode.constants import ERROR_CORRECT_L
    except ImportError:
        return None
    try:
        qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_L,
                           box_size=4, border=1)
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color=(34, 29, 23), back_color=(241, 235, 221))
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest)
        return dest.name
    except Exception as e:  # noqa: BLE001
        log.debug("QR απέτυχε %s: %s", url, e)
        return None


def render(payload: dict, out_dir: Path) -> Path:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )

    def truncate_words(value: str, count: int = 40) -> str:
        words = (value or "").split()
        return " ".join(words[:count]) + ("…" if len(words) > count else "")

    env.filters["truncate_words"] = truncate_words

    css = (TEMPLATES_DIR / "styles.css").read_text(encoding="utf-8")

    # θέμα από settings.json → CSS variables
    theme = settings.get("theme", {}) or {}
    css_map = {
        "paper": "--paper",
        "paper_deep": "--paper-deep",
        "ink": "--ink",
        "ink_soft": "--ink-soft",
        "accent": "--red",
        "navy": "--navy",
        "serif": "--serif",
        "mono": "--mono",
    }
    overrides = [
        f"{css_map[key]}:{value}"
        for key, value in theme.items()
        if key in css_map and value
    ]
    # μέγεθος γραμματοσειρών
    try:
        scale = float(theme.get("font_scale", 1.0))
    except (TypeError, ValueError):
        scale = 1.0
    scale = max(0.85, min(1.25, scale))
    overrides.append(f"--fs:{scale}")

    if overrides:
        css += "\n:root{" + ";".join(overrides) + "}\n"

    template = env.get_template("newspaper.html.j2")
    html = template.render(**payload, css=css)

    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / f"efimerida-{payload['date_iso']}.html"
    html_path.write_text(html, encoding="utf-8")
    return html_path


def to_pdf(html_path: Path, pdf_path: Path, *, timeout: int = 180) -> Path | None:
    exe = _find_chrome()
    if not exe:
        log.error("Δεν βρέθηκε Chrome/Edge για εκτύπωση PDF")
        return None

    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    if pdf_path.exists():
        pdf_path.unlink()

    with tempfile.TemporaryDirectory(prefix="hmerisia-pdf-") as tmp:
        cmd = [
            exe, "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
            "--no-pdf-header-footer", "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=10000", "--font-render-hinting=none",
            f"--user-data-dir={tmp}",
            f"--print-to-pdf={pdf_path}",
            html_path.resolve().as_uri(),
        ]
        try:
            subprocess.run(cmd, capture_output=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            log.error("Το Chrome δεν ολοκλήρωσε το PDF σε %s δευτ.", timeout)
            return None

    if not pdf_path.exists() or pdf_path.stat().st_size < 20_000:
        log.error("Το PDF δεν δημιουργήθηκε σωστά (%s)", pdf_path)
        return None
    return pdf_path


def screenshot(html_path: Path, png_path: Path, *, width: int = 1240) -> Path | None:
    exe = _find_chrome()
    if not exe:
        return None
    with tempfile.TemporaryDirectory(prefix="hmerisia-shot-") as tmp:
        cmd = [
            exe, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
            f"--user-data-dir={tmp}", f"--window-size={width},1754",
            "--virtual-time-budget=6000", f"--screenshot={png_path}",
            html_path.resolve().as_uri(),
        ]
        try:
            subprocess.run(cmd, capture_output=True, timeout=90)
        except subprocess.TimeoutExpired:
            return None
    return png_path if png_path.exists() else None


def display_item(item: dict, images: dict[str, dict], *, qr: dict[str, str] | None = None) -> dict:
    """Προετοιμάζει τα πεδία που βλέπει το template."""
    item = dict(item)
    media = images.get(item["id"]) or {}
    item["img"] = f"assets/img/{media['s']}" if media.get("s") else None
    item["img_large"] = f"assets/img/{media['l']}" if media.get("l") else None
    item["title_en"] = (item.get("title", "")
                        if item.get("title_lang") == "el" and item.get("lang") != "el"
                        else "")
    item["body"] = [p for p in (item.get("body_el") or "").split("\n\n") if p.strip()]
    item["source_count"] = int(item.get("source_count", 1))
    item["source_names"] = item.get("source_names") or [item["source_name"]]
    item["badge"] = "EN" if item.get("title_lang") == "en" else ""
    item["qr"] = (qr or {}).get(item["id"])
    return item


def build_payload(edition: dict, *, today: date, stats: dict, sources: list[dict],
                  images: dict[str, dict], qr: dict[str, str] | None = None,
                  coverage: dict | None = None,
                  generated: datetime | None = None,
                  trends: list[dict] | None = None) -> dict:
    generated = generated or datetime.now(TZ)

    pages = []
    for page in edition["pages"]:
        pages.append({
            **{k: v for k, v in page.items() if k not in ("featured", "stories")},
            "featured": display_item(page["featured"], images, qr=qr) if page["featured"] else None,
            "stories": [display_item(x, images, qr=qr) for x in page["stories"]],
        })

    sections = []
    seen: set[str] = set()
    for page in pages:
        if page["key"] in seen:
            continue
        seen.add(page["key"])
        sections.append({"key": page["key"], "el": page["label_el"],
                         "en": page["label_en"], "num": page["num"]})

    numbers = {
        **edition["numbers"],
        "coverage": coverage or {},
    }

    trends = trends or []
    total_pages = len(trends) + 1 + len(pages) + 2
    index_entries = []
    for page in pages:
        entries = ([page["featured"]] if page["featured"] else []) + page["stories"]
        for item in entries:
            index_entries.append({
                "num": page["num"],
                "title": item["title_el"] or item["title"],
                "source": item["source_name"],
            })

    return {
        "edition_name": EDITION_NAME,
        "edition_name_en": EDITION_NAME_EN,
        "date_long": greek_date(today),
        "date_caps": f"{WEEKDAYS[today.weekday()].upper()} {today.day} {MONTHS_SHORT[today.month - 1]} {today.year}",
        "date_iso": today.isoformat(),
        "date_short": today.strftime("%d.%m.%Y"),
        "month_short": MONTHS_SHORT[today.month - 1],
        "day_num": today.day,
        "weekday_short": WEEKDAYS[today.weekday()][:3].upper(),
        "year": today.year,
        "issue": edition_number(today),
        "generated": generated.strftime("%H:%M"),
        "lead": display_item(edition["lead"], images, qr=qr) if edition["lead"] else None,
        "secondary": [display_item(x, images, qr=qr) for x in edition["secondary"]],
        "today_items": [display_item(x, images, qr=qr) for x in edition["today"]],
        "pages": pages,
        "trends": trends,
        "briefs": [display_item(x, images, qr=qr) for x in edition["briefs"]],
        "stats": stats,
        "numbers": numbers,
        "sources": sources,
        "sections": sections,
        "index": index_entries,
        "theme_preset": settings.get("theme.preset", "light"),
        "fs_large": float(settings.get("theme.font_scale", 1.0) or 1.0) >= 1.08,
        "total_pages": total_pages,
        "briefs_page": total_pages - 1,
        "sources_page": total_pages,
    }


def dump_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


__all__ = ["render", "to_pdf", "screenshot", "build_payload", "display_item", "dump_json",
           "greek_date", "edition_number", "make_qr", "OUTPUT_DIR"]
