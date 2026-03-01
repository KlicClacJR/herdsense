"""Optimization engine: recommendations, congestion, and ROI summaries."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class Recommendation:
    title: str
    why: str
    instruction: str
    impact_range: str
    confidence: str



def estimate_feed_kg(signal: Dict) -> float:
    if signal.get("feed_intake_est_kg_today") is not None:
        return float(signal["feed_intake_est_kg_today"])
    return round(float(signal.get("trough_minutes_today", 0.0)) * 0.048 + float(signal.get("meals_count_today", 0.0)) * 0.1, 2)



def feed_rows(cows: List[Dict], today_by_tag: Dict[str, Dict], feed_cost_per_kg: float) -> List[Dict]:
    rows = []
    for cow in cows:
        if not cow.get("is_active", True):
            continue
        signal = today_by_tag.get(cow["ear_tag_id"], {})
        feed = estimate_feed_kg(signal)
        milk = signal.get("milk_liters_today")
        feed_cost = round(feed * feed_cost_per_kg, 2)
        cpl = round(feed_cost / milk, 2) if milk else None
        rows.append(
            {
                "cow_id": cow["cow_id"],
                "ear_tag_id": cow["ear_tag_id"],
                "feed_kg": feed,
                "feed_cost": feed_cost,
                "milk_liters": milk,
                "cost_per_liter": cpl,
            }
        )
    return rows



def congestion_summary(cows: List[Dict], today_by_tag: Dict[str, Dict]) -> Dict:
    slots = [0] * 48
    for cow in cows:
        if not cow.get("is_active", True):
            continue
        signal = today_by_tag.get(cow["ear_tag_id"], {})
        for minute in signal.get("meal_timestamps", []):
            idx = max(0, min(47, int(minute // 30)))
            slots[idx] += 1

    active_slots = [n for n in slots if n > 0]
    overlap_slots = sum(1 for n in slots if n >= 2)
    score = (overlap_slots / len(active_slots)) if active_slots else 0.0
    avg_simultaneous = (sum(active_slots) / len(active_slots)) if active_slots else 0.0

    ranked = sorted([(i, n) for i, n in enumerate(slots)], key=lambda x: x[1], reverse=True)
    peaks = [f"slot {i} ({n} cows)" for i, n in ranked[:3] if n > 0]

    actions = []
    if score >= 0.45:
        actions = [
            "Stagger feeding windows",
            "Add second feeding spot",
            "Split herd during feeding",
        ]
    elif score >= 0.25:
        actions = ["Monitor peak windows and adjust spacing"]
    else:
        actions = ["Congestion manageable today"]

    return {
        "score": round(score, 2),
        "avg_cows_simultaneous": round(avg_simultaneous, 2),
        "peak_windows": peaks,
        "explanation": "Congestion score = fraction of feeding slots where >=2 cows overlap.",
        "actions": actions,
    }



def roi_summary(rows: List[Dict], settings: Dict, high_risk_count: int = 0) -> Dict:
    feed_burn = sum(r["feed_kg"] for r in rows)
    monthly_feed_cost = feed_burn * float(settings.get("feed_cost_per_kg", 0.0)) * 30

    milk_price = settings.get("milk_price_per_liter")
    milk_per_day = sum(r.get("milk_liters") or 0 for r in rows)
    revenue = milk_per_day * float(milk_price) * 30 if milk_price is not None else None

    inventory = settings.get("available_feed_kg_current")
    days_remaining = (float(inventory) / feed_burn) if inventory and feed_burn > 0 else None

    waste_low = monthly_feed_cost * 0.03
    waste_high = monthly_feed_cost * 0.07

    vet = float(settings.get("vet_visit_cost_estimate", 120) or 120)
    lameness_low = vet * 0.5 + high_risk_count * 20
    lameness_high = vet * 1.1 + high_risk_count * 45

    return {
        "feed_burn_rate_kg_day": round(feed_burn, 2),
        "days_of_feed_remaining": None if days_remaining is None else round(days_remaining, 1),
        "projected_monthly_feed_cost": round(monthly_feed_cost, 2),
        "projected_monthly_revenue": None if revenue is None else round(revenue, 2),
        "estimated_profit": None if revenue is None else round(revenue - monthly_feed_cost, 2),
        "waste_savings_range": (round(waste_low, 2), round(waste_high, 2)),
        "avoided_lameness_range": (round(lameness_low, 2), round(lameness_high, 2)),
    }



def recommendation_set(rows: List[Dict], roi: Dict, congestion: Dict) -> List[Recommendation]:
    recs: List[Recommendation] = []

    recs.append(
        Recommendation(
            title="Feed timing optimization",
            why="Heat and congestion patterns can suppress intake during peak daytime.",
            instruction="Feed in cooler windows (06:00-08:00 and 18:00-20:00) for the next 7 days and compare intake.",
            impact_range=f"${round(roi['projected_monthly_feed_cost'] * 0.01)}-${round(roi['projected_monthly_feed_cost'] * 0.025)}/month",
            confidence="medium",
        )
    )

    worst = sorted([r for r in rows if r.get("cost_per_liter") is not None], key=lambda x: x["cost_per_liter"], reverse=True)
    if worst:
        cow = worst[0]
        recs.append(
            Recommendation(
                title=f"Underperformer check: {cow['ear_tag_id']}",
                why="Feed spend per liter is high versus herd peers.",
                instruction="Run first checks (hydration, gait, udder) and adjust ration by 4-6% for 5 days, then re-measure output.",
                impact_range="$12-$45/week",
                confidence="medium",
            )
        )

    recs.append(
        Recommendation(
            title="Water/shade ROI",
            why="Better water access near shade supports intake on hot days.",
            instruction="Add one extra water point near shade and validate trough flow daily for 14 days.",
            impact_range="$10-$38/month",
            confidence="medium",
        )
    )

    if congestion["score"] >= 0.35:
        recs.append(
            Recommendation(
                title="Reduce feeder congestion",
                why="High overlap increases displacement risk and uneven intake.",
                instruction="Stagger groups by 30-45 minutes or open a second feeding lane in peak windows.",
                impact_range="$8-$30/week",
                confidence="high",
            )
        )

    return recs[:6]
