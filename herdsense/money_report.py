"""Offline money-report helpers for HerdSense Pro."""

from __future__ import annotations

from typing import Dict, List, Optional


FEED_FROM_TROUGH_RATE = 0.048
FEED_FROM_MEALS_RATE = 0.1


def _estimate_feed_kg(day: Dict) -> float:
    if day.get("feed_intake_est_kg_today") is not None:
        return float(day["feed_intake_est_kg_today"])
    trough = float(day.get("trough_minutes_today", 0.0))
    meals = float(day.get("meals_count_today", 0.0))
    return round(trough * FEED_FROM_TROUGH_RATE + meals * FEED_FROM_MEALS_RATE, 2)


def compute_weekly_feed_spend(
    history_by_tag: Dict[str, List[Dict]],
    feed_cost_per_kg: float,
    days: int = 7,
) -> Dict:
    total_kg = 0.0
    estimated = False

    for series in history_by_tag.values():
        last = series[-days:]
        for day in last:
            if day.get("feed_intake_est_kg_today") is None:
                estimated = True
            total_kg += _estimate_feed_kg(day)

    spend = total_kg * float(feed_cost_per_kg)
    return {
        "feed_kg_week": round(total_kg, 2),
        "feed_spend_week": round(spend, 2),
        "is_estimated": estimated,
    }


def compute_weekly_milk_revenue(
    history_by_tag: Dict[str, List[Dict]],
    milk_price_per_liter: Optional[float],
    days: int = 7,
) -> Dict:
    if milk_price_per_liter is None:
        return {"milk_liters_week": 0.0, "milk_revenue_week": None}

    liters = 0.0
    for series in history_by_tag.values():
        for day in series[-days:]:
            liters += float(day.get("milk_liters_today") or 0.0)

    return {
        "milk_liters_week": round(liters, 2),
        "milk_revenue_week": round(liters * float(milk_price_per_liter), 2),
    }


def compute_money_leaks(
    weekly_feed_spend: float,
    congestion_level: str,
    heat_risk_count: int,
    underperformer_name: Optional[str] = None,
) -> List[Dict]:
    leaks: List[Dict] = []

    if underperformer_name:
        leaks.append(
            {
                "title": f"Cow {underperformer_name}: high feed cost with weak output trend",
                "why": "Estimated feed spend is elevated while output trend is soft.",
                "action": "Re-check eating consistency and investigate early lameness/illness if trend persists 24-48h.",
                "impact_range_week": f"${round(weekly_feed_spend * 0.01)}-${round(weekly_feed_spend * 0.03)}",
            }
        )

    if congestion_level in {"high", "medium"}:
        mult = (0.012, 0.035) if congestion_level == "high" else (0.006, 0.018)
        leaks.append(
            {
                "title": "Feeding congestion may be reducing intake consistency",
                "why": "Crowded feeding windows can displace lower-ranking cows.",
                "action": "Stagger feeding in two waves or add feeding space during peak windows.",
                "impact_range_week": f"${round(weekly_feed_spend * mult[0])}-${round(weekly_feed_spend * mult[1])}",
            }
        )

    if heat_risk_count > 0:
        leaks.append(
            {
                "title": "Heat window intake loss",
                "why": "Hot/humid periods can suppress intake and output consistency.",
                "action": "Shift feeding earlier/later and ensure water + shade before hot hours.",
                "impact_range_week": f"${round(weekly_feed_spend * 0.01)}-${round(weekly_feed_spend * 0.025)}",
            }
        )

    while len(leaks) < 3:
        leaks.append(
            {
                "title": "Routine maintenance gap",
                "why": "Missed maintenance can cause avoidable feed and labor losses.",
                "action": "Keep camera/feeder/water maintenance tasks on schedule this week.",
                "impact_range_week": "$5-$20",
            }
        )

    return leaks[:3]

