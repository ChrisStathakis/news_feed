# -*- coding: utf-8 -*-
"""Οπτικός έλεγχος: μετατροπή των σελίδων του PDF σε PNG.

Χρήση:
    python qa.py                    # τελευταίο φύλλο
    python qa.py --date 2026-10-29
    python qa.py --dpi 150
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from config import OUTPUT_DIR

try:
    import pymupdf as fitz
except ImportError:  # παλιότερη εγκατάσταση
    import fitz  # type: ignore


def latest_pdf() -> Path | None:
    candidates = sorted(OUTPUT_DIR.glob("*/efimerida-*.pdf"))
    return candidates[-1] if candidates else None


def main() -> int:
    parser = argparse.ArgumentParser(description="PNG προεπισκόπηση σελίδων PDF")
    parser.add_argument("--date", help="ημερομηνία φύλλου (YYYY-MM-DD)")
    parser.add_argument("--dpi", type=int, default=105)
    parser.add_argument("--pdf", help="διαδρομή PDF (παρακάμπτει το --date)")
    args = parser.parse_args()

    if args.pdf:
        pdf_path = Path(args.pdf)
    elif args.date:
        pdf_path = OUTPUT_DIR / args.date / f"efimerida-{args.date}.pdf"
    else:
        pdf_path = latest_pdf() or Path()

    if not pdf_path or not pdf_path.exists():
        print(f"Δεν βρέθηκε PDF: {pdf_path}")
        return 1

    out_dir = pdf_path.parent / "qa"
    out_dir.mkdir(parents=True, exist_ok=True)

    with fitz.open(pdf_path) as doc:
        count = doc.page_count
        for index, page in enumerate(doc, start=1):
            page.get_pixmap(dpi=args.dpi).save(out_dir / f"p{index}.png")

    print(f"{count} σελίδες → {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
