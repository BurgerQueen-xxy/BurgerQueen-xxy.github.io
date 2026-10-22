import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import uuid
import asyncio
import contextlib
import errno
from dataclasses import dataclass
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.concurrency import run_in_threadpool

from .content import (MAX_UPLOAD, MEDIA_REF, SECTIONS, article_view, fail, normalized_image, image_paths,
                      stable_id, target_path, validate_document, parse_source)
from .publisher import SnapshotPublisher, MAX_PUBLIC_BYTES, contained_file
from .releases import Releases, program_manifest, candidate_view, candidate_summary
from .store import Store, digest, encode, now, password_hash
from .guard import check_capacity, configured_guard
from . import assets, library


@dataclass
class Settings:
    data: Path
    repo: Path
    origin: str = 'http://127.0.0.1:8788'
    development: bool = False
    dist: Path | None = None
    program: Path | None = None
    router_enabled: bool = False
    github_token: str | None = None
    require_initialized: bool = False
    minimum_free: int = 0
    media_quota: int = 512 * 1024 * 1024
    storage_guard: object = None
    backup_status: Path | None = None
    music_root: Path | None = None
    site_id: str = 'slow-notes'
    lan_readonly: bool = False
    allowed_hosts: tuple[str, ...] = ()


def create_app(settings: Settings):
    from urllib.parse import urlparse
    if settings.lan_readonly and (settings.program is None or not settings.router_enabled):
        raise ValueError('局域网免登录浏览需要已配置的路由器站点程序')
    if settings.site_id != 'slow-notes':
        raise ValueError('此独立适配器仅支持 slow-notes')
    if settings.github_token is not None:
        raise ValueError('此独立站点禁止配置 GitHub 发布授权')
    cookie_name = 'cms_session_slow-notes'
    origin = urlparse(settings.origin)
    if origin.path or origin.query or origin.fragment or origin.username:
        raise ValueError('CMS_ORIGIN 必须是纯 origin')
    if origin.scheme != 'https' and not (settings.development and origin.hostname in ('127.0.0.1', 'localhost')):
        raise ValueError('必须配置 HTTPS；仅显式开发模式允许 loopback HTTP')
    hosts = tuple(dict.fromkeys((origin.hostname, *settings.allowed_hosts)))
    if any(not host or not re.fullmatch(r'[a-zA-Z0-9.-]+', host) or '*' in host for host in hosts):
        raise ValueError('主机白名单必须是精确的主机名或 IPv4 地址')
    repo = settings.repo.resolve()
    for public_root in (repo, settings.program, settings.dist):
        if public_root and (settings.data.resolve().is_relative_to(public_root.resolve()) or public_root.resolve().is_relative_to(settings.data.resolve())):
            raise ValueError('私人数据目录必须与源快照、程序和编辑室目录完全分离')
    if settings.storage_guard:
        settings.storage_guard()
    store = Store(settings.data, settings.require_initialized)
    assets.initialize(store)
    if settings.require_initialized:
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            db.rollback()
    publisher = SnapshotPublisher(repo, store)
    if settings.program:
        program_manifest(settings.program, verify_files=True)
    @contextlib.asynccontextmanager
    async def lifespan(_app):
        async def watch_mounts():
            while True:
                await asyncio.sleep(5)
                try:
                    if app.state.storage_fault:
                        raise RuntimeError('私人存储读写故障')
                    await run_in_threadpool(settings.storage_guard)
                except Exception:
                    # Dedicated service only; procd factory checks again before respawn.
                    os._exit(74)
        mount_task = asyncio.create_task(watch_mounts()) if settings.storage_guard else None
        try:
            yield
        finally:
            if mount_task:
                mount_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await mount_task
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.store = store
    app.state.publisher = publisher
    app.state.storage_fault = False
    job_lock = threading.Lock()
    release_lock = threading.Lock()
    image_lock = release_lock  # Heavy decode/publication share one slot; ordinary draft saves do not.
    releases = Releases(store, publisher, settings.program, settings.router_enabled, site_id=settings.site_id)
    app.state.releases = releases
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(hosts))

    @app.middleware('http')
    async def security(request: Request, call_next):
        image_request = request.method == 'POST' and request.url.path in ('/api/media','/api/assets')
        if image_request and not image_lock.acquire(blocking=False):
            return JSONResponse({'detail': '图片处理或部署任务正在运行，请稍后重试'}, 429)
        try:
            return await secured_request(request, call_next)
        except HTTPException as error:
            return JSONResponse({'detail':error.detail},error.status_code)
        except (OSError, sqlite3.Error) as error:
            full = getattr(error, 'errno', None) == errno.ENOSPC or getattr(error, 'sqlite_errorcode', 0) & 255 == sqlite3.SQLITE_FULL
            if full:
                return JSONResponse({'detail': '存储空间不足，内容保留在客户端'}, 507)
            code = getattr(error, 'sqlite_errorcode', 0) & 255
            if getattr(error, 'errno', None) in (errno.EIO, errno.EROFS, errno.ENODEV) or code in (sqlite3.SQLITE_IOERR, sqlite3.SQLITE_READONLY, sqlite3.SQLITE_CANTOPEN):
                app.state.storage_fault = True
                return JSONResponse({'detail': '私人存储发生读写故障，已停止读写'}, 503)
            raise
        finally:
            if image_request:
                image_lock.release()

    async def secured_request(request, call_next):
        if app.state.storage_fault:
            return JSONResponse({'detail': '私人存储发生读写故障，需要维护检查后重启'}, 503)
        if settings.storage_guard:
            try:
                await run_in_threadpool(settings.storage_guard)
            except Exception:
                return JSONResponse({'detail': '私人存储不可用，已停止读写'}, 503)
        if request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            try:
                check_capacity(store.data, settings.minimum_free, MAX_UPLOAD if request.url.path == '/api/media' else 1024 * 1024)
            except HTTPException as error:
                return JSONResponse({'detail': error.detail}, error.status_code)
        if request.url.path.startswith('/api/'):
            if request.headers.get('sec-fetch-site') == 'cross-site':
                return JSONResponse({'detail': '禁止跨站请求'}, 403)
            if request.method not in ('GET', 'HEAD', 'OPTIONS') and request.headers.get('origin') != settings.origin:
                return JSONResponse({'detail': 'Origin 校验失败'}, 403)
            # Bound chunked bodies too, before JSON or image decoders allocate memory.
            if request.method=='POST' and request.url.path=='/api/assets':
                session(request,True)
                length=request.headers.get('content-length','0')
                if not length.isdigit():return JSONResponse({'detail':'上传长度无效'},400)
            elif request.method in ('POST', 'PUT', 'PATCH'):
                body = bytearray()
                async for chunk in request.stream():
                    body.extend(chunk)
                    if len(body) > (MAX_UPLOAD if request.url.path == '/api/media' else 1024 * 1024):
                        return JSONResponse({'detail': '请求体过大'}, 413)
                request._body = bytes(body)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['X-Robots-Tag'] = 'noindex, nofollow'
        response.headers['Content-Security-Policy'] = ("default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; "
            "img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; "
            "base-uri 'none'; form-action 'self'; object-src 'none'")
        if settings.program and not request.url.path.startswith(('/api/', '/admin')):
            response.headers['Content-Security-Policy'] = ("default-src 'self'; script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; "
                "font-src 'self'; img-src 'self' data: blob:; "
                "connect-src 'self'; frame-ancestors 'none'; "
                "base-uri 'none'; object-src 'none'")
        if not settings.development:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000'
        return response

    def session(request, mutate=False):
        token = request.cookies.get(cookie_name, '')
        with store.connect() as db:
            record = db.execute('SELECT * FROM sessions WHERE token=? AND expires>?', (digest(token), now())).fetchone()
        if not record:
            fail('请登录', 401)
        if mutate and not hmac.compare_digest(record['csrf'], request.headers.get('x-csrf-token', '')):
            fail('CSRF 校验失败', 403)
        return record

    def site_access(request):
        # Opt-in only behind the existing LAN/WG HTTPS listener. This never
        # applies to /api, original images, private libraries or mutations.
        if not settings.lan_readonly:
            session(request)

    def load_article(article_id, db=None):
        if db is None:
            with store.connect() as connection:
                return load_article(article_id, connection)
        record = db.execute('SELECT * FROM articles WHERE id=?', (article_id,)).fetchone()
        if not record:
            fail('文章不存在', 404)
        return article_view(record)

    @app.get('/healthz')
    def health():
        # Mount middleware and a real SQLite read must succeed. No private content is returned.
        with store.connect() as db:
            if not db.execute('SELECT 1 FROM admin WHERE id=1').fetchone():
                fail('后台尚未就绪',503)
        return {'ready':True,'site':settings.site_id}

    def references_valid(document, db):
        for media_id in set(MEDIA_REF.findall(document['source'])):
            if not db.execute('SELECT 1 FROM media WHERE id=?', (media_id,)).fetchone():
                fail('引用了不存在的媒体')

    def revision(db, article_id):
        db.execute('INSERT INTO revisions SELECT id,version,document,trashed,updated FROM articles WHERE id=?', (article_id,))

    async def payload(request):
        if request.headers.get('content-type', '').split(';')[0] != 'application/json':
            fail('需要 application/json', 415)
        try:
            value = await request.json()
        except (ValueError, UnicodeError):
            fail('JSON 格式无效')
        if not isinstance(value, dict):
            fail('需要 JSON 对象')
        return value

    def require_version(value):
        version = value.get('version')
        if type(version) is not int or version < 0 or version > 2**53 - 1:
            fail('version 必须是非负整数')

    @app.get('/api/session')
    def get_session(request: Request):
        record = session(request)
        return {'csrf': record['csrf'], 'expires': record['expires'], 'mode': 'local-snapshot', 'site': settings.site_id, 'sections': list(SECTIONS)}

    @app.get('/api/maintenance')
    def maintenance(request: Request):
        session(request)
        if not settings.backup_status or not settings.backup_status.is_file():
            return {'state': 'not_configured'}
        try:
            raw = settings.backup_status.read_text()
            if len(raw) > 8192:
                raise ValueError()
            status = json.loads(raw)
            return {key: status[key] for key in ('state', 'created', 'at', 'durationSeconds', 'bytes', 'retained', 'errorType') if key in status}
        except (OSError, ValueError):
            return {'state': 'status_unavailable'}

    @app.post('/api/login')
    async def login(request: Request):
        value = await payload(request)
        password = value.get('password', '')
        if not isinstance(password, str) or len(password) > 256:
            fail('登录失败', 401)
        scope = digest(request.client.host if request.client else 'unknown')
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('DELETE FROM attempts WHERE at<?', (now() - 900,))
            if db.execute('SELECT count(*) FROM attempts WHERE scope=?', (scope,)).fetchone()[0] >= 5 or db.execute('SELECT count(*) FROM attempts').fetchone()[0] >= 30:
                fail('登录尝试过多，请在 15 分钟后重试', 429)
            db.execute('INSERT INTO attempts VALUES(?,?)', (scope, now()))
            admin = db.execute('SELECT * FROM admin WHERE id=1').fetchone()
        salt = admin['salt'] if admin else '00' * 16
        valid = hmac.compare_digest(password_hash(password, salt), admin['hash'] if admin else '0' * 128)
        if not valid or not admin:
            fail('登录失败', 401)
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with store.connect() as db:
            db.execute('DELETE FROM attempts WHERE scope=?', (scope,))
            db.execute('DELETE FROM sessions WHERE expires<? OR token=?', (now(), digest(request.cookies.get(cookie_name, ''))))
            db.execute('INSERT INTO sessions VALUES(?,?,?)', (digest(token), csrf, now() + 43200))
        response = JSONResponse({'csrf': csrf, 'mode': 'local-snapshot', 'site': settings.site_id})
        response.set_cookie(cookie_name, token, max_age=43200, httponly=True, secure=not settings.development, samesite='strict', path='/')
        return response

    @app.post('/api/logout')
    def logout(request: Request):
        session(request, True)
        with store.connect() as db:
            db.execute('DELETE FROM sessions WHERE token=?', (digest(request.cookies.get(cookie_name, '')),))
        response = JSONResponse({'ok': True})
        response.delete_cookie(cookie_name, path='/')
        return response

    @app.get('/api/articles')
    def articles(request: Request, q: str = '', trash: bool = False):
        session(request)
        result, size = [], 0
        with store.connect() as db:
            # Sort small identities, not every large document into SQLite's RAM-backed temp files.
            ids = [row['id'] for row in db.execute('SELECT id FROM articles WHERE trashed=? ORDER BY updated DESC', (int(trash),))]
            for article_id in ids:
                row = db.execute('SELECT * FROM articles WHERE id=?', (article_id,)).fetchone()
                article = article_view(row)
                if q.casefold() not in article['document']['source'].casefold(): continue
                size += len(row['document'].encode())
                if size > MAX_PUBLIC_BYTES: fail('列表正文超过 8 MiB，请使用搜索缩小范围；内容保留', 413)
                result.append(article)
        return result

    @app.post('/api/articles')
    async def create_article(request: Request):
        session(request, True)
        value = await payload(request)
        article_id = value.get('id')
        try:
            if str(uuid.UUID(article_id)) != article_id:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            fail('需要客户端生成的稳定 UUID')
        document = validate_document(value.get('document'))
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            existing = db.execute('SELECT * FROM articles WHERE id=?', (article_id,)).fetchone()
            if existing:
                if existing['document'] != encode(document):
                    fail('这个 ID 已存在，草稿保留在本机；请重新打开或另存副本', 409)
                return article_view(existing)
            references_valid(document, db)
            db.execute('INSERT INTO articles(id,version,document,updated) VALUES(?,1,?,?)', (article_id, encode(document), now()))
            revision(db, article_id)
        return load_article(article_id)

    @app.get('/api/articles/{article_id}')
    def article(request: Request, article_id: str):
        session(request)
        return load_article(article_id)

    @app.put('/api/articles/{article_id}')
    async def update_article(request: Request, article_id: str):
        session(request, True)
        value = await payload(request)
        require_version(value)
        document = validate_document(value.get('document'))
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            article = load_article(article_id, db)
            references_valid(document, db)
            if value.get('version') != article['version']:
                if document == article['document']:
                    return article  # A retry after a lost successful response is harmless.
                incoming = encode(document)
                existing = db.execute('SELECT id FROM conflicts WHERE article=? AND base_version=? AND document=? AND resolved=0 LIMIT 1',
                                      (article_id, value['version'], incoming)).fetchone()
                conflict_id = existing['id'] if existing else str(uuid.uuid4())
                if not existing:
                    db.execute('INSERT INTO conflicts(id,article,base_version,document,created) VALUES(?,?,?,?,?)',
                               (conflict_id, article_id, value['version'], incoming, now()))
                conflict = {'detail': '版本冲突，双方内容已保留', 'conflictId': conflict_id, 'current': article, 'incoming': document}
            else:
                if article['trashed']:
                    fail('请先从回收站恢复', 409)
                db.execute('UPDATE articles SET version=version+1,document=?,updated=? WHERE id=?', (encode(document), now(), article_id))
                revision(db, article_id)
                conflict = None
        if conflict:
            return JSONResponse(conflict, 409)
        return load_article(article_id)

    @app.post('/api/articles/{article_id}/trash')
    async def trash_article(request: Request, article_id: str):
        session(request, True)
        value = await payload(request)
        require_version(value)
        if type(value.get('trashed', True)) is not bool:
            fail('trashed 必须是布尔值')
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            article = load_article(article_id, db)
            if value.get('version') != article['version']:
                fail('版本已变化，请刷新后重试', 409)
            db.execute('UPDATE articles SET trashed=?,version=version+1,updated=? WHERE id=?', (int(value.get('trashed', True)), now(), article_id))
            revision(db, article_id)
        return load_article(article_id)

    @app.get('/api/articles/{article_id}/history')
    def history(request: Request, article_id: str):
        session(request)
        load_article(article_id)
        size = 0
        with store.connect() as db:
            revisions, conflicts = [], []
            for row in db.execute('SELECT * FROM revisions WHERE article=? ORDER BY version DESC', (article_id,)):
                size += len(row['document'].encode())
                if size > MAX_PUBLIC_BYTES: fail('历史正文超过 8 MiB；版本均保留，需要先安排分页查看或扩容', 413)
                revisions.append(dict(row) | {'document': json.loads(row['document'])})
            ids = [row['id'] for row in db.execute('SELECT id FROM conflicts WHERE article=? ORDER BY created DESC', (article_id,))]
            for conflict_id in ids:
                row = db.execute('SELECT * FROM conflicts WHERE id=?', (conflict_id,)).fetchone()
                size += len(row['document'].encode())
                if size > MAX_PUBLIC_BYTES: fail('冲突历史正文超过 8 MiB；双方内容均保留，需要先安排分页查看或扩容', 413)
                conflicts.append(dict(row) | {'document': json.loads(row['document'])})
        return {'revisions': revisions, 'conflicts': conflicts}

    @app.get('/api/articles/{article_id}/asset')
    def original_asset(request: Request, article_id: str, src: str):
        from fastapi.responses import Response
        session(request)
        article = load_article(article_id)
        if src not in article['document']['source']:
            fail('图片不在这篇文章中', 404)
        head = publisher.latest()
        for path in image_paths(article['document'], src):
            raw = publisher.read(head, path)
            if raw is None:
                continue
            # Same decoder and limits as uploads. Never proxy SVG/HTML or arbitrary repo files.
            _, content, _, _ = normalized_image(raw)
            return Response(content, media_type='image/webp')
        fail('原文章图片不存在', 404)

    @app.get('/api/articles/{article_id}/remote')
    def remote_article(request: Request, article_id: str):
        session(request)
        article = load_article(article_id)
        if not article['source_path']:
            fail('没有可对照的正式分支文章', 409)
        head = publisher.latest()
        raw = publisher.read(head, article['source_path'])
        return {'baseCommit': head, 'hash': digest(raw) if raw is not None else None,
                'source': raw.decode('utf-8-sig') if raw is not None else None}

    @app.post('/api/articles/{article_id}/rebase')
    async def rebase_article(request: Request, article_id: str):
        session(request, True)
        value = await payload(request)
        require_version(value)
        document = validate_document(value.get('document'))
        def merge_remote():
            article = load_article(article_id)
            if not article['source_path']:
                fail('没有正式分支源文件', 409)
            head = publisher.latest()
            raw = publisher.read(head, article['source_path'])
            checksum = digest(raw) if raw is not None else None
            if value.get('remoteHash') != checksum:
                fail('正式分支再次变化，请重新读取远端对照', 409)
            with store.connect() as db:
                db.execute('BEGIN IMMEDIATE')
                latest = load_article(article_id, db)
                if value.get('version') != latest['version'] or latest['trashed']:
                    fail('后台文章已变化，请先处理多端冲突', 409)
                references_valid(document, db)
                db.execute('INSERT INTO conflicts(id,article,base_version,document,created) VALUES(?,?,?,?,?)',
                           (str(uuid.uuid4()), article_id, latest['version'], encode(latest['document']), now()))
                if raw is not None:
                    remote_doc = dict(document, source=raw.decode('utf-8-sig'))
                    db.execute('INSERT INTO conflicts(id,article,base_version,document,created) VALUES(?,?,?,?,?)',
                               (str(uuid.uuid4()), article_id, latest['version'], encode(remote_doc), now()))
                db.execute('UPDATE articles SET version=version+1,document=?,source_path=?,base_hash=?,updated=? WHERE id=?',
                           (encode(document), article['source_path'] if raw is not None else None, checksum, now(), article_id))
                revision(db, article_id)
            return load_article(article_id)
        return await run_in_threadpool(merge_remote)

    @app.post('/api/import')
    def import_articles(request: Request):
        session(request, True)
        head, paths = publisher.import_candidates()
        imported, skipped, errors = [], [], []
        for path in paths:
            try:
                raw = publisher.read(head, path)
                source = raw.decode('utf-8-sig')
                article_id = stable_id(path, source)
                meta, _ = parse_source(source)
                document = validate_document({'category': meta.get('category'), 'slug': Path(path).stem, 'source': source})
                with store.connect() as db:
                    if db.execute('SELECT 1 FROM articles WHERE source_path=? OR id=?', (path, article_id)).fetchone():
                        skipped.append(path)
                        continue
                    db.execute('INSERT INTO articles VALUES(?,1,?,0,?,?,?)', (article_id, encode(document), path, digest(raw), now()))
                    revision(db, article_id)
                imported.append(article_id)
            except (HTTPException, ValueError, UnicodeError, sqlite3.Error):
                errors.append(path)
        return {'baseCommit': head, 'imported': imported, 'skipped': skipped, 'errors': errors}

    @app.get('/api/media')
    def media_list(request: Request):
        session(request)
        return library.album(store)

    @app.post('/api/media')
    async def upload(request: Request):
        session(request, True)
        purpose = request.query_params.get('purpose', 'image')
        if purpose not in ('image', 'emoji', 'album'): fail('图片用途无效')
        raw = await request.body()
        media_id, content, width, height = await run_in_threadpool(normalized_image, raw)
        filename = media_id + '.webp'
        @contextlib.contextmanager
        def rollback_files():
            created = []
            try:
                yield created
            except BaseException:
                for path in created:
                    path.unlink(missing_ok=True)
                raise
        with rollback_files() as created, store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            duplicate = db.execute('SELECT 1 FROM media WHERE id=?', (media_id,)).fetchone() is not None
            original_hash = digest(raw)
            original = store.data / 'originals' / (original_hash + '.bin')
            added = (0 if duplicate else len(content)) + (0 if original.exists() else len(raw))
            used = sum(p.stat().st_size for folder in ('media', 'originals') for p in (store.data / folder).iterdir() if p.is_file())
            if used + added > settings.media_quota:
                fail('私人媒体容量已达到上限，请先备份并检查存储', 507)
            check_capacity(store.data, settings.minimum_free, added)
            if not duplicate:
                temp = store.data / 'media' / (secrets.token_hex(16) + '.tmp')
                try:
                    temp.write_bytes(content)
                    temp.replace(store.data / 'media' / filename)
                    created.append(store.data / 'media' / filename)
                    db.execute('INSERT INTO media VALUES(?,?,?,?,?,?)', (media_id, filename, len(content), width, height, now()))
                finally:
                    temp.unlink(missing_ok=True)
            if not original.exists():
                temp = store.data / 'originals' / (secrets.token_hex(16) + '.tmp')
                try:
                    temp.write_bytes(raw)
                    temp.replace(original)
                    created.append(original)
                finally:
                    temp.unlink(missing_ok=True)
            db.execute('INSERT OR IGNORE INTO media_originals VALUES(?,?,?)', (media_id, original_hash, len(raw)))
            parent = request.query_params.get('original')
            if parent:
                if not re.fullmatch(r'[a-f0-9]{64}', parent) or not db.execute('SELECT 1 FROM media WHERE id=?',(parent,)).fetchone():
                    fail('关联原图不存在', 409)
                db.execute('INSERT OR IGNORE INTO media_originals SELECT ?,hash,size FROM media_originals WHERE media=?',(media_id,parent))
                inherited=db.execute('SELECT original_hash FROM media_sources WHERE media=?',(parent,)).fetchone()
                root_original=inherited['original_hash'] if inherited else db.execute('SELECT hash FROM media_originals WHERE media=? ORDER BY size DESC LIMIT 1',(parent,)).fetchone()['hash']
                db.execute('INSERT OR REPLACE INTO media_sources VALUES(?,?)',(media_id,root_original))
            else:db.execute('INSERT OR IGNORE INTO media_sources VALUES(?,?)',(media_id,original_hash))
            db.execute('INSERT OR IGNORE INTO media_usage VALUES(?,?)',(media_id,purpose))
        return {'id': media_id, 'url': '/api/media/' + media_id, 'duplicate': duplicate, 'size': len(content), 'width': width, 'height': height}

    @app.get('/api/media/{media_id}/original')
    def media_original(request: Request, media_id: str):
        session(request)
        if not re.fullmatch(r'[a-f0-9]{64}',media_id): fail('原图不存在',404)
        with store.connect() as db:
            row = db.execute('SELECT original_hash AS hash FROM media_sources WHERE media=?',(media_id,)).fetchone()
            if not row:row=db.execute('SELECT hash FROM media_originals WHERE media=? ORDER BY size DESC LIMIT 1',(media_id,)).fetchone()
        if not row: fail('原图不存在',404)
        path=store.data/'originals'/(row['hash']+'.bin')
        if not path.is_file() or digest(path.read_bytes())!=row['hash']:fail('原图缺失或校验失败',409)
        return FileResponse(path,media_type='application/octet-stream')

    @app.get('/api/media/{media_id}')
    def media_file(request: Request, media_id: str):
        session(request)
        if not re.fullmatch(r'[a-f0-9]{64}', media_id):
            fail('图片不存在', 404)
        with store.connect() as db:
            if not db.execute('SELECT 1 FROM media WHERE id=?', (media_id,)).fetchone():
                fail('图片不存在', 404)
        path = store.data / 'media' / (media_id + '.webp')
        if not path.is_file():
            fail('图片不存在', 404)
        return FileResponse(path, media_type='image/webp')

    @app.delete('/api/album/{media_id}')
    def remove_album_image(request: Request, media_id: str):
        session(request, True)
        if not re.fullmatch(r'[a-f0-9]{64}', media_id):
            fail('图片不存在', 404)
        with store.connect() as db:
            db.execute("DELETE FROM media_usage WHERE media=? AND kind='album'", (media_id,))
        return {'ok': True}

    @app.delete('/api/media/{media_id}')
    def delete_media(request: Request, media_id: str):
        session(request, True)
        if not re.fullmatch(r'[a-f0-9]{64}', media_id):
            fail('图片不存在', 404)
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            for table in ('articles', 'revisions', 'conflicts'):
                if db.execute(f'SELECT 1 FROM {table} WHERE document LIKE ? LIMIT 1', ('%/api/media/' + media_id + '%',)).fetchone():
                    fail('图片仍被文章、历史版本或冲突副本引用', 409)
            db.execute('DELETE FROM media WHERE id=?', (media_id,))
            db.execute('DELETE FROM media_sources WHERE media=?',(media_id,))
            db.execute('DELETE FROM media_usage WHERE media=?',(media_id,))
            originals = db.execute('SELECT hash FROM media_originals WHERE media=?', (media_id,)).fetchall()
            db.execute('DELETE FROM media_originals WHERE media=?', (media_id,))
            for original in originals:
                if not db.execute('SELECT 1 FROM media_originals WHERE hash=?', (original['hash'],)).fetchone():
                    (store.data / 'originals' / (original['hash'] + '.bin')).unlink(missing_ok=True)
            (store.data / 'media' / (media_id + '.webp')).unlink(missing_ok=True)
        return {'ok': True}

    @app.get('/api/jobs')
    def jobs(request: Request):
        session(request)
        with store.connect() as db:
            ids = [row['id'] for row in db.execute('SELECT id FROM jobs ORDER BY created DESC LIMIT 100')]
            return [dict(row) | {'result': plan_summary(json.loads(row['result']))} for job_id in ids
                    if (row := db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone())]

    def plan_summary(plan):
        result = dict(plan)
        if 'changes' in result:
            result['changes'] = [{k: v for k, v in change.items() if k not in ('text', 'contentBase64')} for change in result['changes']]
        return result

    @app.get('/api/candidates')
    def candidates(request: Request):
        session(request)
        with store.connect() as db:
            ids = [row['id'] for row in db.execute('SELECT id FROM candidates ORDER BY created DESC LIMIT 100')]
            items = [candidate_summary(candidate_view(db.execute('SELECT * FROM candidates WHERE id=?', (candidate_id,)).fetchone())) for candidate_id in ids]
            active = db.execute("SELECT candidate FROM pointers WHERE name='router_current'").fetchone()
        return {'items': items, 'routerCurrent': active['candidate'] if active and not (active['candidate'] or '').startswith('baseline:') else None,
                'routerConfigured': settings.router_enabled and settings.program is not None,
                'githubConfigured': False,
                'programSourceCommit': program_manifest(settings.program)['sourceCommit'] if settings.program else None}

    @app.post('/api/articles/{article_id}/candidates')
    async def prepare_candidate(request: Request, article_id: str):
        session(request, True)
        value = await payload(request)
        require_version(value)
        try:
            uuid.UUID(value.get('requestId', ''))
        except (ValueError, TypeError, AttributeError):
            fail('需要候选 UUID')
        operation = value.get('operation', 'publish')
        if operation not in ('publish', 'unpublish'):
            fail('无效操作')
        def freeze():
            with release_lock:
                article = load_article(article_id)
                if article['trashed'] or value.get('version') != article['version']:
                    fail('文章已变化，请重新同步', 409)
                return candidate_summary(releases.freeze(value['requestId'], article, operation))
        return await run_in_threadpool(freeze)

    @app.post('/api/candidates/{candidate_id}/{action}')
    def operate_candidate(request: Request, candidate_id: str, action: str):
        session(request, True)
        with release_lock:
            if action == 'deploy-router':
                return candidate_summary(releases.activate(candidate_id))
            if action == 'approve-github':
                return candidate_summary(releases.approve(candidate_id))
            if action == 'refresh':
                return candidate_summary(releases.poll(candidate_id))
            fail('无效操作', 404)

    @app.post('/api/router/rollback')
    def rollback_router(request: Request):
        session(request, True)
        with release_lock:
            return releases.rollback()

    @app.get('/router-content.json')
    def router_content(request: Request):
        site_access(request)
        catalog = releases.catalog()
        catalog = dict(catalog, documents={name: MEDIA_REF.sub(
            lambda m: '/site-media/' + m[1] + '.webp', source) if source is not None else None
            for name, source in catalog['documents'].items()})
        return catalog

    @app.get('/site-media/{name}')
    def deployed_image(request: Request, name: str):
        site_access(request)
        match = re.fullmatch(r'([a-f0-9]{64})\.webp', name)
        if not match:
            fail('部署图片不存在', 404)
        media_id = match[1]
        if not any(media_id in MEDIA_REF.findall(source) for source in releases.catalog()['documents'].values() if source):
            fail('图片未被当前路由器版本引用', 404)
        path = store.data / 'media' / name
        if not path.is_file() or path.is_symlink():
            fail('部署图片不存在', 404)
        if path.stat().st_size > MAX_UPLOAD or hashlib.file_digest(path.open('rb'), 'sha256').hexdigest() != media_id:
            fail('部署图片校验失败', 409)
        return FileResponse(path, media_type='image/webp')

    @app.post('/api/articles/{article_id}/dry-run')
    async def dry_run(request: Request, article_id: str):
        session(request, True)
        value = await payload(request)
        require_version(value)
        return await run_in_threadpool(execute_plan, article_id, value)

    def execute_plan(article_id, value):
        job_id = value.get('requestId', '')
        try:
            uuid.UUID(job_id)
        except (ValueError, AttributeError, TypeError):
            fail('需要稳定的 requestId')
        operation = value.get('operation', 'publish')
        if operation not in ('publish', 'unpublish'):
            fail('不支持的发布操作')
        with job_lock, release_lock:
            article = load_article(article_id)
            if article['trashed'] or value.get('version') != article['version']:
                fail('文章已变化或位于回收站，请刷新后重试', 409)
            with store.connect() as db:
                old = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
                if old:
                    if (old['article'], old['version'], old['operation']) != (article_id, article['version'], operation):
                        fail('requestId 已用于另一项操作', 409)
                    return dict(old) | {'result': json.loads(old['result'])}
                db.execute('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)', (job_id, article_id, article['version'], operation, 'validating', '{}', now(), now()))
            try:
                result = publisher.plan(article, operation)
                state = 'dry_run_ready'
            except HTTPException as error:
                result, state = {'error': error.detail}, 'failed'
            except Exception:
                result, state = {'error': '读取正式分支失败；内容已保留，可新建试运行重试'}, 'failed'
            with store.connect() as db:
                db.execute('UPDATE jobs SET state=?,result=?,updated=? WHERE id=?', (state, encode(result), now(), job_id))
            return {'id': job_id, 'state': state, 'result': result}

    # An interrupted plan is never mistaken for deployment or silently replayed on restart.
    with store.connect() as db:
        db.execute("UPDATE jobs SET state='failed',result=?,updated=? WHERE state='validating'", (encode({'error': '服务重启中断试运行，请重试'}), now()))
        db.execute("UPDATE candidates SET github_state='failed',error=? WHERE github_state='submitting'", ('服务重启中断发布；内容与已有提交编号保留，请重试',))
    releases.refresh_status()
    @app.get('/api/assets')
    def asset_list(request:Request):
        session(request)
        with store.connect() as db:items=[dict(row) for row in db.execute('SELECT * FROM assets ORDER BY created DESC')]
        return {'items':items,'builtin':[{'title':t['title'],'artist':t['artist'],'src':'/api/music/builtin/'+str(i)} for i,t in enumerate(library.builtin_music(settings.program))],'deployed':assets.current(store),'musicConfigured':settings.music_root is not None,'fileUploadsEnabled':False}

    @app.get('/api/music/builtin/{index}')
    def builtin_audio(request: Request, index: int):
        session(request)
        tracks = library.builtin_music(settings.program)
        if index < 0 or index >= len(tracks): fail('博客音乐不存在',404)
        item = tracks[index]; path = settings.program / item['path']
        with path.open('rb') as source:
            if hashlib.file_digest(source,'sha256').hexdigest()!=item['sha256']: fail('博客音乐校验失败',409)
        return FileResponse(path)

    @app.post('/api/assets')
    async def asset_upload(request:Request):
        session(request,True)
        if request.query_params.get('kind','music')!='music':fail('普通文件上传仅预留，尚未启用',409)
        temporary=store.data/'audio'/(secrets.token_hex(16)+'.part')
        size=0
        try:
            with temporary.open('xb') as output:
                async for chunk in request.stream():
                    size+=len(chunk)
                    check_capacity(store.data,settings.minimum_free,len(chunk))
                    output.write(chunk)
            return await run_in_threadpool(assets.save,store,temporary,request.query_params.get('title','')[:160],settings.minimum_free)
        finally:temporary.unlink(missing_ok=True)

    @app.patch('/api/assets/{identity}')
    async def asset_edit(request:Request,identity:str):
        session(request,True);value=await payload(request)
        with store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            item=db.execute('SELECT * FROM assets WHERE id=?',(identity,)).fetchone()
            if not item:fail('音乐不存在',404)
            if value.get('version')!=item['version']:fail('音乐版本冲突，原内容保留，请刷新',409)
            title,artist=value.get('title'),value.get('artist','')
            if not isinstance(title,str) or not title.strip() or len(title)>160 or not isinstance(artist,str) or len(artist)>160:fail('音乐标题或歌手无效')
            db.execute('UPDATE assets SET title=?,artist=?,version=version+1 WHERE id=?',(title.strip(),artist.strip(),identity))
            return dict(db.execute('SELECT * FROM assets WHERE id=?',(identity,)).fetchone())

    @app.get('/api/assets/{identity}')
    def asset_file(request:Request,identity:str):
        session(request)
        with store.connect() as db:item=db.execute('SELECT * FROM assets WHERE id=?',(identity,)).fetchone()
        if not item:fail('音乐不存在',404)
        path=assets.file_path(store,item)
        if not path.is_file() or hashlib.file_digest(path.open('rb'),'sha256').hexdigest()!=identity:fail('音乐缺失或校验失败',409)
        return FileResponse(path,media_type=item['mime'])

    @app.post('/api/music/deploy')
    async def music_deploy(request:Request):
        session(request,True);value=await payload(request)
        def execute():
            try:
                with release_lock:return assets.deploy(store,settings.music_root,value.get('requestId'),value.get('versions'),settings.minimum_free)
            except OSError:
                fail('音乐部署存储暂不可写或不可用；私人音乐和上一部署保留，请维护人员检查后重试',503)
        return await run_in_threadpool(execute)

    @app.post('/api/music/rollback')
    def music_rollback(request:Request):
        session(request,True)
        with release_lock,store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current=db.execute("SELECT deployment FROM music_pointers WHERE name='current'").fetchone()
            previous=db.execute("SELECT deployment FROM music_pointers WHERE name='previous'").fetchone()
            if not current or not previous:fail('没有上一版音乐部署',409)
            db.execute("UPDATE music_pointers SET deployment=? WHERE name='current'",(previous['deployment'],))
            db.execute("UPDATE music_pointers SET deployment=? WHERE name='previous'",(current['deployment'],))
        return assets.current(store)

    @app.get('/site-music.json')
    def site_music(request:Request):
        site_access(request);return assets.public_snapshot(assets.current(store))

    @app.get('/site-music/{name}')
    def site_music_file(request:Request,name:str):
        site_access(request)
        snapshot=assets.current(store)
        item=next((t for t in snapshot['tracks'] if t['id']+'.'+t['extension']==name),None) if snapshot else None
        if not item or settings.music_root is None:fail('部署音乐不存在',404)
        path=settings.music_root/name
        if not path.is_file() or hashlib.file_digest(path.open('rb'),'sha256').hexdigest()!=item['id']:fail('NAS 音乐校验失败',409)
        return FileResponse(path,media_type=item['mime'])

    if settings.dist and settings.dist.is_dir():
        app.mount('/admin', StaticFiles(directory=settings.dist, html=True), name='editor')
    @app.get('/{path:path}')
    def site(request: Request, path: str):
        from fastapi.responses import RedirectResponse
        if settings.program is None:
            return RedirectResponse('/admin/')
        try:
            site_access(request)
        except HTTPException as error:
            # Browser entry points need a usable login flow. Assets and APIs keep
            # their 401 responses; never return private content before login.
            if error.status_code == 401 and path in ('', 'site', 'site/', 'index.html'):
                return RedirectResponse('/admin/?next=blog', status_code=303)
            raise
        manifest = program_manifest(settings.program)
        name = 'index.html' if path in ('', 'site', 'site/') else path
        if name not in manifest['files']:
            fail('文件不存在', 404)
        file = contained_file(settings.program, name)
        if digest(file.read_bytes()) != manifest['files'][name]:
            fail('网站资源内容校验失败，原验收版本仍保留',409)
        return FileResponse(file)
    return app


