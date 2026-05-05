import io
import time
from collections import defaultdict
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from auth import create_token, get_current_user, hash_password, verify_password
from database import get_db, init_db
from models import (
    AuthRequest,
    BrokerCashCreate,
    BrokerCashOut,
    BrokerCashUpdate,
    BrokerCreate,
    BrokerOut,
    BrokerUpdate,
    CPFOut,
    CPFUpdate,
    CurrencyItemCreate,
    CurrencyItemOut,
    CurrencyItemUpdate,
    PortfolioOut,
    SimpleItemCreate,
    SimpleItemOut,
    SimpleItemUpdate,
    SnapshotCreate,
    SnapshotOut,
    StockCreate,
    StockOut,
    StockUpdate,
    TokenOut,
    UserOut,
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


# ── Auth ────────────────────────────────────────────────────────────────────


@app.post("/api/auth/signup", response_model=TokenOut, status_code=201)
def signup(body: AuthRequest):
    if len(body.username.strip()) < 1:
        raise HTTPException(400, "Username is required")
    if len(body.password) < 4:
        raise HTTPException(400, "Password must be at least 4 characters")
    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username=?", (body.username.strip(),)).fetchone()
    if existing:
        db.close()
        raise HTTPException(409, "Username already taken")
    cur = db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (body.username.strip(), hash_password(body.password)),
    )
    user_id = cur.lastrowid
    # Initialize CPF row for new user
    db.execute("INSERT OR IGNORE INTO cpf (user_id, oa, sa, ma) VALUES (?, 0, 0, 0)", (user_id,))
    db.commit()
    db.close()
    return TokenOut(access_token=create_token(user_id))


MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_SECONDS = 30
# {username: {"count": int, "locked_until": float}}
_login_attempts: dict[str, dict] = defaultdict(lambda: {"count": 0, "locked_until": 0.0})


@app.post("/api/auth/login", response_model=TokenOut)
def login(body: AuthRequest):
    username = body.username.strip()
    record = _login_attempts[username]
    now = time.time()

    if record["count"] >= MAX_LOGIN_ATTEMPTS and now < record["locked_until"]:
        remaining = int(record["locked_until"] - now) + 1
        raise HTTPException(429, f"Too many failed attempts. Try again in {remaining}s.")

    if now >= record["locked_until"]:
        if record["count"] >= MAX_LOGIN_ATTEMPTS:
            record["count"] = 0
            record["locked_until"] = 0.0

    db = get_db()
    user = db.execute("SELECT id, password_hash FROM users WHERE username=?", (username,)).fetchone()
    db.close()
    if not user or not verify_password(body.password, user["password_hash"]):
        record["count"] += 1
        remaining_attempts = MAX_LOGIN_ATTEMPTS - record["count"]
        if record["count"] >= MAX_LOGIN_ATTEMPTS:
            record["locked_until"] = now + LOCKOUT_SECONDS
            raise HTTPException(429, f"Too many failed attempts. Try again in {LOCKOUT_SECONDS}s.")
        msg = "Invalid username or password."
        if remaining_attempts <= 2:
            msg += f" {remaining_attempts} attempt(s) remaining."
        raise HTTPException(401, msg)

    record["count"] = 0
    record["locked_until"] = 0.0
    return TokenOut(access_token=create_token(user["id"]))


@app.get("/api/auth/me", response_model=UserOut)
def get_me(user_id: int = Depends(get_current_user)):
    db = get_db()
    user = db.execute("SELECT id, username FROM users WHERE id=?", (user_id,)).fetchone()
    db.close()
    if not user:
        raise HTTPException(404, "User not found")
    return dict(user)


# ── Portfolio (read-only aggregate) ──────────────────────────────────────────


