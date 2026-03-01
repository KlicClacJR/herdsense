"""Calendar recurrence and completion history helpers."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, List, Tuple


def _as_date(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value.replace(hour=0, minute=0, second=0, microsecond=0)
    return datetime.fromisoformat(value).replace(hour=0, minute=0, second=0, microsecond=0)


def add_interval(base_date: str | datetime, recurrence: Dict) -> datetime:
    d = _as_date(base_date)
    every = max(1, int(recurrence.get("every", 1)))
    unit = recurrence.get("unit", "days")

    if unit == "weeks":
        return d + timedelta(days=every * 7)
    if unit == "months":
        month = d.month - 1 + every
        year = d.year + month // 12
        month = month % 12 + 1
        day = min(d.day, 28)
        return d.replace(year=year, month=month, day=day)
    return d + timedelta(days=every)


def mark_done(
    task_occurrences: List[Dict],
    task_history: List[Dict],
    occurrence_id: str,
    now: datetime | None = None,
) -> Tuple[List[Dict], List[Dict]]:
    now = now or datetime.utcnow()
    next_occurrences: List[Dict] = []
    existing_keys = {
        f"{occ.get('template_id', 'custom')}|{occ.get('due_date')}"
        for occ in task_occurrences
    }

    updated: List[Dict] = []
    for occ in task_occurrences:
        if occ.get("occurrence_id") != occurrence_id:
            updated.append(occ)
            continue

        done = {**occ, "status": "done", "completed_at": now.isoformat()}
        updated.append(done)

        recurrence = occ.get("recurrence")
        if recurrence:
            due = now.isoformat()
            next_due = add_interval(due, recurrence).date().isoformat()
            key = f"{occ.get('template_id', 'custom')}|{next_due}"
            if key not in existing_keys:
                clone = {
                    **occ,
                    "occurrence_id": f"occ-{occ.get('template_id', 'custom')}-{next_due}-{abs(hash((occurrence_id, next_due)))}",
                    "due_date": next_due,
                    "status": "pending",
                    "completed_at": None,
                    "created_at": now.isoformat(),
                }
                next_occurrences.append(clone)
                existing_keys.add(key)

    history_entry = {
        "history_id": f"hist-{occurrence_id}-{int(now.timestamp())}",
        "occurrence_id": occurrence_id,
        "action": "done",
        "timestamp": now.isoformat(),
    }

    return updated + next_occurrences, task_history + [history_entry]


def mark_skipped(
    task_occurrences: List[Dict],
    task_history: List[Dict],
    occurrence_id: str,
    now: datetime | None = None,
) -> Tuple[List[Dict], List[Dict]]:
    now = now or datetime.utcnow()
    updated = [
        {**occ, "status": "skipped", "completed_at": now.isoformat()} if occ.get("occurrence_id") == occurrence_id else occ
        for occ in task_occurrences
    ]
    history_entry = {
        "history_id": f"hist-skip-{occurrence_id}-{int(now.timestamp())}",
        "occurrence_id": occurrence_id,
        "action": "skipped",
        "timestamp": now.isoformat(),
    }
    return updated, task_history + [history_entry]
