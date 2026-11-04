"""Generate parity fixtures from a real Python pipeline run.

This is a developer tool: the shipped app never runs Python. It freezes a
real items.json and records what the Python engine produces for it, so the
TypeScript port can be diffed against it.

Usage (from the repo root):
    python mobile/parity/make_fixtures.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "newspaper"))

import collect  # noqa: E402
import normalize as normalizer  # noqa: E402
import rank as ranker  # noqa: E402
import sections as section_tools  # noqa: E402

SOURCE = ROOT / "output" / "2026-10-30" / "data" / "items.json"
DEST = Path(__file__).resolve().parent / "fixtures"

RAW_KEYS = (
    "title", "summary", "url", "source_id", "source_name", "domain", "lang",
    "tier", "published", "image", "categories", "kind", "video_id", "channel",
    "paragraphs",
)


def main() -> None:
    items = json.loads(SOURCE.read_text(encoding="utf-8"))
    raw = [{key: item.get(key) for key in RAW_KEYS} for item in items[:90]]

    now = datetime(2026, 10, 30, 20, 0, tzinfo=timezone.utc)
    sources = collect.load_sources()
    plan = section_tools.resolve(sources)

    cleaned = normalizer.normalize(raw, now=now)
    ranked = ranker.rank([dict(item) for item in cleaned], now=now,
                         order={s["key"]: s["order"] for s in plan})
    edition = ranker.build_edition([dict(item) for item in ranked], plan)

    payload = {
        "now": now.isoformat(),
        "raw": raw,
        "sections": plan,
        "normalized": [
            {
                "id": item["id"],
                "title": item["title"],
                "summary": item["summary"],
                "source_id": item["source_id"],
                "source_name": item["source_name"],
                "source_count": item["source_count"],
                "source_names": item["source_names"],
                "published": item["published"],
                "local_time": item["local_time"],
                "tier": item["tier"],
                "ad_like": item["ad_like"],
            }
            for item in cleaned
        ],
        "ranked": [
            {"id": item["id"], "score": item["score"], "category": item["category"]}
            for item in ranked
        ],
        "edition": {
            "lead": edition["lead"]["id"] if edition["lead"] else None,
            "secondary": [item["id"] for item in edition["secondary"]],
            "pages": [
                {
                    "num": page["num"],
                    "key": page["key"],
                    "kind": page["kind"],
                    "featured": page["featured"]["id"] if page["featured"] else None,
                    "stories": [item["id"] for item in page["stories"]],
                }
                for page in edition["pages"]
            ],
            "briefs": [item["id"] for item in edition["briefs"]],
            "today": [item["id"] for item in edition["today"]],
            "numbers": edition["numbers"],
        },
    }

    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / "parity.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote {DEST / 'parity.json'} "
          f"(raw={len(raw)}, normalized={len(cleaned)}, pages={len(edition['pages'])})")


if __name__ == "__main__":
    main()
