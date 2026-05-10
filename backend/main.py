import io
import time
from collections import defaultdict
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from auth import create_token, get_current_user, hash_password, require_admin, verify_password
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
    PositionCreate,
    PositionOut,
    PositionUpdate,
    BuyCreate,
    BuyOut,
    BuyUpdate,
    SellCreate,
    SellOut,
    SellUpdate,
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
    hint = body.password[0] + "*" * (len(body.password) - 1)
    cur = db.execute(
        "INSERT INTO users (username, password_hash, password_hint) VALUES (?, ?, ?)",
        (body.username.strip(), hash_password(body.password), hint),
    )
    user_id = cur.lastrowid
    # Initialize CPF row for new user
    db.execute("INSERT OR IGNORE INTO cpf (user_id, oa, sa, ma, ra) VALUES (?, 0, 0, 0, 0)", (user_id,))
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


@app.post("/api/auth/password-hint")
def password_hint(body: dict):
    username = (body.get("username") or "").strip()
    if not username:
        raise HTTPException(400, "Username is required")
    db = get_db()
    user = db.execute("SELECT password_hint FROM users WHERE username=?", (username,)).fetchone()
    db.close()
    if not user or not user["password_hint"]:
        raise HTTPException(404, "No hint available for this username")
    return {"hint": user["password_hint"]}


@app.get("/api/auth/me", response_model=UserOut)
def get_me(user_id: int = Depends(get_current_user)):
    db = get_db()
    user = db.execute("SELECT id, username, is_admin FROM users WHERE id=?", (user_id,)).fetchone()
    db.close()
    if not user:
        raise HTTPException(404, "User not found")
    return dict(user)


# ── Admin ──────────────────────────────────────────────────────────────────


@app.get("/api/admin/users")
def list_users(_: int = Depends(require_admin)):
    db = get_db()
    users = [dict(r) for r in db.execute(
        "SELECT id, username, is_admin, created_at FROM users ORDER BY id"
    ).fetchall()]
    db.close()
    return users


@app.delete("/api/admin/users/{user_id}")
def delete_user(user_id: int, admin_id: int = Depends(require_admin)):
    if user_id == admin_id:
        raise HTTPException(400, "Cannot delete yourself")
    db = get_db()
    user = db.execute("SELECT id, is_admin FROM users WHERE id=?", (user_id,)).fetchone()
    if not user:
        db.close()
        raise HTTPException(404, "User not found")
    if user["is_admin"]:
        db.close()
        raise HTTPException(400, "Cannot delete an admin user")
    # Delete all user data
    for table in ["stocks", "broker_cash"]:
        db.execute(f"DELETE FROM {table} WHERE broker_id IN (SELECT id FROM brokers WHERE user_id=?)", (user_id,))
    for table in ["position_sells", "position_buys"]:
        db.execute(f"DELETE FROM {table} WHERE position_id IN (SELECT id FROM stock_positions WHERE user_id=?)", (user_id,))
    for table in ["brokers", "stock_positions", "bonds", "cash", "other_assets", "other_assets_liquid", "insurance", "liabilities", "cpf", "snapshots"]:
        db.execute(f"DELETE FROM {table} WHERE user_id=?", (user_id,))
    db.execute("DELETE FROM users WHERE id=?", (user_id,))
    db.commit()
    db.close()
    return {"deleted": user_id}


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
    cpf_row = db.execute("SELECT oa, sa, ma, ra FROM cpf WHERE user_id=?", (user_id,)).fetchone()
    db.close()
    cpf = CPFOut(**(dict(cpf_row) if cpf_row else {"oa": 0, "sa": 0, "ma": 0, "ra": 0}))
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


_symbol_cache: dict[str, tuple[float, list]] = {}
_SYMBOL_CACHE_TTL = 300  # 5 minutes