def configured_app():
    if any(value for key, value in os.environ.items() if key.startswith('CMS_GITHUB_') and
           not (key == 'CMS_GITHUB_ENABLED' and value == '0')):
        raise ValueError('此独立站点禁止配置 GitHub 发布')
    development = os.environ.get('CMS_DEV') == '1'
    project = Path(__file__).resolve().parents[1]
    repo = Path(os.environ.get('CMS_SOURCE') or os.environ.get('CMS_REPO') or project / 'release/source')
    origin = os.environ.get('CMS_ORIGIN', 'http://127.0.0.1:8788' if development else 'https://slow-notes-admin.invalid')
    from urllib.parse import urlparse
    public_origin = os.environ.get('CMS_PUBLIC_ORIGIN')
    allowed_hosts = []
    if public_origin:
        public = urlparse(public_origin)
        if (public.scheme != 'https' and not (development and public.hostname in ('127.0.0.1', 'localhost')) or
                not public.hostname or public.path or public.query or public.fragment or public.username):
            raise ValueError('CMS_PUBLIC_ORIGIN 必须是合法的站点 HTTPS origin')
        allowed_hosts.append(public.hostname)
    if not development:
        if os.environ.get('CMS_REQUIRE_MOUNTS') != '1':
            raise RuntimeError('生产服务必须显式启用独立站点挂载守卫')
        if not os.environ.get('CMS_MOUNT_SPEC') or not os.environ.get('CMS_MOUNT_ATTESTATION'):
            raise RuntimeError('生产服务缺少独立挂载约束或凭据路径')
        data = Path(os.environ.get('CMS_DATA', ''))
        expected_data = Path('/mnt/mmcblk0p6/blog-sites/slow-notes/private')
        if data.as_posix() != expected_data.as_posix() or data.resolve() != expected_data:
            raise RuntimeError('生产私人数据只能使用 slow-notes 独立目录；拒绝旧主站或其他站点路径')
    return create_app(Settings(data=Path(os.environ['CMS_DATA']), repo=repo,
                              origin=origin,
                              development=development,
                              dist=Path(os.environ.get('CMS_EDITOR_DIST', project / 'cms-dist')),
                              program=Path(os.environ['CMS_PROGRAM']) if os.environ.get('CMS_PROGRAM') else None,
                              router_enabled=os.environ.get('CMS_ROUTER_ENABLED') == '1',
                              require_initialized=not development,
                              minimum_free=int(os.environ.get('CMS_MINIMUM_FREE', '805306368' if not development else '0')),
                              media_quota=int(os.environ.get('CMS_MEDIA_QUOTA', '536870912')),
                              storage_guard=configured_guard(),
                              backup_status=Path(os.environ['CMS_BACKUP_STATUS']) if os.environ.get('CMS_BACKUP_STATUS') else None,
                              music_root=Path(os.environ['CMS_MUSIC_ROOT']) if os.environ.get('CMS_MUSIC_ROOT') else None,
                              site_id=os.environ.get('CMS_SITE_ID','slow-notes'),
                              allowed_hosts=tuple(allowed_hosts),
                              lan_readonly=os.environ.get('CMS_LAN_READONLY') == '1'))