@app.get("/api/portfolio", response_model=PortfolioOut)
def get_portfolio(user_id: int = Depends(get_current_user)):
    db = get_db()
    brokers = [dict(r) for r in db.execute("SELECT * FROM brokers WHERE user_id=? ORDER BY position, id", (user_id,)).fetchall()]
    broker_ids = [b["id"] for b in brokers]
    if broker_ids:
        placeholders = ",".join("?" * len(broker_ids))
        stocks = [dict(r) for r in db.execute(f"SELECT * FROM stocks WHERE broker_id IN ({placeholders}) ORDER BY id", broker_ids).fetchall()]
        broker_cash = [dict(r) for r in db.execute(f"SELECT * FROM broker_cash WHERE broker_id IN ({placeholders}) ORDER BY id", broker_ids).fetchall()]
    else:
        stocks = []
        broker_cash = []
    bonds = [dict(r) for r in db.execute("SELECT * FROM bonds WHERE user_id=? ORDER BY id", (user_id,)).fetchall()]
    cash = [dict(r) for r in db.execute("SELECT * FROM cash WHERE user_id=? ORDER BY id", (user_id,)).fetchall()]
    other = [dict(r) for r in db.execute("SELECT * FROM other_assets WHERE user_id=? ORDER BY id", (user_id,)).fetchall()]
    other_liquid = [dict(r) for r in db.execute("SELECT * FROM other_assets_liquid WHERE user_id=? ORDER BY id", (user_id,)).fetchall()]
    insurance = [dict(r) for r in db.execute("SELECT * FROM insurance WHERE user_id=? ORDER BY id", (user_id,)).fetchall()]
    liabilities = [dict(r) for r in db.execute("SELECT * FROM liabilities WHERE user_id=? ORDER BY id", (user_id,)).fetchall()]
    cpf_row = db.execute("SELECT oa, sa, ma FROM cpf WHERE user_id=?", (user_id,)).fetchone()
    db.close()
    cpf = CPFOut(**(dict(cpf_row) if cpf_row else {"oa": 0, "sa": 0, "ma": 0}))
    return PortfolioOut(
        brokers=brokers,
        stocks=stocks,
        broker_cash=broker_cash,
        bonds=bonds,
        cash=cash,
        other=other,
        other_liquid=other_liquid,
        insurance=insurance,
        liabilities=liabilities,
        cpf=cpf,
    )


# ── Brokers ──────────────────────────────────────────────────────────────────


@app.post("/api/brokers", response_model=BrokerOut, status_code=201)
def create_broker(body: BrokerCreate, user_id: int = Depends(get_current_user)):
    db = get_db()
    max_pos = db.execute("SELECT COALESCE(MAX(position),0) FROM brokers WHERE user_id=?", (user_id,)).fetchone()[0]
    existing = db.execute("SELECT id FROM brokers WHERE user_id=? AND name=?", (user_id, body.name)).fetchone()
    if existing:
        db.close()
        raise HTTPException(400, "Broker already exists")
    cur = db.execute(
        "INSERT INTO brokers (user_id, name, position) VALUES (?, ?, ?)",
        (user_id, body.name, max_pos + 1),
    )
    db.commit()
    broker = dict(db.execute("SELECT * FROM brokers WHERE id=?", (cur.lastrowid,)).fetchone())
    db.close()
    return broker


@app.patch("/api/brokers/{broker_id}", response_model=BrokerOut)
def update_broker(broker_id: int, body: BrokerUpdate, user_id: int = Depends(get_current_user)):
    db = get_db()
    existing = db.execute("SELECT * FROM brokers WHERE id=? AND user_id=?", (broker_id, user_id)).fetchone()
    if not existing:
        db.close()
        raise HTTPException(404, "Broker not found")
    updates = body.model_dump(exclude_none=True)
    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        db.execute(f"UPDATE brokers SET {sets} WHERE id=? AND user_id=?", (*updates.values(), broker_id, user_id))
        db.commit()
    broker = dict(db.execute("SELECT * FROM brokers WHERE id=?", (broker_id,)).fetchone())
    db.close()
    return broker


