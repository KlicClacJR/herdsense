from dataclasses import dataclass, field
from typing import Dict, List


@dataclass
class Order:
    symbol: str
    price: int
    quantity: int


@dataclass
class OrderDepth:
    buy_orders: Dict[int, int] = field(default_factory=dict)
    sell_orders: Dict[int, int] = field(default_factory=dict)


@dataclass
class Trade:
    symbol: str
    price: int
    quantity: int
    buyer: str = ""
    seller: str = ""
    timestamp: int = 0


@dataclass
class TradingState:
    timestamp: int
    traderData: str
    order_depths: Dict[str, OrderDepth]
    position: Dict[str, int]
    own_trades: Dict[str, List[Trade]] = field(default_factory=dict)
    market_trades: Dict[str, List[Trade]] = field(default_factory=dict)
    observations: Dict = field(default_factory=dict)
