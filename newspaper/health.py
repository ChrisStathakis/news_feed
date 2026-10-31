# -*- coding: utf-8 -*-
"""Κατάσταση πηγών: OK / DEGRADED / BROKEN, με ιστορικό."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

from config import CACHE_DIR, OUTPUT_DIR

log = logging.getLogger("health")

HEALTH_FILE = OUTPUT_DIR / "health.json"
QUARANTINE_HOURS = 24
BROKEN_AFTER = 3


def load() -> dict:
    if HEALTH_FILE.exists():
        try:
            return json.loads(HEALTH_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save(data: dict) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    HEALTH_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def update(report: dict[str, dict]) -> dict:
    """Ενημερώνει το health.json από το report της συλλογής."""
    data = load()
    now = datetime.now(timezone.utc)

    for name, info in report.items():
        entry = data.setdefault(name, {
            "status": "ok", "failures": 0, "last_ok": None,
            "last_method": None, "items": 0, "history": [],
        })
        count = int(info.get("count", 0))
        entry["items"] = count
        entry["last_method"] = info.get("method")

        if count > 0:
            entry["failures"] = 0
            entry["status"] = "ok" if count >= 3 else "degraded"
            entry["last_ok"] = now.isoformat()
        else:
            entry["failures"] = int(entry.get("failures", 0)) + 1
            entry["status"] = "broken" if entry["failures"] >= BROKEN_AFTER else "degraded"

        entry["history"] = (entry.get("history") or [])[-6:] + [
            {"at": now.isoformat(), "items": count, "method": info.get("method")}
        ]

    save(data)
    for name, entry in data.items():
        if entry["status"] == "broken":
            log.warning("Πηγή σε καραντίνα: %s (%s αποτυχίες)", name, entry["failures"])
    return data


def is_quarantined(entry: dict) -> bool:
    if entry.get("status") != "broken" or not entry.get("last_ok"):
        return False
    last_ok = datetime.fromisoformat(entry["last_ok"])
    return datetime.now(timezone.utc) - last_ok < timedelta(hours=QUARANTINE_HOURS)


def status_rows(items_by_source: dict[str, int] | None = None) -> list[dict]:
    """Λίστα για το πλαίσιο «ΚΑΤΑΣΤΑΣΗ ΠΗΓΩΝ» του PDF."""
    data = load()
    rows = []
    for name, entry in sorted(data.items(), key=lambda kv: (-kv[1].get("items", 0), kv[0])):
        status = entry.get("status", "ok")
        if status == "broken" and not is_quarantined(entry):
            status = "degraded"
        last_ok = entry.get("last_ok")
        rows.append({
            "name": name,
            "status": status,
            "items": entry.get("items", 0),
            "method": (entry.get("last_method") or "—").upper(),
            "last_ok": datetime.fromisoformat(last_ok).astimezone().strftime("%d/%m %H:%M") if last_ok else "—",
        })
    return rows


def summary() -> dict:
    data = load()
    total = len(data)
    ok = sum(1 for e in data.values() if e.get("status") == "ok")
    degraded = sum(1 for e in data.values() if e.get("status") == "degraded")
    broken = sum(1 for e in data.values() if e.get("status") == "broken")
    return {"total": total, "ok": ok, "degraded": degraded, "broken": broken}