@app.delete("/api/brokers/{broker_id}", status_code=204)
def delete_broker(broker_id: int, user_id: int = Depends(get_current_user)):
    db = get_db()
    existing = db.execute("SELECT id FROM brokers WHERE id=? AND user_id=?", (broker_id, user_id)).fetchone()
    if not existing:
        db.close()
        raise HTTPException(404, "Broker not found")
    db.execute("DELETE FROM brokers WHERE id=? AND user_id=?", (broker_id, user_id))
    db.commit()
    db.close()


# ── Broker Cash ─────────────────────────────────────────────────────────────


@app.post("/api/broker-cash", response_model=BrokerCashOut, status_code=201)
def create_broker_cash(body: BrokerCashCreate, user_id: int = Depends(get_current_user)):
    db = get_db()
    broker = db.execute("SELECT id FROM brokers WHERE id=? AND user_id=?", (body.broker_id, user_id)).fetchone()
    if not broker:
        db.close()
        raise HTTPException(404, "Broker not found")
    cur = db.execute(
        "INSERT INTO broker_cash (broker_id, currency, amount) VALUES (?, ?, 0)",
        (body.broker_id, body.currency),
    )
    db.commit()
    row = dict(db.execute("SELECT * FROM broker_cash WHERE id=?", (cur.lastrowid,)).fetchone())
    db.close()
    return row


@app.patch("/api/broker-cash/{cash_id}", response_model=BrokerCashOut)
def update_broker_cash(cash_id: int, body: BrokerCashUpdate, user_id: int = Depends(get_current_user)):
    db = get_db()
    existing = db.execute(
        "SELECT bc.* FROM broker_cash bc JOIN brokers b ON bc.broker_id=b.id WHERE bc.id=? AND b.user_id=?",
        (cash_id, user_id),
    ).fetchone()
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
def delete_broker_cash(cash_id: int, user_id: int = Depends(get_current_user)):
    db = get_db()
    existing = db.execute(
        "SELECT bc.id FROM broker_cash bc JOIN brokers b ON bc.broker_id=b.id WHERE bc.id=? AND b.user_id=?",
        (cash_id, user_id),
    ).fetchone()
    if not existing:
        db.close()
        raise HTTPException(404, "Broker cash not found")
    db.execute("DELETE FROM broker_cash WHERE id=?", (cash_id,))
    db.commit()
    db.close()


# ── Stocks ───────────────────────────────────────────────────────────────────


@app.post("/api/stocks", response_model=StockOut, status_code=201)
def create_stock(body: StockCreate, user_id: int = Depends(get_current_user)):
    db = get_db()
    broker = db.execute("SELECT id FROM brokers WHERE id=? AND user_id=?", (body.broker_id, user_id)).fetchone()
    if not broker:
        db.close()
        raise HTTPException(404, "Broker not found")
    cur = db.execute(
        "INSERT INTO stocks (broker_id, symbol, shares, cost, price, currency) VALUES (?,?,?,?,?,?)",
        (body.broker_id, body.symbol, body.shares, body.cost, body.price, body.currency),
    )
    db.commit()
    stock = dict(db.execute("SELECT * FROM stocks WHERE id=?", (cur.lastrowid,)).fetchone())
    db.close()
    return stock


