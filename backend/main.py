from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import get_db, init_db
from models import (
    BrokerCashCreate,
    BrokerCashOut,
    BrokerCashUpdate,
    BrokerCreate,
    BrokerOut,
    BrokerUpdate,
    CPFOut,
    CPFUpdate,
    PortfolioOut,
    SimpleItemCreate,
    SimpleItemOut,
    SimpleItemUpdate,
    SnapshotCreate,
    SnapshotOut,
    StockCreate,
    StockOut,
    StockUpdate,
)

app = FastAPI(title="Net Worth Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


# ── Portfolio (read-only aggregate) ──────────────────────────────────────────


@app.get("/api/portfolio", response_model=PortfolioOut)
def get_portfolio():
    db = get_db()
    brokers = [dict(r) for r in db.execute("SELECT * FROM brokers ORDER BY position, id").fetchall()]
    stocks = [dict(r) for r in db.execute("SELECT * FROM stocks ORDER BY id").fetchall()]
    broker_cash = [dict(r) for r in db.execute("SELECT * FROM broker_cash ORDER BY id").fetchall()]
    bonds = [dict(r) for r in db.execute("SELECT * FROM bonds ORDER BY id").fetchall()]
    cash = [dict(r) for r in db.execute("SELECT * FROM cash ORDER BY id").fetchall()]
    other = [dict(r) for r in db.execute("SELECT * FROM other_assets ORDER BY id").fetchall()]
    insurance = [dict(r) for r in db.execute("SELECT * FROM insurance ORDER BY id").fetchall()]
    liabilities = [dict(r) for r in db.execute("SELECT * FROM liabilities ORDER BY id").fetchall()]
    cpf_row = dict(db.execute("SELECT oa, sa, ma FROM cpf WHERE id=1").fetchone())
    db.close()
    return PortfolioOut(
        brokers=brokers,
        stocks=stocks,
        broker_cash=broker_cash,
        bonds=bonds,
        cash=cash,
        other=other,
        insurance=insurance,
        liabilities=liabilities,
        cpf=CPFOut(**cpf_row),
    )


# ── Brokers ──────────────────────────────────────────────────────────────────


@app.post("/api/brokers", response_model=BrokerOut, status_code=201)
def create_broker(body: BrokerCreate):
    db = get_db()
    max_pos = db.execute("SELECT COALESCE(MAX(position),0) FROM brokers").fetchone()[0]
    try:
        cur = db.execute(
            "INSERT INTO brokers (name, position) VALUES (?, ?)",
            (body.name, max_pos + 1),
        )
        db.commit()
    except Exception:
        db.close()
        raise HTTPException(400, "Broker already exists")
    broker = dict(db.execute("SELECT * FROM brokers WHERE id=?", (cur.lastrowid,)).fetchone())
    db.close()
    return broker


@app.patch("/api/brokers/{broker_id}", response_model=BrokerOut)
def update_broker(broker_id: int, body: BrokerUpdate):
    db = get_db()
    existing = db.execute("SELECT * FROM brokers WHERE id=?", (broker_id,)).fetchone()
    if not existing:
        db.close()
        raise HTTPException(404, "Broker not found")
    updates = body.model_dump(exclude_none=True)
    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        db.execute(f"UPDATE brokers SET {sets} WHERE id=?", (*updates.values(), broker_id))
        db.commit()
    broker = dict(db.execute("SELECT * FROM brokers WHERE id=?", (broker_id,)).fetchone())
    db.close()
    return broker


@app.delete("/api/brokers/{broker_id}", status_code=204)
def delete_broker(broker_id: int):
    db = get_db()
    db.execute("DELETE FROM brokers WHERE id=?", (broker_id,))
    db.commit()
    db.close()


# ── Broker Cash ─────────────────────────────────────────────────────────────


@app.post("/api/broker-cash", response_model=BrokerCashOut, status_code=201)
def create_broker_cash(body: BrokerCashCreate):
    db = get_db()
    cur = db.execute(
        "INSERT INTO broker_cash (broker_id, currency, amount) VALUES (?, ?, 0)",
        (body.broker_id, body.currency),
    )
    db.commit()
    row = dict(db.execute("SELECT * FROM broker_cash WHERE id=?", (cur.lastrowid,)).fetchone())
    db.close()
    return row


@app.patch("/api/broker-cash/{cash_id}", response_model=BrokerCashOut)
def update_broker_cash(cash_id: int, body: BrokerCashUpdate):
    db = get_db()
    existing = db.execute("SELECT * FROM broker_cash WHERE id=?", (cash_id,)).fetchone()
    if not existing:
        db.close()
        raise HTTPException(404, "Broker cash not found")
    updates = body.model_dump(exclude_none=True)
    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        db.execute(f"UPDATE broker_cash SET {sets} WHERE id=?", (*updates.values(), cash_id))
        db.commit()
    row = dict(db.execute("SELECT * FROM broker_cash WHERE id=?", (cash_id,)).fetchone())
    db.close()
    return row


@app.delete("/api/broker-cash/{cash_id}", status_code=204)
def delete_broker_cash(cash_id: int):
    db = get_db()
    db.execute("DELETE FROM broker_cash WHERE id=?", (cash_id,))
    db.commit()
    db.close()


# ── Stocks ───────────────────────────────────────────────────────────────────


@app.post("/api/stocks", response_model=StockOut, status_code=201)
def create_stock(body: StockCreate):
    db = get_db()
    cur = db.execute(
        "INSERT INTO stocks (broker_id, symbol, shares, cost, price, currency) VALUES (?,?,?,?,?,?)",
        (body.broker_id, body.symbol, body.shares, body.cost, body.price, body.currency),
    )
    db.commit()
    stock = dict(db.execute("SELECT * FROM stocks WHERE id=?", (cur.lastrowid,)).fetchone())
    db.close()
    return stock


@app.patch("/api/stocks/{stock_id}", response_model=StockOut)
def update_stock(stock_id: int, body: StockUpdate):
    db = get_db()
    existing = db.execute("SELECT * FROM stocks WHERE id=?", (stock_id,)).fetchone()
    if not existing:
        db.close()
        raise HTTPException(404, "Stock not found")
    updates = body.model_dump(exclude_none=True)
    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        db.execute(f"UPDATE stocks SET {sets} WHERE id=?", (*updates.values(), stock_id))
        db.commit()
    stock = dict(db.execute("SELECT * FROM stocks WHERE id=?", (stock_id,)).fetchone())
    db.close()
    return stock


@app.delete("/api/stocks/{stock_id}", status_code=204)
def delete_stock(stock_id: int):
    db = get_db()
    db.execute("DELETE FROM stocks WHERE id=?", (stock_id,))
    db.commit()
    db.close()


@app.get("/api/stocks/search")
def search_symbols(q: str = Query(min_length=1)):
    """Search Yahoo Finance for stock symbols matching the query."""
    import requests

    try:
        resp = requests.get(
            "https://query2.finance.yahoo.com/v1/finance/search",
            params={"q": q, "quotesCount": 8, "newsCount": 0, "listsCount": 0},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=5,
        )
        resp.raise_for_status()
        quotes = resp.json().get("quotes", [])
        return [
            {
                "symbol": item["symbol"],
                "name": item.get("shortname") or item.get("longname") or "",
                "type": item.get("quoteType", ""),
                "exchange": item.get("exchDisp", ""),
            }
            for item in quotes
            if item.get("quoteType") in ("EQUITY", "ETF", "MUTUALFUND", "INDEX")
        ]
    except Exception:
        return []


@app.post("/api/stocks/refresh-prices", response_model=list[StockOut])
def refresh_stock_prices():
    """Fetch latest prices from Yahoo Finance for all stocks with a symbol."""
    import yfinance as yf

    db = get_db()
    stocks = [dict(r) for r in db.execute("SELECT * FROM stocks WHERE symbol != ''").fetchall()]
    if not stocks:
        db.close()
        return []

    symbols = list({s["symbol"] for s in stocks})
    tickers = yf.Tickers(" ".join(symbols))

    price_map: dict[str, float] = {}
    currency_map: dict[str, str] = {}
    for sym in symbols:
        try:
            info = tickers.tickers[sym].info
            price = info.get("regularMarketPrice") or info.get("currentPrice")
            if price is not None:
                price_map[sym] = float(price)
            cur = info.get("currency")
            if cur:
                currency_map[sym] = cur
        except Exception:
            pass

    for stock in stocks:
        sym = stock["symbol"]
        updates = {}
        if sym in price_map:
            updates["price"] = price_map[sym]
        if sym in currency_map:
            updates["currency"] = currency_map[sym]
        if updates:
            sets = ", ".join(f"{k}=?" for k in updates)
            db.execute(f"UPDATE stocks SET {sets} WHERE id=?", (*updates.values(), stock["id"]))

    db.commit()
    updated = [dict(r) for r in db.execute("SELECT * FROM stocks ORDER BY id").fetchall()]
    db.close()
    return updated


@app.get("/api/forex")
def get_forex_rates():
    """Return exchange rates to SGD for all currencies used by stocks."""
    import yfinance as yf

    db = get_db()
    rows = db.execute("SELECT DISTINCT currency FROM stocks WHERE currency != '' AND currency != 'SGD'").fetchall()
    db.close()
    currencies = [row[0] for row in rows]

    rates: dict[str, float] = {"SGD": 1.0}
    for cur in currencies:
        try:
            ticker = yf.Ticker(f"{cur}SGD=X")
            info = ticker.info
            rate = info.get("regularMarketPrice") or info.get("previousClose")
            if rate is not None:
                rates[cur] = float(rate)
        except Exception:
            pass

    return rates


# ── Generic simple-item CRUD factory ─────────────────────────────────────────


def _simple_routes(table: str, tag: str):
    @app.post(f"/api/{tag}", response_model=SimpleItemOut, status_code=201)
    def create(body: SimpleItemCreate):
        db = get_db()
        cur = db.execute(f"INSERT INTO {table} (name, value) VALUES (?,?)", (body.name, body.value))
        db.commit()
        row = dict(db.execute(f"SELECT * FROM {table} WHERE id=?", (cur.lastrowid,)).fetchone())
        db.close()
        return row

    @app.patch(f"/api/{tag}/{{item_id}}", response_model=SimpleItemOut)
    def update(item_id: int, body: SimpleItemUpdate):
        db = get_db()
        existing = db.execute(f"SELECT * FROM {table} WHERE id=?", (item_id,)).fetchone()
        if not existing:
            db.close()
            raise HTTPException(404, "Item not found")
        updates = body.model_dump(exclude_none=True)
        if updates:
            sets = ", ".join(f"{k}=?" for k in updates)
            db.execute(f"UPDATE {table} SET {sets} WHERE id=?", (*updates.values(), item_id))
            db.commit()
        row = dict(db.execute(f"SELECT * FROM {table} WHERE id=?", (item_id,)).fetchone())
        db.close()
        return row

    @app.delete(f"/api/{tag}/{{item_id}}", status_code=204)
    def delete(item_id: int):
        db = get_db()
        db.execute(f"DELETE FROM {table} WHERE id=?", (item_id,))
        db.commit()
        db.close()

    # Give unique names to avoid FastAPI conflicts
    create.__name__ = f"create_{tag}"
    update.__name__ = f"update_{tag}"
    delete.__name__ = f"delete_{tag}"


_simple_routes("bonds", "bonds")
_simple_routes("cash", "cash")
_simple_routes("other_assets", "other")
_simple_routes("insurance", "insurance")
_simple_routes("liabilities", "liabilities")


# ── CPF ──────────────────────────────────────────────────────────────────────


@app.get("/api/cpf", response_model=CPFOut)
def get_cpf():
    db = get_db()
    row = dict(db.execute("SELECT oa, sa, ma FROM cpf WHERE id=1").fetchone())
    db.close()
    return row


@app.patch("/api/cpf", response_model=CPFOut)
def update_cpf(body: CPFUpdate):
    db = get_db()
    updates = body.model_dump(exclude_none=True)
    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        db.execute(f"UPDATE cpf SET {sets} WHERE id=1", (*updates.values(),))
        db.commit()
    row = dict(db.execute("SELECT oa, sa, ma FROM cpf WHERE id=1").fetchone())
    db.close()
    return row


# ── Snapshots ────────────────────────────────────────────────────────────────


@app.get("/api/snapshots", response_model=list[SnapshotOut])
def list_snapshots():
    db = get_db()
    rows = [dict(r) for r in db.execute("SELECT * FROM snapshots ORDER BY date").fetchall()]
    db.close()
    return rows


@app.post("/api/snapshots", response_model=SnapshotOut, status_code=201)
def create_snapshot(body: SnapshotCreate):
    total = body.stocks + body.bonds + body.cash + body.cpf + body.other - body.liab
    db = get_db()
    # Upsert: replace if same date exists
    db.execute(
        """INSERT INTO snapshots (date, stocks, bonds, cash, cpf, other, liab, total)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(date) DO UPDATE SET
             stocks=excluded.stocks, bonds=excluded.bonds, cash=excluded.cash,
             cpf=excluded.cpf, other=excluded.other, liab=excluded.liab, total=excluded.total""",
        (body.date, body.stocks, body.bonds, body.cash, body.cpf, body.other, body.liab, total),
    )
    db.commit()
    row = dict(db.execute("SELECT * FROM snapshots WHERE date=?", (body.date,)).fetchone())
    db.close()
    return row


@app.delete("/api/snapshots/{snapshot_id}", status_code=204)
def delete_snapshot(snapshot_id: int):
    db = get_db()
    db.execute("DELETE FROM snapshots WHERE id=?", (snapshot_id,))
    db.commit()
    db.close()


@app.delete("/api/snapshots", status_code=204)
def delete_all_snapshots():
    db = get_db()
    db.execute("DELETE FROM snapshots")
    db.commit()
    db.close()


# ── Export ───────────────────────────────────────────────────────────────────


@app.get("/api/export")
def export_data():
    db = get_db()
    portfolio = {
        "brokers": [dict(r) for r in db.execute("SELECT * FROM brokers ORDER BY position, id").fetchall()],
        "stocks": [dict(r) for r in db.execute("SELECT * FROM stocks ORDER BY id").fetchall()],
        "bonds": [dict(r) for r in db.execute("SELECT * FROM bonds ORDER BY id").fetchall()],
        "cash": [dict(r) for r in db.execute("SELECT * FROM cash ORDER BY id").fetchall()],
        "other": [dict(r) for r in db.execute("SELECT * FROM other_assets ORDER BY id").fetchall()],
        "liabilities": [dict(r) for r in db.execute("SELECT * FROM liabilities ORDER BY id").fetchall()],
        "cpf": dict(db.execute("SELECT oa, sa, ma FROM cpf WHERE id=1").fetchone()),
        "snapshots": [dict(r) for r in db.execute("SELECT * FROM snapshots ORDER BY date").fetchall()],
    }
    db.close()
    return JSONResponse(content=portfolio)
