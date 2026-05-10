import os
import sqlite3
from pathlib import Path

DB_PATH = Path(os.environ.get("DB_PATH", Path(__file__).parent / "networth.db"))


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _column_names(conn: sqlite3.Connection, table: str) -> list[str]:
    return [row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone() is not None


def init_db():
    conn = get_db()

    # -- Users table --
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            password_hint TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS brokers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            cash REAL NOT NULL DEFAULT 0,
            cash_usd REAL NOT NULL DEFAULT 0,
            cash_hkd REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS stocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            broker_id INTEGER NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
            symbol TEXT NOT NULL DEFAULT '',
            shares REAL NOT NULL DEFAULT 0,
            cost REAL NOT NULL DEFAULT 0,
            price REAL NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'SGD'
        );

        CREATE TABLE IF NOT EXISTS broker_cash (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            broker_id INTEGER NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
            currency TEXT NOT NULL DEFAULT 'SGD',
            amount REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS bonds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL DEFAULT '',
            value REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS cash (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL DEFAULT '',
            value REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS other_assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL DEFAULT '',
            value REAL NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'SGD'
        );

        CREATE TABLE IF NOT EXISTS insurance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL DEFAULT '',
            value REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS liabilities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL DEFAULT '',
            value REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS other_assets_liquid (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL DEFAULT '',
            value REAL NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'SGD'
        );
    """)

    # -- Migrate: add password_hint to users if missing --
    user_cols = _column_names(conn, "users")
    if "password_hint" not in user_cols:
        conn.execute("ALTER TABLE users ADD COLUMN password_hint TEXT NOT NULL DEFAULT ''")

    # -- Migrate: add is_admin to users if missing --
    user_cols = _column_names(conn, "users")
    if "is_admin" not in user_cols:
        conn.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")

    # -- Migrate: add user_id to existing tables if missing --
    for table in ("brokers", "bonds", "cash", "other_assets", "insurance", "liabilities"):
        if "user_id" not in _column_names(conn, table):
            conn.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1")

    # -- Migrate: add columns if missing (existing migrations) --
    broker_cols = _column_names(conn, "brokers")
    if "cash" not in broker_cols:
        conn.execute("ALTER TABLE brokers ADD COLUMN cash REAL NOT NULL DEFAULT 0")
    if "cash_usd" not in broker_cols:
        conn.execute("ALTER TABLE brokers ADD COLUMN cash_usd REAL NOT NULL DEFAULT 0")
    if "cash_hkd" not in broker_cols:
        conn.execute("ALTER TABLE brokers ADD COLUMN cash_hkd REAL NOT NULL DEFAULT 0")
    other_cols = _column_names(conn, "other_assets")
    if "currency" not in other_cols:
        conn.execute("ALTER TABLE other_assets ADD COLUMN currency TEXT NOT NULL DEFAULT 'SGD'")

    stock_cols = _column_names(conn, "stocks")
    if "currency" not in stock_cols:
        conn.execute("ALTER TABLE stocks ADD COLUMN currency TEXT NOT NULL DEFAULT 'SGD'")

    # -- Migrate old broker cash fields into broker_cash table --
    if _table_exists(conn, "broker_cash"):
        brokers = conn.execute("SELECT id, cash, cash_usd, cash_hkd FROM brokers").fetchall()
        for b in brokers:
            existing = conn.execute("SELECT id FROM broker_cash WHERE broker_id=?", (b[0],)).fetchone()
            if not existing:
                if b[1] and b[1] > 0:
                    conn.execute("INSERT INTO broker_cash (broker_id, currency, amount) VALUES (?, 'SGD', ?)", (b[0], b[1]))
                if b[2] and b[2] > 0:
                    conn.execute("INSERT INTO broker_cash (broker_id, currency, amount) VALUES (?, 'USD', ?)", (b[0], b[2]))
                if b[3] and b[3] > 0:
                    conn.execute("INSERT INTO broker_cash (broker_id, currency, amount) VALUES (?, 'HKD', ?)", (b[0], b[3]))

    # -- CPF: migrate from singleton to per-user --
    cpf_cols = _column_names(conn, "cpf") if _table_exists(conn, "cpf") else []
    if _table_exists(conn, "cpf") and "user_id" not in cpf_cols:
        # Old singleton table — migrate to per-user
        old_cpf = conn.execute("SELECT oa, sa, ma FROM cpf WHERE id=1").fetchone()
        conn.execute("DROP TABLE cpf")
        conn.execute("""
            CREATE TABLE cpf (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                oa REAL NOT NULL DEFAULT 0,
                sa REAL NOT NULL DEFAULT 0,
                ma REAL NOT NULL DEFAULT 0,
                ra REAL NOT NULL DEFAULT 0
            )
        """)
        if old_cpf:
            conn.execute(
                "INSERT INTO cpf (user_id, oa, sa, ma) VALUES (1, ?, ?, ?)",
                (old_cpf[0], old_cpf[1], old_cpf[2]),
            )
    elif not _table_exists(conn, "cpf"):
        conn.execute("""
            CREATE TABLE cpf (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                oa REAL NOT NULL DEFAULT 0,
                sa REAL NOT NULL DEFAULT 0,
                ma REAL NOT NULL DEFAULT 0,
                ra REAL NOT NULL DEFAULT 0
            )
        """)

    # -- Snapshots: migrate to per-user --
    if not _table_exists(conn, "snapshots"):
        conn.execute("""
            CREATE TABLE snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 1,
                date TEXT NOT NULL,
                stocks REAL NOT NULL DEFAULT 0,
                bonds REAL NOT NULL DEFAULT 0,
                cash REAL NOT NULL DEFAULT 0,
                other_liquid REAL NOT NULL DEFAULT 0,
                cpf REAL NOT NULL DEFAULT 0,
                insurance REAL NOT NULL DEFAULT 0,
                other REAL NOT NULL DEFAULT 0,
                liab REAL NOT NULL DEFAULT 0,
                total REAL NOT NULL DEFAULT 0,
                UNIQUE(user_id, date)
            )
        """)
    else:
        snap_cols = _column_names(conn, "snapshots")
        if "user_id" not in snap_cols:
            # Recreate with per-user unique constraint
            rows = conn.execute("SELECT date, stocks, bonds, cash, cpf, other, liab, total FROM snapshots").fetchall()
            conn.execute("DROP TABLE snapshots")
            conn.execute("""
                CREATE TABLE snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL DEFAULT 1,
                    date TEXT NOT NULL,
                    stocks REAL NOT NULL DEFAULT 0,
                    bonds REAL NOT NULL DEFAULT 0,
                    cash REAL NOT NULL DEFAULT 0,
                    other_liquid REAL NOT NULL DEFAULT 0,
                    cpf REAL NOT NULL DEFAULT 0,
                    insurance REAL NOT NULL DEFAULT 0,
                    other REAL NOT NULL DEFAULT 0,
                    liab REAL NOT NULL DEFAULT 0,
                    total REAL NOT NULL DEFAULT 0,
                    UNIQUE(user_id, date)
                )
            """)
            for r in rows:
                conn.execute(
                    "INSERT INTO snapshots (user_id, date, stocks, bonds, cash, cpf, other, liab, total) VALUES (1,?,?,?,?,?,?,?,?)",
                    tuple(r),
                )
        # Add other_liquid and insurance columns if missing
        if "other_liquid" not in snap_cols:
            conn.execute("ALTER TABLE snapshots ADD COLUMN other_liquid REAL NOT NULL DEFAULT 0")
        if "insurance" not in snap_cols:
            conn.execute("ALTER TABLE snapshots ADD COLUMN insurance REAL NOT NULL DEFAULT 0")

    # -- Migrate: remove UNIQUE constraint on brokers.name (now per-user) --
    broker_sql = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='brokers'"
    ).fetchone()[0]
    if "UNIQUE" in broker_sql.upper() and "name" in broker_sql.lower():
        rows = conn.execute("SELECT id, user_id, name, position, cash, cash_usd, cash_hkd FROM brokers").fetchall()
        conn.execute("DROP TABLE brokers")
        conn.execute("""
            CREATE TABLE brokers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 1,
                name TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                cash REAL NOT NULL DEFAULT 0,
                cash_usd REAL NOT NULL DEFAULT 0,
                cash_hkd REAL NOT NULL DEFAULT 0
            )
        """)
        for r in rows:
            conn.execute(
                "INSERT INTO brokers (id, user_id, name, position, cash, cash_usd, cash_hkd) VALUES (?,?,?,?,?,?,?)",
                tuple(r),
            )

    # -- Seed admin account if not exists --
    admin_exists = conn.execute("SELECT id FROM users WHERE username='admin'").fetchone()
    if not admin_exists:
        import bcrypt
        pw_hash = bcrypt.hashpw("Gates".encode(), bcrypt.gensalt()).decode()
        conn.execute(
            "INSERT INTO users (username, password_hash, password_hint, is_admin) VALUES (?, ?, ?, 1)",
            ("admin", pw_hash, "richest"),
        )
    else:
        conn.execute("UPDATE users SET is_admin=1, password_hint='richest' WHERE username='admin'")

    # -- Migrate: add ra column to cpf if missing --
    if _table_exists(conn, "cpf") and "ra" not in _column_names(conn, "cpf"):
        conn.execute("ALTER TABLE cpf ADD COLUMN ra REAL NOT NULL DEFAULT 0")

    # -- CPF Limits (FRS / BHS / ERS by year) --
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cpf_limits (
            year INTEGER PRIMARY KEY,
            frs REAL NOT NULL,
            bhs REAL NOT NULL,
            ers REAL NOT NULL DEFAULT 0
        )
    """)
    # Migrate: add ers column if missing
    if _table_exists(conn, "cpf_limits") and "ers" not in _column_names(conn, "cpf_limits"):
        conn.execute("ALTER TABLE cpf_limits ADD COLUMN ers REAL NOT NULL DEFAULT 0")
        # Backfill ERS = 2 * FRS for existing rows
        conn.execute("UPDATE cpf_limits SET ers = CAST(frs * 2 AS INTEGER) WHERE ers = 0")
    # Seed known values if table is empty
    existing = conn.execute("SELECT COUNT(*) FROM cpf_limits").fetchone()[0]
    if existing == 0:
        conn.executemany(
            "INSERT INTO cpf_limits (year, frs, bhs, ers) VALUES (?, ?, ?, ?)",
            [
                (2024, 205800, 71500, 308700),
                (2025, 213000, 75500, 426000),
                (2026, 220400, 79000, 440800),
            ],
        )

    # -- Stock Positions (Stocks tab — dividend tracking) --
    conn.execute("""
        CREATE TABLE IF NOT EXISTS stock_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            broker_name TEXT NOT NULL DEFAULT '',
            symbol TEXT NOT NULL DEFAULT '',
            shares REAL NOT NULL DEFAULT 0,
            buy_price REAL NOT NULL DEFAULT 0,
            buy_date TEXT NOT NULL DEFAULT '',
            sell_price REAL NOT NULL DEFAULT 0,
            sell_date TEXT NOT NULL DEFAULT '',
            currency TEXT NOT NULL DEFAULT 'USD',
            current_price REAL NOT NULL DEFAULT 0,
            total_dividends REAL NOT NULL DEFAULT 0
        )
    """)

    # Migrate: add columns if missing
    if _table_exists(conn, "stock_positions"):
        pos_cols = _column_names(conn, "stock_positions")
        if "broker_name" not in pos_cols:
            conn.execute("ALTER TABLE stock_positions ADD COLUMN broker_name TEXT NOT NULL DEFAULT ''")
        if "sell_price" not in pos_cols:
            conn.execute("ALTER TABLE stock_positions ADD COLUMN sell_price REAL NOT NULL DEFAULT 0")
        if "sell_date" not in pos_cols:
            conn.execute("ALTER TABLE stock_positions ADD COLUMN sell_date TEXT NOT NULL DEFAULT ''")
        if "name" not in pos_cols:
            conn.execute("ALTER TABLE stock_positions ADD COLUMN name TEXT NOT NULL DEFAULT ''")

    # -- Position Sells (partial sells per position) --
    conn.execute("""
        CREATE TABLE IF NOT EXISTS position_sells (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            position_id INTEGER NOT NULL REFERENCES stock_positions(id) ON DELETE CASCADE,
            shares REAL NOT NULL DEFAULT 0,
            price REAL NOT NULL DEFAULT 0,
            date TEXT NOT NULL DEFAULT ''
        )
    """)

    # -- Position Buys (additional buys per position) --
    conn.execute("""
        CREATE TABLE IF NOT EXISTS position_buys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            position_id INTEGER NOT NULL REFERENCES stock_positions(id) ON DELETE CASCADE,
            shares REAL NOT NULL DEFAULT 0,
            price REAL NOT NULL DEFAULT 0,
            date TEXT NOT NULL DEFAULT ''
        )
    """)

    # -- Indexes --
    conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_positions_user ON stock_positions(user_id);
        CREATE INDEX IF NOT EXISTS idx_brokers_user ON brokers(user_id);
        CREATE INDEX IF NOT EXISTS idx_bonds_user ON bonds(user_id);
        CREATE INDEX IF NOT EXISTS idx_cash_user ON cash(user_id);
        CREATE INDEX IF NOT EXISTS idx_other_user ON other_assets(user_id);
        CREATE INDEX IF NOT EXISTS idx_insurance_user ON insurance(user_id);
        CREATE INDEX IF NOT EXISTS idx_liabilities_user ON liabilities(user_id);
        CREATE INDEX IF NOT EXISTS idx_snapshots_user ON snapshots(user_id);
        CREATE INDEX IF NOT EXISTS idx_other_liquid_user ON other_assets_liquid(user_id);
    """)

    conn.commit()
    conn.close()