@app.patch("/api/stocks/{stock_id}", response_model=StockOut)
def update_stock(stock_id: int, body: StockUpdate, user_id: int = Depends(get_current_user)):
    db = get_db()
    existing = db.execute(
        "SELECT s.* FROM stocks s JOIN brokers b ON s.broker_id=b.id WHERE s.id=? AND b.user_id=?",
        (stock_id, user_id),
    ).fetchone()
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
def delete_stock(stock_id: int, user_id: int = Depends(get_current_user)):
    db = get_db()
    existing = db.execute(
        "SELECT s.id FROM stocks s JOIN brokers b ON s.broker_id=b.id WHERE s.id=? AND b.user_id=?",
        (stock_id, user_id),
    ).fetchone()
    if not existing:
        db.close()
        raise HTTPException(404, "Stock not found")
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
def refresh_stock_prices(user_id: int = Depends(get_current_user)):
    """Fetch latest prices from Yahoo Finance for all stocks with a symbol."""
    import yfinance as yf

    db = get_db()
    stocks = [
        dict(r)
        for r in db.execute(
            "SELECT s.* FROM stocks s JOIN brokers b ON s.broker_id=b.id WHERE s.symbol != '' AND b.user_id=?",
            (user_id,),
        ).fetchall()
    ]
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
    # Return only this user's stocks
    broker_ids = [b["id"] for b in db.execute("SELECT id FROM brokers WHERE user_id=?", (user_id,)).fetchall()]
    if broker_ids:
        placeholders = ",".join("?" * len(broker_ids))
        updated = [dict(r) for r in db.execute(f"SELECT * FROM stocks WHERE broker_id IN ({placeholders}) ORDER BY id", broker_ids).fetchall()]
    else:
        updated = []
    db.close()
    return updated


@app.get("/api/forex")
def get_forex_rates(user_id: int = Depends(get_current_user)):
    """Return exchange rates to SGD for all currencies used by stocks and other liquid assets."""
    import yfinance as yf

    db = get_db()
    rows = db.execute(
        "SELECT DISTINCT s.currency FROM stocks s JOIN brokers b ON s.broker_id=b.id WHERE s.currency != '' AND s.currency != 'SGD' AND b.user_id=?",
        (user_id,),
    ).fetchall()
    other_liquid_rows = db.execute(
        "SELECT DISTINCT currency FROM other_assets_liquid WHERE currency != 'SGD' AND user_id=?",
        (user_id,),
    ).fetchall()
    other_rows = db.execute(
        "SELECT DISTINCT currency FROM other_assets WHERE currency != 'SGD' AND user_id=?",
        (user_id,),
    ).fetchall()
    db.close()
    currencies = list(set([row[0] for row in rows] + [row[0] for row in other_liquid_rows] + [row[0] for row in other_rows]))

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
    def create(body: SimpleItemCreate, user_id: int = Depends(get_current_user)):
        db = get_db()
        cur = db.execute(f"INSERT INTO {table} (user_id, name, value) VALUES (?,?,?)", (user_id, body.name, body.value))
        db.commit()
        row = dict(db.execute(f"SELECT * FROM {table} WHERE id=?", (cur.lastrowid,)).fetchone())
        db.close()
        return row

    @app.patch(f"/api/{tag}/{{item_id}}", response_model=SimpleItemOut)
    def update(item_id: int, body: SimpleItemUpdate, user_id: int = Depends(get_current_user)):
        db = get_db()
        existing = db.execute(f"SELECT * FROM {table} WHERE id=? AND user_id=?", (item_id, user_id)).fetchone()
        if not existing:
            db.close()
            raise HTTPException(404, "Item not found")
        updates = body.model_dump(exclude_none=True)
        if updates:
            sets = ", ".join(f"{k}=?" for k in updates)
            db.execute(f"UPDATE {table} SET {sets} WHERE id=? AND user_id=?", (*updates.values(), item_id, user_id))
            db.commit()
        row = dict(db.execute(f"SELECT * FROM {table} WHERE id=?", (item_id,)).fetchone())
        db.close()
        return row

    @app.delete(f"/api/{tag}/{{item_id}}", status_code=204)
    def delete(item_id: int, user_id: int = Depends(get_current_user)):
        db = get_db()
        existing = db.execute(f"SELECT id FROM {table} WHERE id=? AND user_id=?", (item_id, user_id)).fetchone()
        if not existing:
            db.close()
            raise HTTPException(404, "Item not found")
        db.execute(f"DELETE FROM {table} WHERE id=? AND user_id=?", (item_id, user_id))
        db.commit()
        db.close()

    create.__name__ = f"create_{tag}"
    update.__name__ = f"update_{tag}"
    delete.__name__ = f"delete_{tag}"


