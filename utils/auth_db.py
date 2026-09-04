import os
import sqlite3

DB_PATH = os.path.join('memory', 'auth.db')


def _connect():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return sqlite3.connect(DB_PATH)


def init_db():
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL
            )
            """
        )
        conn.commit()


def ensure_default_user(username: str = 'admin', password: str = 'admin123'):
    init_db()
    with _connect() as conn:
        cur = conn.execute("SELECT COUNT(1) FROM users")
        count = cur.fetchone()[0]
        if count == 0:
            conn.execute(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                (username, password),
            )
            conn.commit()


def has_users() -> bool:
    init_db()
    with _connect() as conn:
        cur = conn.execute("SELECT COUNT(1) FROM users")
        return cur.fetchone()[0] > 0


def verify_user(username: str, password: str) -> bool:
    if not username or not password:
        return False
    init_db()
    with _connect() as conn:
        cur = conn.execute(
            "SELECT 1 FROM users WHERE username = ? AND password = ?",
            (username, password),
        )
        return cur.fetchone() is not None
