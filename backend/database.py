import sqlite3
import json
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
            position INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS stocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            broker_id INTEGER NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
            symbol TEXT NOT NULL DEFAULT '',
            shares REAL NOT NULL DEFAULT 0,
            cost REAL NOT NULL DEFAULT 0,
            price REAL NOT NULL DEFAULT 0
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
    conn.commit()
    conn.close()
