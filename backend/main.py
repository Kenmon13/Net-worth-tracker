from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import get_db, init_db
from models import (
    BrokerCreate,
    BrokerOut,
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
    bonds = [dict(r) for r in db.execute("SELECT * FROM bonds ORDER BY id").fetchall()]
    cash = [dict(r) for r in db.execute("SELECT * FROM cash ORDER BY id").fetchall()]
    other = [dict(r) for r in db.execute("SELECT * FROM other_assets ORDER BY id").fetchall()]
    liabilities = [dict(r) for r in db.execute("SELECT * FROM liabilities ORDER BY id").fetchall()]
    cpf_row = dict(db.execute("SELECT oa, sa, ma FROM cpf WHERE id=1").fetchone())
    db.close()
    return PortfolioOut(
        brokers=brokers,
        stocks=stocks,
        bonds=bonds,
        cash=cash,
        other=other,
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


@app.delete("/api/brokers/{broker_id}", status_code=204)
def delete_broker(broker_id: int):
    db = get_db()
    db.execute("DELETE FROM brokers WHERE id=?", (broker_id,))
    db.commit()
    db.close()


# ── Stocks ───────────────────────────────────────────────────────────────────


@app.post("/api/stocks", response_model=StockOut, status_code=201)
def create_stock(body: StockCreate):
    db = get_db()
    cur = db.execute(
        "INSERT INTO stocks (broker_id, symbol, shares, cost, price) VALUES (?,?,?,?,?)",
        (body.broker_id, body.symbol, body.shares, body.cost, body.price),
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
