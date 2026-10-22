import contextlib
import hashlib
import json
import secrets
import sqlite3
import time
from pathlib import Path


def digest(value):
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


class Store:
    def __init__(self, data: Path, require_initialized=False):
        self.data = data.resolve()
        self.require_initialized = require_initialized
        if require_initialized:
            if not (self.data / 'cms.sqlite3').is_file():
                raise RuntimeError('生产数据库不存在，拒绝自动创建；请显式初始化或恢复')
            with self.connect() as db:
                if not db.execute('SELECT 1 FROM admin WHERE id=1').fetchone():
                    raise RuntimeError('生产管理员尚未初始化')
            return
        self.data.mkdir(parents=True, exist_ok=True, mode=0o700)
        (self.data / 'media').mkdir(exist_ok=True, mode=0o700)
        (self.data / 'originals').mkdir(exist_ok=True, mode=0o700)
        with self.connect() as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT, hash TEXT);
                CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, csrf TEXT, expires REAL);
                CREATE TABLE IF NOT EXISTS attempts (scope TEXT, at REAL);
                CREATE INDEX IF NOT EXISTS attempts_scope ON attempts(scope,at);
                CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, version INTEGER NOT NULL,
                    document TEXT NOT NULL, trashed INTEGER NOT NULL DEFAULT 0,
                    source_path TEXT UNIQUE, base_hash TEXT, updated REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS revisions (article TEXT, version INTEGER, document TEXT,
                    trashed INTEGER, created REAL, PRIMARY KEY(article,version));
                CREATE TABLE IF NOT EXISTS conflicts (id TEXT PRIMARY KEY, article TEXT, base_version INTEGER,
                    document TEXT, created REAL, resolved INTEGER DEFAULT 0);
                CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, filename TEXT, size INTEGER,
                    width INTEGER, height INTEGER, created REAL);
                CREATE TABLE IF NOT EXISTS media_originals (media TEXT, hash TEXT, size INTEGER, PRIMARY KEY(media,hash));
                CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, article TEXT, version INTEGER,
                    operation TEXT, state TEXT, result TEXT, created REAL, updated REAL);
                CREATE TABLE IF NOT EXISTS candidates (id TEXT PRIMARY KEY, article TEXT, version INTEGER,
                    snapshot TEXT, router_state TEXT, github_state TEXT, commit_sha TEXT,
                    error TEXT, created REAL, approved REAL);
                CREATE TABLE IF NOT EXISTS pointers (name TEXT PRIMARY KEY, candidate TEXT);
                CREATE TABLE IF NOT EXISTS catalogs (candidate TEXT PRIMARY KEY, documents TEXT NOT NULL);
            ''')

    @contextlib.contextmanager
    def connect(self):
        # mode=rw also prevents a missing database from being recreated after startup.
        database = self.data / 'cms.sqlite3'
        db = sqlite3.connect(database.as_uri() + '?mode=rw', uri=True, timeout=15) if self.require_initialized else sqlite3.connect(database, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    def initialize_admin(self, password):
        if len(password) < 14 or len(password) > 256:
            raise ValueError('管理员密码须为 14–256 个字符')
        salt = secrets.token_hex(16)
        with self.connect() as db:
            db.execute('INSERT INTO admin VALUES(1,?,?)', (salt, password_hash(password, salt)))

    def backup(self, destination: Path):
        # SQLite backup API includes committed WAL data; copying only the main DB does not.
        with self.connect() as source, sqlite3.connect(destination) as target:
            source.backup(target)


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def now():
    return time.time()