_simple_routes("bonds", "bonds")
_simple_routes("cash", "cash")
_simple_routes("insurance", "insurance")
_simple_routes("liabilities", "liabilities")


# ── Currency-aware item CRUD factory ─────────────────────────────────────────


def _currency_routes(table: str, tag: str):
    @app.post(f"/api/{tag}", response_model=CurrencyItemOut, status_code=201)
    def create(body: CurrencyItemCreate, user_id: int = Depends(get_current_user)):
        db = get_db()
        cur = db.execute(
            f"INSERT INTO {table} (user_id, name, value, currency) VALUES (?,?,?,?)",
            (user_id, body.name, body.value, body.currency),
        )
        db.commit()
        row = dict(db.execute(f"SELECT * FROM {table} WHERE id=?", (cur.lastrowid,)).fetchone())
        db.close()
        return row

    @app.patch(f"/api/{tag}/{{item_id}}", response_model=CurrencyItemOut)
    def update(item_id: int, body: CurrencyItemUpdate, user_id: int = Depends(get_current_user)):
        db = get_db()
        existing = db.execute(f"SELECT * FROM {table} WHERE id=? AND user_id=?", (item_id, user_id)).fetchone()
        if not existing:
            db.close()
            raise HTTPException(404, "Item not found")
        updates = body.model_dump(exclude_none=True)
        if updates:
            sets = ", ".join(f"{k}=?" for k in updates)
            db.execute(f"UPDATE {table} SET {sets} WHERE id=? AND user_id=?", (*updates.values(), item_id, user_id))
            db.commit()
        row = dict(db.execute(f"SELECT * FROM {table} WHERE id=?", (item_id,)).fetchone())
        db.close()
        return row

    @app.delete(f"/api/{tag}/{{item_id}}", status_code=204)
    def delete(item_id: int, user_id: int = Depends(get_current_user)):
        db = get_db()
        existing = db.execute(f"SELECT id FROM {table} WHERE id=? AND user_id=?", (item_id, user_id)).fetchone()
        if not existing:
            db.close()
            raise HTTPException(404, "Item not found")
        db.execute(f"DELETE FROM {table} WHERE id=? AND user_id=?", (item_id, user_id))
        db.commit()
        db.close()

    create.__name__ = f"create_{tag}"
    update.__name__ = f"update_{tag}"
    delete.__name__ = f"delete_{tag}"


_currency_routes("other_assets", "other")
_currency_routes("other_assets_liquid", "other_liquid")


# ── CPF ──────────────────────────────────────────────────────────────────────


@app.get("/api/cpf", response_model=CPFOut)
def get_cpf(user_id: int = Depends(get_current_user)):
    db = get_db()
    row = db.execute("SELECT oa, sa, ma FROM cpf WHERE user_id=?", (user_id,)).fetchone()
    db.close()
    if not row:
        return CPFOut(oa=0, sa=0, ma=0)
    return CPFOut(**dict(row))


@app.patch("/api/cpf", response_model=CPFOut)
def update_cpf(body: CPFUpdate, user_id: int = Depends(get_current_user)):
    db = get_db()
    existing = db.execute("SELECT id FROM cpf WHERE user_id=?", (user_id,)).fetchone()
    if not existing:
        db.execute("INSERT INTO cpf (user_id, oa, sa, ma) VALUES (?, 0, 0, 0)", (user_id,))
        db.commit()
    updates = body.model_dump(exclude_none=True)
    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        db.execute(f"UPDATE cpf SET {sets} WHERE user_id=?", (*updates.values(), user_id))
        db.commit()
    row = dict(db.execute("SELECT oa, sa, ma FROM cpf WHERE user_id=?", (user_id,)).fetchone())
    db.close()
    return row


# ── Snapshots ────────────────────────────────────────────────────────────────


