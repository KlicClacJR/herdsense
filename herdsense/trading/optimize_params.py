#!/usr/bin/env python3
import json
import math
import random
from pathlib import Path
from typing import Dict, List, Tuple

from backtest import FillModel, simulate_day
from datamodel import Order, OrderDepth, TradingState


class CandidateTrader:
    POSITION_LIMITS = {"EMERALDS": 20, "TOMATOES": 20}

    def __init__(self, config):
        self.cfg = config

    def run(self, state: TradingState):
        memory = self._load_memory(state.traderData)
        out = {}
        for product, depth in state.order_depths.items():
            if product not in self.POSITION_LIMITS:
                continue
            pos = state.position.get(product, 0)
            if product == "EMERALDS":
                out[product] = self.trade_emeralds(depth, pos, state.timestamp)
            else:
                out[product] = self.trade_tomatoes(depth, pos, memory, state.timestamp)
        return out, 0, json.dumps(memory)

    def _load_memory(self, trader_data: str):
        if not trader_data:
            return {"mid_history": {"TOMATOES": []}}
        try:
            m = json.loads(trader_data)
        except Exception:
            m = {}
        if "mid_history" not in m:
            m["mid_history"] = {"TOMATOES": []}
        if "TOMATOES" not in m["mid_history"]:
            m["mid_history"]["TOMATOES"] = []
        return m

    @staticmethod
    def _best(depth: OrderDepth):
        best_bid = max(depth.buy_orders) if depth.buy_orders else None
        best_ask = min(depth.sell_orders) if depth.sell_orders else None
        return best_bid, best_ask

    def _mid(self, depth: OrderDepth):
        best_bid, best_ask = self._best(depth)
        if best_bid is not None and best_ask is not None:
            return (best_bid + best_ask) / 2.0
        if best_bid is not None:
            return float(best_bid)
        if best_ask is not None:
            return float(best_ask)
        return None

    def _micro(self, depth: OrderDepth):
        best_bid, best_ask = self._best(depth)
        if best_bid is None or best_ask is None:
            return self._mid(depth)
        bid_vol = abs(depth.buy_orders[best_bid])
        ask_vol = abs(depth.sell_orders[best_ask])
        denom = bid_vol + ask_vol
        if denom == 0:
            return (best_bid + best_ask) / 2.0
        return (best_ask * bid_vol + best_bid * ask_vol) / denom

    def _imbalance(self, depth: OrderDepth):
        best_bid, best_ask = self._best(depth)
        if best_bid is None or best_ask is None:
            return 0.0
        bid_vol = abs(depth.buy_orders[best_bid])
        ask_vol = abs(depth.sell_orders[best_ask])
        denom = bid_vol + ask_vol
        if denom == 0:
            return 0.0
        return (bid_vol - ask_vol) / denom

    def _take(
        self,
        product: str,
        depth: OrderDepth,
        fair: float,
        position: int,
        edge: float,
        soft_limit_ratio: float,
    ):
        orders: List[Order] = []
        limit = self.POSITION_LIMITS[product]
        soft_cap = int(limit * soft_limit_ratio)
        long_cap = min(limit, soft_cap if soft_cap > 0 else limit)
        short_cap = -long_cap

        for ask in sorted(depth.sell_orders):
            if ask > fair - edge:
                break
            avail = -depth.sell_orders[ask]
            if avail <= 0:
                continue
            buy_room = long_cap - position
            if buy_room <= 0:
                break
            qty = min(avail, buy_room)
            orders.append(Order(product, ask, qty))
            position += qty

        for bid in sorted(depth.buy_orders, reverse=True):
            if bid < fair + edge:
                break
            avail = depth.buy_orders[bid]
            if avail <= 0:
                continue
            sell_room = position - short_cap
            if sell_room <= 0:
                break
            qty = min(avail, sell_room)
            orders.append(Order(product, bid, -qty))
            position -= qty

        return orders

    def _quote(
        self,
        product: str,
        depth: OrderDepth,
        fair: float,
        position: int,
        half_spread: int,
        skew: float,
        base_size: int,
    ):
        orders: List[Order] = []
        limit = self.POSITION_LIMITS[product]
        best_bid, best_ask = self._best(depth)
        center = fair - skew * position
        bid = int(round(center - half_spread))
        ask = int(round(center + half_spread))

        if best_bid is not None:
            bid = min(bid, best_bid + 1)
        if best_ask is not None:
            ask = max(ask, best_ask - 1)
        if bid >= ask:
            bid = ask - 1

        max_buy = limit - position
        max_sell = limit + position
        size = max(1, base_size - abs(position) // 4)
        if max_buy > 0:
            orders.append(Order(product, bid, min(size, max_buy)))
        if max_sell > 0:
            orders.append(Order(product, ask, -min(size, max_sell)))
        return orders

    def trade_emeralds(self, depth, position, timestamp):
        fair = 10000.0
        best_bid, best_ask = self._best(depth)
        if best_bid is None or best_ask is None:
            return []

        micro_tilt = self.cfg["em_micro_weight"] * (self._micro(depth) - self._mid(depth))
        imbalance_tilt = self.cfg["em_imb_weight"] * self._imbalance(depth)
        fair += micro_tilt + imbalance_tilt

        orders = self._take(
            "EMERALDS",
            depth,
            fair,
            position,
            self.cfg["em_take_edge"],
            soft_limit_ratio=1.0,
        )
        net = position + sum(o.quantity for o in orders)
        orders += self._quote(
            "EMERALDS",
            depth,
            fair,
            net,
            self.cfg["em_half_spread"],
            self.cfg["em_inventory_skew"],
            self.cfg["em_base_size"],
        )
        return orders

    def trade_tomatoes(self, depth, position, memory, timestamp):
        mid = self._mid(depth)
        if mid is None:
            return []

        hist = memory["mid_history"]["TOMATOES"]
        hist.append(mid)
        if len(hist) > 80:
            hist.pop(0)

        micro = self._micro(depth)
        imbalance = self._imbalance(depth)
        short_window = self.cfg["short_window"]
        long_window = self.cfg["long_window"]

        short = sum(hist[-short_window:]) / min(len(hist), short_window)
        long = sum(hist[-long_window:]) / min(len(hist), long_window)
        prev = hist[-2] if len(hist) >= 2 else mid
        prev2 = hist[-3] if len(hist) >= 3 else prev
        mom1 = mid - prev
        mom2 = prev - prev2

        pred_move = (
            self.cfg["t_w_micro"] * (micro - mid)
            + self.cfg["t_w_imb"] * imbalance
            + self.cfg["t_w_reversion"] * (long - mid)
            - self.cfg["t_w_mom1"] * mom1
            - self.cfg["t_w_mom2"] * mom2
            + self.cfg["t_w_short_long"] * (short - long)
        )

        fair = mid + pred_move
        orders = self._take(
            "TOMATOES",
            depth,
            fair,
            position,
            self.cfg["t_take_edge"],
            soft_limit_ratio=self.cfg["t_soft_limit_ratio"],
        )
        net = position + sum(o.quantity for o in orders)
        orders += self._quote(
            "TOMATOES",
            depth,
            fair,
            net,
            self.cfg["t_half_spread"],
            self.cfg["t_inventory_skew"],
            self.cfg["t_base_size"],
        )
        return orders


def build_trader_class(config):
    class _Trader(CandidateTrader):
        def __init__(self):
            super().__init__(config)

    return _Trader


def sample_config(rng: random.Random):
    return {
        "short_window": rng.choice([6, 8, 10, 12]),
        "long_window": rng.choice([24, 30, 36, 42]),
        "t_w_micro": rng.uniform(0.8, 2.8),
        "t_w_imb": rng.uniform(-2.0, 1.0),
        "t_w_reversion": rng.uniform(0.02, 0.25),
        "t_w_mom1": rng.uniform(0.05, 0.9),
        "t_w_mom2": rng.uniform(0.05, 0.6),
        "t_w_short_long": rng.uniform(-0.6, 0.6),
        "t_take_edge": rng.uniform(0.8, 2.2),
        "t_half_spread": rng.choice([1, 2, 3]),
        "t_inventory_skew": rng.uniform(0.06, 0.24),
        "t_base_size": rng.choice([3, 4, 5, 6]),
        "t_soft_limit_ratio": rng.uniform(0.65, 1.0),
        "em_take_edge": rng.uniform(0.2, 1.5),
        "em_half_spread": rng.choice([1, 2, 3]),
        "em_inventory_skew": rng.uniform(0.06, 0.22),
        "em_base_size": rng.choice([3, 4, 5, 6]),
        "em_micro_weight": rng.uniform(0.0, 1.6),
        "em_imb_weight": rng.uniform(-0.8, 0.8),
    }


def score_candidate(metrics_day):
    pnls = [d["pnl_after_liq"] for d in metrics_day]
    worst = min(pnls)
    total = sum(pnls)
    # Robust objective: maximize sum but punish fragile day-wise performance.
    return total + 0.8 * worst


def main():
    rng = random.Random(7)
    data_dir = Path("/Users/emmetsurmeli/Downloads/TUTORIAL_ROUND_1")
    fill_model = FillModel(tape_participation=0.35, touch_participation=0.40)
    prices = {
        -2: data_dir / "prices_round_0_day_-2.csv",
        -1: data_dir / "prices_round_0_day_-1.csv",
    }
    trades = {
        -2: data_dir / "trades_round_0_day_-2.csv",
        -1: data_dir / "trades_round_0_day_-1.csv",
    }

    best = None
    trials = 1400
    for _ in range(trials):
        cfg = sample_config(rng)
        TraderCls = build_trader_class(cfg)
        day_metrics = []
        for day in (-2, -1):
            day_metrics.append(simulate_day(TraderCls, prices[day], trades[day], fill_model))

        # Reject unstable inventory at end.
        if any(abs(m["position"]["EMERALDS"]) > 18 or abs(m["position"]["TOMATOES"]) > 18 for m in day_metrics):
            continue

        score = score_candidate(day_metrics)
        if best is None or score > best[0]:
            best = (score, cfg, day_metrics)

    if best is None:
        raise RuntimeError("No feasible config found")

    print(json.dumps({"score": best[0], "config": best[1], "day_metrics": best[2]}, indent=2))


if __name__ == "__main__":
    main()
