"""Offline insights scoring module for HerdSense.

This mirrors the client-side logic using weighted features + softmax probabilities.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import exp
from typing import Dict, List, Optional


BUCKETS = [
    "Heat stress risk",
    "Pre-calving / calving soon risk",
    "Illness/injury risk",
    "Low intake anomaly",
    "Water access issue",
    "Social stress / resource competition",
    "Normal variation / Other",
]


ACTIONS = {
    "Heat stress risk": [
        "Check water trough flow/cleanliness",
        "Add shade near feeder",
        "Feed during cooler hours",
        "Watch for rapid breathing",
    ],
    "Pre-calving / calving soon risk": [
        "Increase monitoring",
        "Prepare calving area",
        "Look for restlessness/isolation",
        "Contact experienced handler if distressed",
    ],
    "Illness/injury risk": [
        "Inspect gait/hooves",
        "Check appetite again in 6 hours",
        "Check manure/hydration",
        "If worsening contact vet",
    ],
    "Low intake anomaly": [
        "Re-check feed quality",
        "Confirm feeder access",
        "Observe next meal attendance",
    ],
    "Water access issue": [
        "Inspect trough",
        "Add second trough",
        "Move trough closer to shade",
    ],
    "Social stress / resource competition": [
        "Increase feeding space",
        "Separate during feeding",
        "Observe bullying",
    ],
    "Normal variation / Other": ["Continue routine checks"],
}


@dataclass
class InsightResult:
    probabilities: Dict[str, float]
    confidence: float
    top_bucket: str
    why: List[str]
    actions: List[str]



def _pct_change(value: Optional[float], baseline: Optional[float]) -> Optional[float]:
    if value is None or baseline is None or baseline == 0:
        return None
    return (value - baseline) / baseline



def _softmax(scores: Dict[str, float]) -> Dict[str, float]:
    max_score = max(scores.values())
    exps = {k: exp(v - max_score) for k, v in scores.items()}
    total = sum(exps.values()) or 1.0
    return {k: v / total for k, v in exps.items()}



def score_insights(cow: Dict, today: Dict, baseline: Dict) -> InsightResult:
    intake_delta = _pct_change(today.get("trough_minutes_today"), baseline.get("trough_minutes_today")) or 0
    meals_delta = _pct_change(today.get("meals_count_today"), baseline.get("meals_count_today")) or 0
    activity_delta = _pct_change(today.get("activity_index_today"), baseline.get("activity_index_today")) or 0
    alone_delta = _pct_change(today.get("alone_minutes_today"), baseline.get("alone_minutes_today")) or 0
    water_delta = _pct_change(today.get("water_visits_today"), baseline.get("water_visits_today")) or 0

    temp = today.get("temp_c_today")
    humidity = today.get("humidity_pct_today")
    heat_day = bool(temp is not None and humidity is not None and temp >= 30 and humidity >= 65)

    scores = {
        "Heat stress risk": 0.2 + (1.1 if heat_day else 0.0) + max(0.0, -intake_delta) * 0.8,
        "Pre-calving / calving soon risk": 0.2
        + (
            max(0.0, (21 - float(cow.get("pregnancy_due_days"))) / 14)
            if cow.get("sex") == "female" and cow.get("pregnancy_due_days") is not None
            else 0.0
        )
        + max(0.0, alone_delta) * 0.5,
        "Illness/injury risk": 0.2 + max(0.0, -activity_delta) * 1.0 + max(0.0, -intake_delta) * 0.6,
        "Low intake anomaly": 0.2 + max(0.0, -intake_delta) * 1.1 + max(0.0, -meals_delta) * 0.9,
        "Water access issue": 0.2 + max(0.0, -water_delta) * 1.2 + (0.5 if heat_day else 0.0),
        "Social stress / resource competition": 0.2 + max(0.0, alone_delta) * 1.0 + max(0.0, -meals_delta) * 0.3,
        "Normal variation / Other": 0.45,
    }

    probs = _softmax(scores)
    ranked = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)
    top_bucket = ranked[0][0]

    available = sum(1 for k in [
        "trough_minutes_today",
        "meals_count_today",
        "activity_index_today",
        "alone_minutes_today",
        "water_visits_today",
    ] if today.get(k) is not None)
    confidence = max(0.15, min(0.98, available / 5.0))

    why = []
    for label, delta in [
        ("Eating time", intake_delta),
        ("Meal count", meals_delta),
        ("Activity", activity_delta),
        ("Alone time", alone_delta),
        ("Water visits", water_delta),
    ]:
        if abs(delta) >= 0.12:
            why.append(f"{label} {delta * 100:+.0f}% vs baseline")

    return InsightResult(
        probabilities=probs,
        confidence=confidence,
        top_bucket=top_bucket,
        why=why[:4],
        actions=ACTIONS[top_bucket],
    )