def _search_yahoo(q: str) -> list:
    import requests

    now = time.time()
    key = q.upper().strip()
    cached = _symbol_cache.get(key)
    if cached and now - cached[0] < _SYMBOL_CACHE_TTL:
        return cached[1]

    try:
        resp = requests.get(
            "https://query2.finance.yahoo.com/v1/finance/search",
            params={"q": q, "quotesCount": 8, "newsCount": 0, "listsCount": 0},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=5,
        )
        resp.raise_for_status()
        quotes = resp.json().get("quotes", [])
        results = [
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
        results = []

    _symbol_cache[key] = (now, results)
    return results


@app.get("/api/stocks/search")
def search_symbols(q: str = Query(min_length=1)):
    """Search Yahoo Finance for stock symbols matching the query."""
    return _search_yahoo(q)


@app.get("/api/stocks/price")
def get_stock_price(symbol: str = Query(min_length=1)):
    """Fetch the current price and currency for a single stock symbol."""
    import yfinance as yf

    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        price = info.get("regularMarketPrice") or info.get("currentPrice")
        currency = info.get("currency", "USD")
        if price is not None:
            return {"symbol": symbol, "price": float(price), "currency": currency}
    except Exception:
        pass
    return {"symbol": symbol, "price": None, "currency": None}


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
    row = db.execute("SELECT oa, sa, ma, ra FROM cpf WHERE user_id=?", (user_id,)).fetchone()
    db.close()
    if not row:
        return CPFOut(oa=0, sa=0, ma=0, ra=0)
    return CPFOut(**dict(row))


@app.patch("/api/cpf", response_model=CPFOut)
def update_cpf(body: CPFUpdate, user_id: int = Depends(get_current_user)):
    db = get_db()
    existing = db.execute("SELECT id FROM cpf WHERE user_id=?", (user_id,)).fetchone()
    if not existing:
        db.execute("INSERT INTO cpf (user_id, oa, sa, ma, ra) VALUES (?, 0, 0, 0, 0)", (user_id,))
        db.commit()
    updates = body.model_dump(exclude_none=True)
    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        db.execute(f"UPDATE cpf SET {sets} WHERE user_id=?", (*updates.values(), user_id))
        db.commit()
    row = dict(db.execute("SELECT oa, sa, ma, ra FROM cpf WHERE user_id=?", (user_id,)).fetchone())
    db.close()
    return row


def _scrape_cpf_limits() -> dict | None:
    """Try to scrape current FRS and BHS from CPF website. Returns dict or None."""
    import re
    import requests

    results = {}

    # Scrape FRS and ERS
    try:
        resp = requests.get(
            "https://www.cpf.gov.sg/service/article/how-much-is-my-full-retirement-sum",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=10,
        )
        resp.raise_for_status()
        # Look for FRS amount pattern like "$213,000" or "$220,400"
        matches = re.findall(r'\$\s?([\d,]+)', resp.text)
        # FRS is typically the largest amount on the page (Full Retirement Sum > Enhanced > Basic)
        amounts = [int(m.replace(',', '')) for m in matches if int(m.replace(',', '')) > 100000]
        if amounts:
            # Sort and pick values that look like retirement sums (100k-500k range)
            retirement_sums = sorted(set(a for a in amounts if 100000 < a < 500000))
            if len(retirement_sums) >= 3:
                # BRS < FRS < ERS: pick middle for FRS, largest for ERS
                results['frs'] = retirement_sums[len(retirement_sums) // 2]
                results['ers'] = retirement_sums[-1]
            elif len(retirement_sums) >= 2:
                results['frs'] = retirement_sums[0]
                results['ers'] = retirement_sums[1]
            elif retirement_sums:
                results['frs'] = retirement_sums[0]
                results['ers'] = int(retirement_sums[0] * 2)
    except Exception:
        pass

    # Scrape BHS
    try:
        resp = requests.get(
            "https://www.cpf.gov.sg/service/article/what-is-the-basic-healthcare-sum",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=10,
        )
        resp.raise_for_status()
        matches = re.findall(r'\$\s?([\d,]+)', resp.text)
        amounts = [int(m.replace(',', '')) for m in matches if int(m.replace(',', '')) > 50000]
        # BHS is typically in the 50k-120k range
        bhs_candidates = sorted(set(a for a in amounts if 50000 < a < 150000))
        if bhs_candidates:
            results['bhs'] = bhs_candidates[-1]  # Latest/highest BHS
    except Exception:
        pass

    return results if ('frs' in results and 'bhs' in results and 'ers' in results) else None


def _validate_scraped_limits(scraped: dict, prev_frs: float, prev_bhs: float, prev_ers: float) -> bool:
    """Check scraped values are reasonable — within 20% of previous year."""
    frs_ok = 0.8 * prev_frs <= scraped['frs'] <= 1.2 * prev_frs
    bhs_ok = 0.8 * prev_bhs <= scraped['bhs'] <= 1.2 * prev_bhs
    ers_ok = prev_ers == 0 or (0.8 * prev_ers <= scraped['ers'] <= 1.2 * prev_ers)
    return frs_ok and bhs_ok and ers_ok


@app.get("/api/cpf/limits")
def get_cpf_limits():
    """Return FRS and BHS for the current year. Auto-scrapes if missing."""
    from datetime import date

    current_year = date.today().year
    db = get_db()

    # Check if current year exists
    row = db.execute(
        "SELECT frs, bhs, ers FROM cpf_limits WHERE year=?", (current_year,)
    ).fetchone()

    if row:
        db.close()
        return {"frs": row["frs"], "bhs": row["bhs"], "ers": row["ers"], "year": current_year, "outdated": False}

    # Get latest known values as fallback
    prev = db.execute(
        "SELECT year, frs, bhs, ers FROM cpf_limits ORDER BY year DESC LIMIT 1"
    ).fetchone()

    if not prev:
        db.close()
        return {"frs": 0, "bhs": 0, "ers": 0, "year": current_year, "outdated": True}

    # Try auto-scrape
    scraped = _scrape_cpf_limits()
    if scraped and _validate_scraped_limits(scraped, prev["frs"], prev["bhs"], prev["ers"]):
        db.execute(
            "INSERT OR REPLACE INTO cpf_limits (year, frs, bhs, ers) VALUES (?, ?, ?, ?)",
            (current_year, scraped["frs"], scraped["bhs"], scraped["ers"]),
        )
        db.commit()
        db.close()
        return {"frs": scraped["frs"], "bhs": scraped["bhs"], "ers": scraped["ers"], "year": current_year, "outdated": False}

    # Scrape failed or values look wrong — return previous year with outdated flag
    db.close()
    return {"frs": prev["frs"], "bhs": prev["bhs"], "ers": prev["ers"], "year": prev["year"], "outdated": True}


@app.put("/api/cpf/limits")
def update_cpf_limits(frs: float = Query(gt=0), bhs: float = Query(gt=0), ers: float = Query(gt=0), _: int = Depends(require_admin)):
    """Manually set FRS, BHS and ERS for the current year. Admin only."""
    from datetime import date

    current_year = date.today().year
    db = get_db()
    db.execute(
        "INSERT OR REPLACE INTO cpf_limits (year, frs, bhs, ers) VALUES (?, ?, ?, ?)",
        (current_year, frs, bhs, ers),
    )
    db.commit()
    db.close()
    return {"frs": frs, "bhs": bhs, "ers": ers, "year": current_year, "outdated": False}


# ── Stock Positions (Stocks tab) ────────────────────────────────────────────


@app.get("/api/positions", response_model=list[PositionOut])
def list_positions(user_id: int = Depends(get_current_user)):
    db = get_db()
    rows = [dict(r) for r in db.execute("SELECT * FROM stock_positions WHERE user_id=? ORDER BY id", (user_id,)).fetchall()]
    pos_ids = [r["id"] for r in rows]
    sells_map: dict[int, list] = {pid: [] for pid in pos_ids}
    buys_map: dict[int, list] = {pid: [] for pid in pos_ids}
    if pos_ids:
        placeholders = ",".join("?" * len(pos_ids))
        sells = [dict(r) for r in db.execute(
            f"SELECT * FROM position_sells WHERE position_id IN ({placeholders}) ORDER BY date, id", pos_ids
        ).fetchall()]
        for s in sells:
            sells_map[s["position_id"]].append(s)
        buys = [dict(r) for r in db.execute(
            f"SELECT * FROM position_buys WHERE position_id IN ({placeholders}) ORDER BY date, id", pos_ids
        ).fetchall()]
        for b in buys:
            buys_map[b["position_id"]].append(b)
    for row in rows:
        row["sells"] = sells_map.get(row["id"], [])
        row["buys"] = buys_map.get(row["id"], [])
    db.close()
    return rows


@app.post("/api/positions", response_model=PositionOut, status_code=201)
def create_position(body: PositionCreate, user_id: int = Depends(get_current_user)):
    db = get_db()
    cur = db.execute(
        "INSERT INTO stock_positions (user_id, broker_name, symbol, shares, buy_price, buy_date, sell_price, sell_date, currency) VALUES (?,?,?,?,?,?,?,?,?)",
        (user_id, body.broker_name, body.symbol, body.shares, body.buy_price, body.buy_date, body.sell_price, body.sell_date, body.currency),
    )
    db.commit()
    row = dict(db.execute("SELECT * FROM stock_positions WHERE id=?", (cur.lastrowid,)).fetchone())
    db.close()
    return row


@app.patch("/api/positions/{pos_id}", response_model=PositionOut)
def update_position(pos_id: int, body: PositionUpdate, user_id: int = Depends(get_current_user)):
    db = get_db()
    existing = db.execute("SELECT * FROM stock_positions WHERE id=? AND user_id=?", (pos_id, user_id)).fetchone()
    if not existing:
        db.close()
        raise HTTPException(404, "Position not found")
    updates = body.model_dump(exclude_none=True)
    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        db.execute(f"UPDATE stock_positions SET {sets} WHERE id=? AND user_id=?", (*updates.values(), pos_id, user_id))
        db.commit()
    row = dict(db.execute("SELECT * FROM stock_positions WHERE id=?", (pos_id,)).fetchone())
    db.close()
    return row


@app.delete("/api/positions/{pos_id}", status_code=204)
def delete_position(pos_id: int, user_id: int = Depends(get_current_user)):
    db = get_db()
    existing = db.execute("SELECT id FROM stock_positions WHERE id=? AND user_id=?", (pos_id, user_id)).fetchone()
    if not existing:
        db.close()
        raise HTTPException(404, "Position not found")
    db.execute("DELETE FROM stock_positions WHERE id=? AND user_id=?", (pos_id, user_id))
    db.commit()
    db.close()


@app.post("/api/positions/sells", response_model=SellOut, status_code=201)
def create_sell(body: SellCreate, user_id: int = Depends(get_current_user)):
    db = get_db()
    pos = db.execute("SELECT id FROM stock_positions WHERE id=? AND user_id=?", (body.position_id, user_id)).fetchone()
    if not pos:
        db.close()
        raise HTTPException(404, "Position not found")
    cur = db.execute(
        "INSERT INTO position_sells (position_id, shares, price, date) VALUES (?,?,?,?)",
        (body.position_id, body.shares, body.price, body.date),
    )
    db.commit()
    row = dict(db.execute("SELECT * FROM position_sells WHERE id=?", (cur.lastrowid,)).fetchone())
    db.close()
    return row


@app.patch("/api/positions/sells/{sell_id}", response_model=SellOut)
def update_sell(sell_id: int, body: SellUpdate, user_id: int = Depends(get_current_user)):
    db = get_db()
    existing = db.execute(
        "SELECT ps.* FROM position_sells ps JOIN stock_positions sp ON ps.position_id=sp.id WHERE ps.id=? AND sp.user_id=?",
        (sell_id, user_id),
    ).fetchone()
    if not existing:
        db.close()
        raise HTTPException(404, "Sell not found")
    updates = body.model_dump(exclude_none=True)
    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        db.execute(f"UPDATE position_sells SET {sets} WHERE id=?", (*updates.values(), sell_id))
        db.commit()
    row = dict(db.execute("SELECT * FROM position_sells WHERE id=?", (sell_id,)).fetchone())
    db.close()
    return row


@app.delete("/api/positions/sells/{sell_id}", status_code=204)
def delete_sell(sell_id: int, user_id: int = Depends(get_current_user)):
    db = get_db()
    existing = db.execute(
        "SELECT ps.id FROM position_sells ps JOIN stock_positions sp ON ps.position_id=sp.id WHERE ps.id=? AND sp.user_id=?",
        (sell_id, user_id),
    ).fetchone()
    if not existing:
        db.close()
        raise HTTPException(404, "Sell not found")
    db.execute("DELETE FROM position_sells WHERE id=?", (sell_id,))
    db.commit()
    db.close()


@app.post("/api/positions/buys", response_model=BuyOut, status_code=201)
def create_buy(body: BuyCreate, user_id: int = Depends(get_current_user)):
    db = get_db()
    pos = db.execute("SELECT id FROM stock_positions WHERE id=? AND user_id=?", (body.position_id, user_id)).fetchone()
    if not pos:
        db.close()
        raise HTTPException(404, "Position not found")
    cur = db.execute(
        "INSERT INTO position_buys (position_id, shares, price, date) VALUES (?,?,?,?)",
        (body.position_id, body.shares, body.price, body.date),
    )
    db.commit()
    row = dict(db.execute("SELECT * FROM position_buys WHERE id=?", (cur.lastrowid,)).fetchone())
    db.close()
    return row


@app.patch("/api/positions/buys/{buy_id}", response_model=BuyOut)
def update_buy(buy_id: int, body: BuyUpdate, user_id: int = Depends(get_current_user)):
    db = get_db()
    existing = db.execute(
        "SELECT pb.* FROM position_buys pb JOIN stock_positions sp ON pb.position_id=sp.id WHERE pb.id=? AND sp.user_id=?",
        (buy_id, user_id),
    ).fetchone()
    if not existing:
        db.close()
        raise HTTPException(404, "Buy not found")
    updates = body.model_dump(exclude_none=True)
    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        db.execute(f"UPDATE position_buys SET {sets} WHERE id=?", (*updates.values(), buy_id))
        db.commit()
    row = dict(db.execute("SELECT * FROM position_buys WHERE id=?", (buy_id,)).fetchone())
    db.close()
    return row


@app.delete("/api/positions/buys/{buy_id}", status_code=204)
def delete_buy(buy_id: int, user_id: int = Depends(get_current_user)):
    db = get_db()
    existing = db.execute(
        "SELECT pb.id FROM position_buys pb JOIN stock_positions sp ON pb.position_id=sp.id WHERE pb.id=? AND sp.user_id=?",
        (buy_id, user_id),
    ).fetchone()
    if not existing:
        db.close()
        raise HTTPException(404, "Buy not found")
    db.execute("DELETE FROM position_buys WHERE id=?", (buy_id,))
    db.commit()
    db.close()


@app.post("/api/positions/export-to-assets")
def export_positions_to_assets(user_id: int = Depends(get_current_user)):
    """Export stock positions to the Assets tab, grouped by broker with remaining shares."""
    db = get_db()
    positions = [dict(r) for r in db.execute(
        "SELECT * FROM stock_positions WHERE user_id=? AND symbol != ''", (user_id,)
    ).fetchall()]

    if not positions:
        db.close()
        return {"synced": 0}

    # Load buys and sells for remaining-shares calculation
    all_buys = [dict(r) for r in db.execute(
        "SELECT * FROM position_buys WHERE position_id IN (SELECT id FROM stock_positions WHERE user_id=?)", (user_id,)
    ).fetchall()]
    all_sells = [dict(r) for r in db.execute(
        "SELECT * FROM position_sells WHERE position_id IN (SELECT id FROM stock_positions WHERE user_id=?)", (user_id,)
    ).fetchall()]
    buys_by_pos: dict[int, list] = {}
    sells_by_pos: dict[int, list] = {}
    for b in all_buys:
        buys_by_pos.setdefault(b["position_id"], []).append(b)
    for s in all_sells:
        sells_by_pos.setdefault(s["position_id"], []).append(s)

    # Group positions by broker_name
    by_broker: dict[str, list] = {}
    for pos in positions:
        broker = pos["broker_name"] or "Other"
        by_broker.setdefault(broker, []).append(pos)

    synced = 0
    for broker_name, broker_positions in by_broker.items():
        # Find or create broker
        broker = db.execute(
            "SELECT id FROM brokers WHERE user_id=? AND name=?", (user_id, broker_name)
        ).fetchone()
        if not broker:
            max_pos = db.execute("SELECT COALESCE(MAX(position),0) FROM brokers WHERE user_id=?", (user_id,)).fetchone()[0]
            cur = db.execute(
                "INSERT INTO brokers (user_id, name, position) VALUES (?, ?, ?)",
                (user_id, broker_name, max_pos + 1),
            )
            db.commit()
            broker_id = cur.lastrowid
        else:
            broker_id = broker["id"]

        # Aggregate positions by symbol within this broker
        symbol_agg: dict[str, dict] = {}
        for pos in broker_positions:
            sym = pos["symbol"]
            if sym not in symbol_agg:
                symbol_agg[sym] = {"shares": 0, "cost": 0, "price": pos["current_price"], "currency": pos["currency"]}
            pos_buys = buys_by_pos.get(pos["id"], [])
            pos_sells = sells_by_pos.get(pos["id"], [])
            additional_shares = sum(b["shares"] for b in pos_buys)
            sold_shares = sum(s["shares"] for s in pos_sells)
            remaining = pos["shares"] + additional_shares - sold_shares
            additional_cost = sum(b["shares"] * b["price"] for b in pos_buys)
            symbol_agg[sym]["shares"] += remaining
            symbol_agg[sym]["cost"] += pos["shares"] * pos["buy_price"] + additional_cost
            symbol_agg[sym]["price"] = pos["current_price"]

        for sym, agg in symbol_agg.items():
            avg_cost = agg["cost"] / agg["shares"] if agg["shares"] != 0 else 0
            existing = db.execute(
                "SELECT id FROM stocks WHERE broker_id=? AND symbol=?", (broker_id, sym)
            ).fetchone()
            if existing:
                db.execute(
                    "UPDATE stocks SET shares=?, cost=?, price=?, currency=? WHERE id=?",
                    (agg["shares"], avg_cost, agg["price"], agg["currency"], existing["id"]),
                )
            else:
                db.execute(
                    "INSERT INTO stocks (broker_id, symbol, shares, cost, price, currency) VALUES (?,?,?,?,?,?)",
                    (broker_id, sym, agg["shares"], avg_cost, agg["price"], agg["currency"]),
                )
            synced += 1

    db.commit()
    db.close()
    return {"synced": synced}


@app.post("/api/positions/refresh")
def refresh_positions(user_id: int = Depends(get_current_user)):
    """Refresh current prices and calculate dividends for all positions."""
    import yfinance as yf

    db = get_db()
    positions = [dict(r) for r in db.execute(
        "SELECT * FROM stock_positions WHERE user_id=? AND symbol != ''", (user_id,)
    ).fetchall()]

    if not positions:
        db.close()
        return []

    # Load all sells and buys grouped by position
    pos_ids = [p["id"] for p in positions]
    sells_map: dict[int, list] = {pid: [] for pid in pos_ids}
    buys_map: dict[int, list] = {pid: [] for pid in pos_ids}
    if pos_ids:
        placeholders = ",".join("?" * len(pos_ids))
        sells = [dict(r) for r in db.execute(
            f"SELECT * FROM position_sells WHERE position_id IN ({placeholders}) ORDER BY date", pos_ids
        ).fetchall()]
        for s in sells:
            sells_map[s["position_id"]].append(s)
        buys = [dict(r) for r in db.execute(
            f"SELECT * FROM position_buys WHERE position_id IN ({placeholders}) ORDER BY date", pos_ids
        ).fetchall()]
        for b in buys:
            buys_map[b["position_id"]].append(b)

    results = []
    for pos in positions:
        symbol = pos["symbol"]
        buy_date = pos["buy_date"]
        buy_shares = pos["shares"]
        position_sells = sells_map.get(pos["id"], [])
        position_buys = buys_map.get(pos["id"], [])

        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            current_price = info.get("regularMarketPrice") or info.get("currentPrice") or 0
            currency = info.get("currency", pos["currency"])
            stock_name = info.get("shortName") or info.get("longName") or ""

            # Calculate dividends accounting for buys and sells
            total_dividends = 0.0
            if buy_date:
                try:
                    divs = ticker.dividends
                    if not divs.empty:
                        relevant_divs = divs[divs.index >= buy_date]
                        sorted_sells = sorted(position_sells, key=lambda s: s["date"])
                        sorted_buys = sorted(position_buys, key=lambda b: b["date"])

                        for div_date, div_per_share in relevant_divs.items():
                            div_date_str = str(div_date.date()) if hasattr(div_date, 'date') else str(div_date)[:10]
                            # Shares held = initial + additional buys before date - sells before date
                            additional_bought = sum(
                                b["shares"] for b in sorted_buys
                                if b["date"] and b["date"] <= div_date_str
                            )
                            shares_sold = sum(
                                s["shares"] for s in sorted_sells
                                if s["date"] and s["date"] <= div_date_str
                            )
                            shares_held = buy_shares + additional_bought - shares_sold
                            if shares_held > 0:
                                total_dividends += float(div_per_share) * shares_held
                except Exception:
                    pass

            db.execute(
                "UPDATE stock_positions SET current_price=?, total_dividends=?, currency=?, name=? WHERE id=?",
                (float(current_price), total_dividends, currency, stock_name, pos["id"]),
            )
            results.append({
                **pos,
                "current_price": float(current_price),
                "total_dividends": total_dividends,
                "currency": currency,
                "name": stock_name,
                "sells": position_sells,
                "buys": position_buys,
            })
        except Exception:
            results.append({**pos, "sells": position_sells, "buys": position_buys})

    db.commit()
    db.close()
    return results


# ── Snapshots ────────────────────────────────────────────────────────────────


@app.get("/api/snapshots", response_model=list[SnapshotOut])
def list_snapshots(user_id: int = Depends(get_current_user)):
    db = get_db()
    rows = [dict(r) for r in db.execute("SELECT * FROM snapshots WHERE user_id=? ORDER BY date", (user_id,)).fetchall()]
    db.close()
    return rows


@app.post("/api/snapshots", response_model=SnapshotOut, status_code=201)
def create_snapshot(body: SnapshotCreate, user_id: int = Depends(get_current_user)):
    total = body.stocks + body.bonds + body.cash + body.other_liquid + body.cpf + body.insurance + body.other - body.liab
    db = get_db()
    db.execute(
        """INSERT INTO snapshots (user_id, date, stocks, bonds, cash, other_liquid, cpf, insurance, other, liab, total)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(user_id, date) DO UPDATE SET
             stocks=excluded.stocks, bonds=excluded.bonds, cash=excluded.cash,
             other_liquid=excluded.other_liquid, cpf=excluded.cpf, insurance=excluded.insurance,
             other=excluded.other, liab=excluded.liab, total=excluded.total""",
        (user_id, body.date, body.stocks, body.bonds, body.cash, body.other_liquid, body.cpf, body.insurance, body.other, body.liab, total),
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
    cpf_row = db.execute("SELECT oa, sa, ma, ra FROM cpf WHERE user_id=?", (user_id,)).fetchone()
    cpf = dict(cpf_row) if cpf_row else {"oa": 0, "sa": 0, "ma": 0, "ra": 0}
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
    for key, label in [("oa", "Ordinary Account"), ("sa", "Special Account"), ("ma", "Medisave Account"), ("ra", "Retirement Account")]:
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
