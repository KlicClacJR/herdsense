#!/usr/bin/env python3
import argparse
import csv
import importlib.util
import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

from datamodel import Order, OrderDepth, Trade, TradingState


@dataclass
class FillModel:
    tape_participation: float = 0.35
    touch_participation: float = 0.40


def load_prices(path: Path):
    book_by_ts: Dict[int, Dict[str, OrderDepth]] = defaultdict(dict)
    mid_by_ts: Dict[Tuple[int, str], float] = {}
    spread_by_ts: Dict[Tuple[int, str], float] = {}

    with path.open() as handle:
        reader = csv.DictReader(handle, delimiter=";")
        for row in reader:
            ts = int(row["timestamp"])
            product = row["product"]
            depth = OrderDepth()

            for level in (1, 2, 3):
                bid_p = row.get(f"bid_price_{level}", "")
                bid_v = row.get(f"bid_volume_{level}", "")
                ask_p = row.get(f"ask_price_{level}", "")
                ask_v = row.get(f"ask_volume_{level}", "")
                if bid_p and bid_v:
                    depth.buy_orders[int(float(bid_p))] = int(float(bid_v))
                if ask_p and ask_v:
                    depth.sell_orders[int(float(ask_p))] = -int(float(ask_v))

            book_by_ts[ts][product] = depth

            bid = max(depth.buy_orders) if depth.buy_orders else None
            ask = min(depth.sell_orders) if depth.sell_orders else None
            if row.get("mid_price"):
                mid = float(row["mid_price"])
            elif bid is not None and ask is not None:
                mid = (bid + ask) / 2.0
            elif bid is not None:
                mid = float(bid)
            elif ask is not None:
                mid = float(ask)
            else:
                mid = 0.0
            mid_by_ts[(ts, product)] = mid
            if bid is not None and ask is not None:
                spread_by_ts[(ts, product)] = float(ask - bid)
            else:
                spread_by_ts[(ts, product)] = 0.0

    return book_by_ts, mid_by_ts, spread_by_ts


def load_trades(path: Path):
    trades_by_ts: Dict[int, Dict[str, List[Trade]]] = defaultdict(lambda: defaultdict(list))
    with path.open() as handle:
        reader = csv.DictReader(handle, delimiter=";")
        for row in reader:
            ts = int(row["timestamp"])
            product = row["symbol"]
            trades_by_ts[ts][product].append(
                Trade(
                    symbol=product,
                    price=int(float(row["price"])),
                    quantity=int(float(row["quantity"])),
                    buyer=row.get("buyer", "") or "",
                    seller=row.get("seller", "") or "",
                    timestamp=ts,
                )
            )
    return trades_by_ts


