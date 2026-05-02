import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "networth.db"


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS brokers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
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
            name TEXT NOT NULL DEFAULT '',
            value REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS cash (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT '',
            value REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS other_assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT '',
            value REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS insurance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT '',
            value REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS liabilities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT '',
            value REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS cpf (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            oa REAL NOT NULL DEFAULT 0,
            sa REAL NOT NULL DEFAULT 0,
            ma REAL NOT NULL DEFAULT 0
        );

        INSERT OR IGNORE INTO cpf (id, oa, sa, ma) VALUES (1, 0, 0, 0);

        CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            stocks REAL NOT NULL DEFAULT 0,
            bonds REAL NOT NULL DEFAULT 0,
            cash REAL NOT NULL DEFAULT 0,
            cpf REAL NOT NULL DEFAULT 0,
            other REAL NOT NULL DEFAULT 0,
            liab REAL NOT NULL DEFAULT 0,
            total REAL NOT NULL DEFAULT 0
        );
    """)
    # Migrate: add columns if missing
    broker_cols = [row[1] for row in conn.execute("PRAGMA table_info(brokers)").fetchall()]
    if "cash" not in broker_cols:
        conn.execute("ALTER TABLE brokers ADD COLUMN cash REAL NOT NULL DEFAULT 0")
    if "cash_usd" not in broker_cols:
        conn.execute("ALTER TABLE brokers ADD COLUMN cash_usd REAL NOT NULL DEFAULT 0")
    if "cash_hkd" not in broker_cols:
        conn.execute("ALTER TABLE brokers ADD COLUMN cash_hkd REAL NOT NULL DEFAULT 0")
    stock_cols = [row[1] for row in conn.execute("PRAGMA table_info(stocks)").fetchall()]
    if "currency" not in stock_cols:
        conn.execute("ALTER TABLE stocks ADD COLUMN currency TEXT NOT NULL DEFAULT 'SGD'")

    # Migrate old broker cash fields into broker_cash table
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    if "broker_cash" in tables:
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

    conn.commit()
    conn.close()