@app.get("/api/snapshots", response_model=list[SnapshotOut])
def list_snapshots(user_id: int = Depends(get_current_user)):
    db = get_db()
    rows = [dict(r) for r in db.execute("SELECT * FROM snapshots WHERE user_id=? ORDER BY date", (user_id,)).fetchall()]
    db.close()
    return rows


@app.post("/api/snapshots", response_model=SnapshotOut, status_code=201)
def create_snapshot(body: SnapshotCreate, user_id: int = Depends(get_current_user)):
    total = body.stocks + body.bonds + body.cash + body.cpf + body.other - body.liab
    db = get_db()
    db.execute(
        """INSERT INTO snapshots (user_id, date, stocks, bonds, cash, cpf, other, liab, total)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON CONFLICT(user_id, date) DO UPDATE SET
             stocks=excluded.stocks, bonds=excluded.bonds, cash=excluded.cash,
             cpf=excluded.cpf, other=excluded.other, liab=excluded.liab, total=excluded.total""",
        (user_id, body.date, body.stocks, body.bonds, body.cash, body.cpf, body.other, body.liab, total),
    )
    db.commit()
    row = dict(db.execute("SELECT * FROM snapshots WHERE user_id=? AND date=?", (user_id, body.date)).fetchone())
    db.close()
    return row