def load_trader_class(path: Path):
    spec = importlib.util.spec_from_file_location("strategy_module", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not import trader module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not hasattr(module, "Trader"):
        raise RuntimeError(f"Module {path} has no Trader class")
    return module.Trader


def execute_aggressive(order: Order, depth: OrderDepth, position: int, cash: float):
    remaining = order.quantity
    if remaining > 0:
        for ask in sorted(depth.sell_orders):
            if remaining <= 0 or ask > order.price:
                break
            available = -depth.sell_orders[ask]
            if available <= 0:
                continue
            fill = min(remaining, available)
            remaining -= fill
            cash -= fill * ask
            position += fill
            depth.sell_orders[ask] += fill
    elif remaining < 0:
        remaining_sell = -remaining
        for bid in sorted(depth.buy_orders, reverse=True):
            if remaining_sell <= 0 or bid < order.price:
                break
            available = depth.buy_orders[bid]
            if available <= 0:
                continue
            fill = min(remaining_sell, available)
            remaining_sell -= fill
            cash += fill * bid
            position -= fill
            depth.buy_orders[bid] -= fill
        remaining = -remaining_sell
    return remaining, position, cash


def fill_passive_orders(
    pending_orders,
    depth: OrderDepth,
    tape_trades: List[Trade],
    position: int,
    cash: float,
    model: FillModel,
):
    best_bid = max(depth.buy_orders) if depth.buy_orders else None
    best_ask = min(depth.sell_orders) if depth.sell_orders else None

    for order in pending_orders:
        rem = order.quantity
        if rem > 0:
            crossed_tape = sum(t.quantity for t in tape_trades if t.price <= order.price)
            tape_fill = int(round(crossed_tape * model.tape_participation))
            touch_fill = 0
            if best_ask is not None and order.price >= best_ask:
                touch_fill = int(round(-depth.sell_orders.get(best_ask, 0) * model.touch_participation))
            fill = min(rem, max(0, tape_fill + touch_fill))
            if fill > 0:
                position += fill
                cash -= fill * order.price
        elif rem < 0:
            sell_qty = -rem
            crossed_tape = sum(t.quantity for t in tape_trades if t.price >= order.price)
            tape_fill = int(round(crossed_tape * model.tape_participation))
            touch_fill = 0
            if best_bid is not None and order.price <= best_bid:
                touch_fill = int(round(depth.buy_orders.get(best_bid, 0) * model.touch_participation))
            fill = min(sell_qty, max(0, tape_fill + touch_fill))
            if fill > 0:
                position -= fill
                cash += fill * order.price

    return position, cash


def simulate_day(
    TraderCls,
    prices_path: Path,
    trades_path: Path,
    model: FillModel,
):
    book_by_ts, mids, spreads = load_prices(prices_path)
    trades_by_ts = load_trades(trades_path)
    timestamps = sorted(book_by_ts.keys())

    trader = TraderCls()
    trader_data = ""
    cash = 0.0
    position = {"EMERALDS": 0, "TOMATOES": 0}
    pending = {"EMERALDS": [], "TOMATOES": []}

    for ts in timestamps:
        for product in list(pending.keys()):
            if product in book_by_ts[ts] and pending[product]:
                position[product], cash = fill_passive_orders(
                    pending_orders=pending[product],
                    depth=book_by_ts[ts][product],
                    tape_trades=trades_by_ts[ts].get(product, []),
                    position=position[product],
                    cash=cash,
                    model=model,
                )
            pending[product] = []

        state = TradingState(
            timestamp=ts,
            traderData=trader_data,
            order_depths=book_by_ts[ts],
            position=position.copy(),
            own_trades={},
            market_trades=trades_by_ts[ts],
            observations={},
        )

        result, _, trader_data = trader.run(state)
        if not isinstance(result, dict):
            continue

        for product, orders in result.items():
            if product not in book_by_ts[ts]:
                continue
            depth = book_by_ts[ts][product]
            for order in orders:
                if order.quantity == 0:
                    continue
                remainder, position[product], cash = execute_aggressive(
                    order=order, depth=depth, position=position[product], cash=cash
                )
                if remainder != 0:
                    pending[product].append(Order(product, int(order.price), int(remainder)))

    final_ts = timestamps[-1]
    mtm = 0.0
    liquidation_penalty = 0.0
    for product, qty in position.items():
        mid = mids.get((final_ts, product), 0.0)
        spread = spreads.get((final_ts, product), 0.0)
        mtm += qty * mid
        liquidation_penalty += abs(qty) * (spread / 2.0)

    pnl = cash + mtm
    pnl_after_liq = pnl - liquidation_penalty
    return {
        "pnl": pnl,
        "pnl_after_liq": pnl_after_liq,
        "cash": cash,
        "position": position,
        "final_timestamp": final_ts,
    }


def main():
    parser = argparse.ArgumentParser(description="Backtest IMC-style Trader against tutorial csv files.")
    parser.add_argument(
        "--trader",
        required=True,
        help="Path to trader file containing class Trader.",
    )
    parser.add_argument(
        "--data-dir",
        default="/Users/emmetsurmeli/Downloads/TUTORIAL_ROUND_1",
        help="Directory containing prices/trades CSV files.",
    )
    parser.add_argument("--tape-participation", type=float, default=0.35)
    parser.add_argument("--touch-participation", type=float, default=0.40)
    args = parser.parse_args()

    TraderCls = load_trader_class(Path(args.trader).resolve())
    model = FillModel(
        tape_participation=args.tape_participation,
        touch_participation=args.touch_participation,
    )

    data_dir = Path(args.data_dir).resolve()
    days = [-2, -1]
    summaries = []
    for day in days:
        prices = data_dir / f"prices_round_0_day_{day}.csv"
        trades = data_dir / f"trades_round_0_day_{day}.csv"
        metrics = simulate_day(TraderCls, prices, trades, model)
        metrics["day"] = day
        summaries.append(metrics)

    total_pnl = sum(x["pnl"] for x in summaries)
    total_pnl_after_liq = sum(x["pnl_after_liq"] for x in summaries)

    print(json.dumps({"days": summaries, "total_pnl": total_pnl, "total_pnl_after_liq": total_pnl_after_liq}, indent=2))


if __name__ == "__main__":
    main()
