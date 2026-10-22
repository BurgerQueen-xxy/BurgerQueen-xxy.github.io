"""Immutable local candidates and atomic, reversible per-site publication pointers."""
import json
import os
import re
import tempfile
import threading
from pathlib import Path

from .content import fail, safe_repo_path, target_path, stable_id, MEDIA_REF
from .publisher import MAX_PUBLIC_BYTES, POST_PATH, SHA256, contained_file
from .store import digest, encode, now


def program_manifest(program, verify_files=False):
    if program is None:
        return None
    raw = contained_file(program, 'program.json').read_bytes()
    pinned = os.environ.get('CMS_PROGRAM_MANIFEST_SHA256')
    if pinned and digest(raw) != pinned:
        fail('网站程序清单与维护人员固定的哈希不符', 409)
    try:
        manifest = json.loads(raw)
        if not (isinstance(manifest, dict) and manifest.get('schema') == 1 and
                manifest.get('adapter') == 'slow-notes-v1' and manifest.get('site') == 'slow-notes' and
                manifest.get('contentMode') == 'runtime' and
                re.fullmatch(r'[a-f0-9]{40}', manifest.get('sourceCommit', '')) and
                isinstance(manifest.get('contentPaths'), list) and
                isinstance(manifest.get('files'), dict) and 'index.html' in manifest['files']):
            raise ValueError()
        if (len(manifest['files']) > 20000 or len(manifest['contentPaths']) > 20000 or
                len(set(manifest['contentPaths'])) != len(manifest['contentPaths'])):
            raise ValueError()
        for name in manifest['contentPaths']:
            if not isinstance(name, str) or not POST_PATH.fullmatch(name):
                raise ValueError()
        unsigned = {key: value for key, value in manifest.items() if key != 'bundleId'}
        if manifest.get('bundleId') != digest(encode(unsigned)):
            raise ValueError()
        for name, checksum in manifest['files'].items():
            safe_repo_path(name)
            if (name in ('program.json', 'snapshot.json', 'router-content.json', 'data/posts.json', 'rss.xml', 'feed.xml') or
                    name.split('/')[0] in ('api', 'admin', 'cms', 'source', 'content', 'private', 'data-private') or
                    not isinstance(checksum, str) or not SHA256.fullmatch(checksum)):
                raise ValueError()
            if verify_files:
                path = contained_file(program, name)
                if digest(path.read_bytes()) != checksum:
                    raise ValueError()
    except (ValueError, TypeError, KeyError, OSError):
        fail('不是已校验的 slow-notes runtime 程序包', 409)
    return manifest


def candidate_view(row):
    item = dict(row)
    item['snapshot'] = json.loads(item['snapshot'])
    return item


def candidate_summary(item):
    program = item['snapshot'].get('program')
    article = item['snapshot']['article']
    return item | {'articleTitle': article.get('title', article['document']['slug']),
                   'snapshot': {'sha256': item['snapshot']['sha256'], 'operation': item['snapshot']['operation'],
                                'publicChanges': len(item['snapshot']['plan']['changes']),
                                'program': {'sourceCommit': program['sourceCommit']} if program else None}}


