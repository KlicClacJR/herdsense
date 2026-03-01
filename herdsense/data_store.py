"""Simple JSON data store for cows, tasks, and daily logs."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional
import json


@dataclass
class DataStore:
    path: Path

    def load(self) -> Dict[str, Any]:
        if not self.path.exists():
            return {
                "cows": [],
                "task_occurrences": [],
                "task_history": [],
                "daily_logs_by_ear_tag": {},
            }
        return json.loads(self.path.read_text())

    def save(self, payload: Dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(payload, indent=2, sort_keys=True))

    def upsert_cow(self, cow: Dict[str, Any]) -> Dict[str, Any]:
        payload = self.load()
        cows: List[Dict[str, Any]] = payload.get("cows", [])

        ear = (cow.get("ear_tag_id") or "").strip().upper()
        if not ear:
            raise ValueError("ear_tag_id is required")

        duplicate = next((c for c in cows if c.get("ear_tag_id", "").upper() == ear and c.get("cow_id") != cow.get("cow_id")), None)
        if duplicate:
            raise ValueError(f"Duplicate ear_tag_id: {ear}")

        existing_idx = next((i for i, c in enumerate(cows) if c.get("cow_id") == cow.get("cow_id")), None)
        if existing_idx is None:
            cows.append(cow)
        else:
            cows[existing_idx] = {**cows[existing_idx], **cow}

        payload["cows"] = cows
        self.save(payload)
        return payload

    def delete_cow(self, cow_id: str) -> Dict[str, Any]:
        payload = self.load()
        cows = payload.get("cows", [])
        payload["cows"] = [cow for cow in cows if cow.get("cow_id") != cow_id]
        self.save(payload)
        return payload

    def archive_cow(self, cow_id: str, inactive: bool = True) -> Dict[str, Any]:
        payload = self.load()
        next_cows = []
        for cow in payload.get("cows", []):
            if cow.get("cow_id") == cow_id:
                next_cows.append({**cow, "is_active": not inactive})
            else:
                next_cows.append(cow)
        payload["cows"] = next_cows
        self.save(payload)
        return payload

    def append_daily_log(self, ear_tag_id: str, day_log: Dict[str, Any]) -> Dict[str, Any]:
        payload = self.load()
        key = ear_tag_id.strip().upper()
        logs = payload.setdefault("daily_logs_by_ear_tag", {})
        rows = logs.get(key, [])
        rows.append(day_log)
        logs[key] = rows[-120:]
        self.save(payload)
        return payload