@app.delete("/api/snapshots/{snapshot_id}", status_code=204)
def delete_snapshot(snapshot_id: int, user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute("DELETE FROM snapshots WHERE id=? AND user_id=?", (snapshot_id, user_id))
    db.commit()
    db.close()


@app.delete("/api/snapshots", status_code=204)
def delete_all_snapshots(user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute("DELETE FROM snapshots WHERE user_id=?", (user_id,))
    db.commit()
    db.close()


# ── Export ───────────────────────────────────────────────────────────────────


@app.get("/api/export")
def export_data(user_id: int = Depends(get_current_user)):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    db = get_db()
    brokers = [dict(r) for r in db.execute("SELECT * FROM brokers WHERE user_id=? ORDER BY position, id", (user_id,)).fetchall()]
    broker_ids = [b["id"] for b in brokers]
    if broker_ids:
        placeholders = ",".join("?" * len(broker_ids))
        stocks = [dict(r) for r in db.execute(f"SELECT * FROM stocks WHERE broker_id IN ({placeholders}) ORDER BY id", broker_ids).fetchall()]
        broker_cash_rows = [dict(r) for r in db.execute(f"SELECT * FROM broker_cash WHERE broker_id IN ({placeholders}) ORDER BY id", broker_ids).fetchall()]
    else:
        stocks = []
        broker_cash_rows = []
    bonds = [dict(r) for r in db.execute("SELECT * FROM bonds WHERE user_id=? ORDER BY id", (user_id,)).fetchall()]
    cash = [dict(r) for r in db.execute("SELECT * FROM cash WHERE user_id=? ORDER BY id", (user_id,)).fetchall()]
    other = [dict(r) for r in db.execute("SELECT * FROM other_assets WHERE user_id=? ORDER BY id", (user_id,)).fetchall()]
    other_liquid = [dict(r) for r in db.execute("SELECT * FROM other_assets_liquid WHERE user_id=? ORDER BY id", (user_id,)).fetchall()]
    insurance = [dict(r) for r in db.execute("SELECT * FROM insurance WHERE user_id=? ORDER BY id", (user_id,)).fetchall()]
    liabilities = [dict(r) for r in db.execute("SELECT * FROM liabilities WHERE user_id=? ORDER BY id", (user_id,)).fetchall()]
    cpf_row = db.execute("SELECT oa, sa, ma FROM cpf WHERE user_id=?", (user_id,)).fetchone()
    cpf = dict(cpf_row) if cpf_row else {"oa": 0, "sa": 0, "ma": 0}
    db.close()

    wb = Workbook()
    ws = wb.active
    ws.title = "Net Worth"

    header_font = Font(bold=True)
    header_fill = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
    ws.append(["Category", "Item", "Value (SGD)"])
    for col in range(1, 4):
        cell = ws.cell(row=1, column=col)
        cell.font = header_font
        cell.fill = header_fill

    # Fetch forex rates for currency conversion to SGD
    import yfinance as yf

    currencies = set()
    for s in stocks:
        if s["currency"] and s["currency"] != "SGD":
            currencies.add(s["currency"])
    for c in broker_cash_rows:
        if c["currency"] and c["currency"] != "SGD":
            currencies.add(c["currency"])
    for item in other_liquid:
        if item["currency"] and item["currency"] != "SGD":
            currencies.add(item["currency"])
    for item in other:
        if item.get("currency") and item["currency"] != "SGD":
            currencies.add(item["currency"])

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

    def to_sgd(amount: float, currency: str) -> float:
        return amount * rates.get(currency, 1.0)

    grand_total = 0.0

    # Equity — grouped by broker
    for broker in brokers:
        broker_stocks = [s for s in stocks if s["broker_id"] == broker["id"]]
        broker_cash_items = [c for c in broker_cash_rows if c["broker_id"] == broker["id"]]
        stock_total = sum(to_sgd(s["shares"] * s["price"], s.get("currency", "SGD")) for s in broker_stocks)
        cash_total = sum(to_sgd(c["amount"], c.get("currency", "SGD")) for c in broker_cash_items)
        broker_total = stock_total + cash_total
        ws.append(["Equity", broker["name"], broker_total])
        grand_total += broker_total

    # Bonds
    for item in bonds:
        ws.append(["Bonds", item["name"] or "—", item["value"]])
        grand_total += item["value"]

    # Cash
    for item in cash:
        ws.append(["Cash", item["name"] or "—", item["value"]])
        grand_total += item["value"]

    # Other Assets (Liquid)
    for item in other_liquid:
        sgd_val = to_sgd(item["value"], item.get("currency", "SGD"))
        ws.append(["Other (Liquid)", item["name"] or "—", sgd_val])
        grand_total += sgd_val

    # CPF
    for key, label in [("oa", "Ordinary Account"), ("sa", "Special Account"), ("ma", "Medisave Account")]:
        ws.append(["CPF", label, cpf[key]])
        grand_total += cpf[key]

    # Insurance
    for item in insurance:
        ws.append(["Insurance", item["name"] or "—", item["value"]])
        grand_total += item["value"]

    # Other Assets (Illiquid)
    for item in other:
        sgd_val = to_sgd(item["value"], item.get("currency", "SGD"))
        ws.append(["Other (Illiquid)", item["name"] or "—", sgd_val])
        grand_total += sgd_val

    # Liabilities (subtract)
    for item in liabilities:
        ws.append(["Liabilities", item["name"] or "—", -abs(item["value"])])
        grand_total -= abs(item["value"])

    # Total row
    ws.append([])
    total_row = ws.max_row + 1
    ws.append(["TOTAL", "", grand_total])
    for col in range(1, 4):
        ws.cell(row=total_row, column=col).font = Font(bold=True)

    # Auto-size columns
    ws.column_dimensions["A"].width = 15
    ws.column_dimensions["B"].width = 40
    ws.column_dimensions["C"].width = 18

    # Format value column as numbers
    for row in range(2, ws.max_row + 1):
        cell = ws.cell(row=row, column=3)
        if isinstance(cell.value, (int, float)):
            cell.number_format = '#,##0.00'

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=networth-export.xlsx"},
    )


# ── Serve frontend static files (production) ────────────────────────────────

STATIC_DIR = Path(__file__).parent / "static"

if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="static-assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        """Serve the React SPA for all non-API routes."""
        file = STATIC_DIR / full_path
        if file.is_file():
            return FileResponse(file)
        return FileResponse(STATIC_DIR / "index.html")