class Releases:
    def __init__(self, store, publisher, program=None, router_enabled=False, site_id='slow-notes'):
        if site_id != 'slow-notes':
            raise ValueError('此适配器仅支持 slow-notes')
        self.store, self.publisher, self.program = store, publisher, program
        self.router_enabled, self.site_id = router_enabled, site_id
        self.status_lock = threading.Lock()
        with self.store.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS catalog_owners(candidate TEXT PRIMARY KEY, owners TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS catalog_integrity(candidate TEXT PRIMARY KEY, sha256 TEXT NOT NULL)')
        manifest = program_manifest(program, verify_files=True)
        if manifest:
            self.publisher.require_head(manifest['sourceCommit'])
            if sorted(manifest['contentPaths']) != publisher.content_paths(manifest['sourceCommit']):
                fail('程序与源快照文章目录不一致', 409)
        self.refresh_status()

    def refresh_status(self):
        """LuCI reads only bounded operational metadata, never the private database."""
        with self.status_lock, self.store.connect() as db:
            row = db.execute("SELECT candidate FROM pointers WHERE name='router_current'").fetchone()
            current = row['candidate'] if row and not (row['candidate'] or '').startswith('baseline:') else None
            value = {'schema': 1, 'site': self.site_id, 'githubConfigured': False,
                     'routerCurrent': current, 'latest': None, 'lastSubmitted': None, 'lastOnline': None}
            raw = encode(value).encode()
            target = self.store.data / 'operational-status.json'
            if target.is_file() and not target.is_symlink() and target.read_bytes() == raw:
                return value
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(dir=self.store.data, prefix='.operational-', delete=False) as output:
                    temporary = Path(output.name)
                    output.write(raw)
                    output.flush()
                    os.fsync(output.fileno())
                temporary.chmod(0o600)
                os.replace(temporary, target)
            finally:
                if temporary:
                    temporary.unlink(missing_ok=True)
            return value

    def get(self, candidate_id):
        with self.store.connect() as db:
            row = db.execute('SELECT * FROM candidates WHERE id=?', (candidate_id,)).fetchone()
        if not row:
            fail('候选版本不存在', 404)
        return candidate_view(row)

    def freeze(self, candidate_id, article, operation):
        with self.store.connect() as db:
            old = db.execute('SELECT * FROM candidates WHERE id=?', (candidate_id,)).fetchone()
        if old:
            item = candidate_view(old)
            if (item['article'], item['version'], item['snapshot']['operation']) != (article['id'], article['version'], operation):
                fail('候选编号已经用于不同内容', 409)
            self.verify(item)
            return item
        if operation == 'unpublish' and not article['source_path']:
            catalog = self.catalog()
            if article['id'] not in self.owners(catalog).values():
                fail('这篇私人文章尚未在路由器部署', 409)
        plan = self.publisher.plan(article, operation)
        manifest = program_manifest(self.program, verify_files=True)
        if manifest:
            self.publisher.require_head(manifest['sourceCommit'])
        snapshot = {'article': article, 'operation': operation, 'plan': plan, 'program': manifest}
        snapshot['sha256'] = digest(encode(snapshot))
        with self.store.connect() as db:
            db.execute('INSERT INTO candidates VALUES(?,?,?,?,?,?,?,?,?,?)',
                       (candidate_id, article['id'], article['version'], encode(snapshot), 'staged', 'disabled', None, None, now(), None))
        return self.get(candidate_id)

    def verify_frozen(self, candidate):
        snapshot = dict(candidate['snapshot'])
        expected = snapshot.pop('sha256')
        if digest(encode(snapshot)) != expected:
            fail('候选快照校验失败', 409)
        manifest = snapshot.get('program')
        if manifest and (manifest.get('schema') != 1 or manifest.get('site') != self.site_id or
                         manifest.get('adapter') != 'slow-notes-v1' or manifest.get('contentMode') != 'runtime' or
                         manifest.get('sourceCommit') != snapshot['plan']['baseCommit']):
            fail('冻结版本不是兼容的 slow-notes 程序', 409)
        return snapshot

    def verify(self, candidate, verify_files=True):
        snapshot = self.verify_frozen(candidate)
        self.publisher.require_head(snapshot['plan']['baseCommit'])
        if snapshot['program'] != program_manifest(self.program, verify_files=verify_files):
            fail('网站程序版本已变化，请重新冻结候选；旧候选不能替换已验收程序', 409)
        if verify_files:
            for change in snapshot['plan']['changes']:
                if change['action'] == 'write':
                    self.publisher.change_bytes(change)
        return snapshot

    def activate(self, candidate_id):
        candidate = self.get(candidate_id)
        snapshot = self.verify(candidate)
        if not self.router_enabled or self.program is None:
            fail('路由器部署尚未配置；候选已冻结但未部署', 409)
        active = self.catalog()
        if active['candidate'] == candidate_id:
            return candidate
        documents = active['documents']
        owners = self.owners(active)
        baseline_documents, baseline_owners = dict(documents), dict(owners)
        article = snapshot['article']
        old, target = article['source_path'], target_path(article['document'])
        if documents.get(target) and owners.get(target) != article['id']:
            fail('此文件名已由另一篇部署文章使用', 409)
        # Private articles have no source_path. Track ownership in each frozen site
        # catalogue so renaming/removing them updates their actual deployed path.
        for name, owner in list(owners.items()):
            if owner == article['id'] and (name != target or snapshot['operation'] == 'unpublish'):
                documents[name] = None
                owners.pop(name)
        if old and (snapshot['operation'] == 'unpublish' or old != target):
            documents[old] = None
            owners.pop(old, None)
        documents[target] = article['document']['source'] if snapshot['operation'] == 'publish' else None
        if snapshot['operation'] == 'publish':
            owners[target] = article['id']
        else:
            owners.pop(target, None)
        if len(encode(documents).encode()) > MAX_PUBLIC_BYTES:
            fail('路由器正文目录超过 8 MiB；草稿及上一部署保留', 413)
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current = db.execute("SELECT candidate FROM pointers WHERE name='router_current'").fetchone()
            existing = db.execute('SELECT documents FROM catalogs WHERE candidate=?', (candidate_id,)).fetchone()
            if existing and json.loads(existing['documents']) != documents:
                fail('此候选已有不同的站点快照，不能再次应用到新基线', 409)
            self.save_catalog(db, candidate_id, documents, owners)
            previous_id = current['candidate'] if current else None
            if previous_id is None:
                previous_id = 'baseline:' + digest(encode(baseline_documents))
                self.save_catalog(db, previous_id, baseline_documents, baseline_owners)
            db.execute("INSERT OR REPLACE INTO pointers VALUES('router_previous',?)", (previous_id,))
            db.execute("INSERT OR REPLACE INTO pointers VALUES('router_current',?)", (candidate_id,))
            db.execute("UPDATE candidates SET router_state='router_deployed' WHERE id=?", (candidate_id,))
        self.refresh_status()
        return self.get(candidate_id)

    def owners(self, catalog):
        if catalog['candidate'] is None:
            return {name: stable_id(name, source) for name, source in catalog['documents'].items() if source}
        with self.store.connect() as db:
            row = db.execute('SELECT owners FROM catalog_owners WHERE candidate=?', (catalog['candidate'],)).fetchone()
        if row is None:
            fail('此站点部署所有权记录缺失，请先恢复有效备份', 409)
        return json.loads(row['owners'])

    @staticmethod
    def save_catalog(db, identity, documents, owners):
        checksum = digest(encode({'documents': documents, 'owners': owners}))
        existing = db.execute('SELECT sha256 FROM catalog_integrity WHERE candidate=?', (identity,)).fetchone()
        if existing and existing['sha256'] != checksum:
            fail('已冻结的站点目录不能改写', 409)
        db.execute('INSERT OR IGNORE INTO catalogs VALUES(?,?)', (identity, encode(documents)))
        db.execute('INSERT OR IGNORE INTO catalog_owners VALUES(?,?)', (identity, encode(owners)))
        db.execute('INSERT OR IGNORE INTO catalog_integrity VALUES(?,?)', (identity, checksum))

    def saved_catalog(self, identity):
        # A deployed catalogue is complete and immutable. Reading/rolling it back
        # must keep working after an independently installed compatible program update.
        with self.store.connect() as db:
            row = db.execute('SELECT documents FROM catalogs WHERE candidate=?', (identity,)).fetchone()
            owners = db.execute('SELECT owners FROM catalog_owners WHERE candidate=?', (identity,)).fetchone()
            checksum = db.execute('SELECT sha256 FROM catalog_integrity WHERE candidate=?', (identity,)).fetchone()
        if not row or not owners or not checksum:
            fail('冻结部署目录不完整；请恢复有效备份', 409)
        documents, ownership = json.loads(row['documents']), json.loads(owners['owners'])
        if digest(encode({'documents': documents, 'owners': ownership})) != checksum['sha256']:
            fail('冻结部署目录校验失败', 409)
        if not identity.startswith('baseline:'):
            self.verify_frozen(self.get(identity))
        media = set()
        for name, source in documents.items():
            if not POST_PATH.fullmatch(name) or source is not None and not isinstance(source, str):
                fail('冻结部署目录含有越界文件', 409)
            if source:
                media.update(MEDIA_REF.findall(source))
        for media_id in media:
            path = contained_file(self.store.data / 'media', media_id + '.webp')
            if digest(path.read_bytes()) != media_id:
                fail('冻结部署图片校验失败', 409)
        return documents

    def catalog(self):
        manifest = program_manifest(self.program)
        with self.store.connect() as db:
            pointer = db.execute("SELECT candidate FROM pointers WHERE name='router_current'").fetchone()
            candidate = pointer['candidate'] if pointer else None
            if candidate is None:
                if not manifest:
                    return {'candidate': None, 'documents': {}}
                documents = self.publisher.public_documents(manifest['sourceCommit'])
            else:
                documents = self.saved_catalog(candidate)
        return {'candidate': None if candidate and candidate.startswith('baseline:') else candidate, 'documents': documents}

    def rollback(self):
        with self.store.connect() as db:
            previous = db.execute("SELECT candidate FROM pointers WHERE name='router_previous'").fetchone()
            current = db.execute("SELECT candidate FROM pointers WHERE name='router_current'").fetchone()
        if not previous or not current:
            fail('没有可恢复的上一版本', 409)
        self.saved_catalog(previous['candidate'])
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute("UPDATE pointers SET candidate=? WHERE name='router_current'", (previous['candidate'],))
            db.execute("UPDATE pointers SET candidate=? WHERE name='router_previous'", (current['candidate'],))
        self.refresh_status()
        restored = None if previous['candidate'].startswith('baseline:') else previous['candidate']
        return {'candidate': restored, 'routerCurrent': restored, 'baseline': restored is None}

    def approve(self, candidate_id):
        fail('此独立站点不支持 GitHub 批准或提交', 409)

    def poll(self, candidate_id):
        return self.get(candidate_id)
