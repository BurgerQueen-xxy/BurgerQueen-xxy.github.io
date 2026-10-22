"""Read-only, site-bound source snapshots. This module never executes Git or network IO."""
import json
import re
from pathlib import Path

from .content import MEDIA_REF, fail, image_paths, parse_source, safe_repo_path, target_path, validate_document
from .store import digest

MAX_OBJECT_BYTES = 100 * 1024 * 1024
MAX_PUBLIC_BYTES = 8 * 1024 * 1024
POST_PATH = re.compile(r'content/posts/[a-z0-9]+(?:-[a-z0-9]+)*\.md')
SHA256 = re.compile(r'[a-f0-9]{64}')


def contained_file(root, name):
    """Reject traversal and symlinks at every component, not only the final filename."""
    safe_repo_path(name)
    root = Path(root)
    if root.is_symlink():
        fail('快照目录不得为符号链接', 409)
    path = root
    for part in name.split('/'):
        path = path / part
        if path.is_symlink():
            fail('快照文件不得使用符号链接', 409)
    if not path.resolve().is_relative_to(root.resolve()) or not path.is_file():
        fail('快照文件不存在或超出站点目录', 409)
    return path


class SnapshotPublisher:
    def __init__(self, repo: Path, store):
        if repo.is_symlink():
            fail('源快照不得为符号链接', 409)
        self.repo = repo.resolve()
        self.store = store
        self.manifest()

    def manifest(self):
        path = contained_file(self.repo, 'snapshot.json')
        if path.stat().st_size > 2 * 1024 * 1024:
            fail('源快照清单过大', 409)
        try:
            value = json.loads(path.read_text(encoding='utf-8'))
            valid = (isinstance(value, dict) and value.get('schema') == 1 and
                     value.get('site') == 'slow-notes' and
                     re.fullmatch(r'[a-f0-9]{40}', value.get('sourceCommit', '')) and
                     isinstance(value.get('files'), dict) and 0 < len(value['files']) <= 20000)
            if not valid:
                raise ValueError()
            for name, checksum in value['files'].items():
                safe_repo_path(name)
                if not (name == 'content/site.json' or POST_PATH.fullmatch(name) or name.startswith('public/assets/')):
                    raise ValueError()
                if not isinstance(checksum, str) or not SHA256.fullmatch(checksum):
                    raise ValueError()
        except (ValueError, TypeError, KeyError):
            fail('不是 slow-notes 的有效源快照', 409)
        return value

    def latest(self):
        return self.manifest()['sourceCommit']

    def require_head(self, head):
        manifest = self.manifest()
        if head != manifest['sourceCommit']:
            fail('源快照版本已变化，请重新冻结候选；旧候选不能用于新程序包', 409)
        return manifest

    def read(self, head, path):
        return self.read_bounded(head, path)

    def read_bounded(self, head, path):
        safe_repo_path(path)
        manifest = self.require_head(head)
        expected = manifest['files'].get(path)
        if expected is None:
            return None
        file = contained_file(self.repo, path)
        if file.stat().st_size > MAX_OBJECT_BYTES:
            fail('源快照单个文件超过 100 MiB', 413)
        raw = file.read_bytes()
        if digest(raw) != expected:
            fail('源快照文件哈希不符，拒绝读取', 409)
        return raw

    def content_paths(self, head):
        return sorted(name for name in self.require_head(head)['files'] if POST_PATH.fullmatch(name))

    def import_candidates(self):
        head = self.latest()
        return head, self.content_paths(head)

    def public_documents(self, head):
        documents, size = {}, 0
        for name in self.content_paths(head):
            raw = self.read_bounded(head, name)
            size += len(raw)
            if size > MAX_PUBLIC_BYTES:
                fail('公开文字目录超过 8 MiB，需要先调整分页与运行资源；草稿保留', 413)
            source = raw.decode('utf-8-sig')
            meta, _ = parse_source(source)
            validate_document({'category': meta.get('category'), 'slug': Path(name).stem, 'source': source})
            if MEDIA_REF.search(source):
                fail('打包基线不能包含私人媒体地址', 409)
            documents[name] = source
        return documents

    def change_bytes(self, change):
        if 'text' in change:
            raw = change['text'].encode()
        elif 'mediaId' in change:
            media_id = change['mediaId']
            if not isinstance(media_id, str) or not SHA256.fullmatch(media_id):
                fail('无效的图片内容引用', 409)
            with self.store.connect() as db:
                row = db.execute('SELECT filename FROM media WHERE id=?', (media_id,)).fetchone()
            if not row or row['filename'] != media_id + '.webp':
                fail('冻结图片不存在', 409)
            file = contained_file(self.store.data / 'media', row['filename'])
            if file.stat().st_size > MAX_OBJECT_BYTES:
                fail('冻结图片过大', 413)
            raw = file.read_bytes()
            if digest(raw) != media_id:
                fail('媒体内容与稳定哈希不符', 409)
        else:
            fail('不支持的冻结对象', 409)
        if len(raw) != change['bytes'] or digest(raw) != change['sha256']:
            fail('冻结发布对象的大小或内容哈希不符', 409)
        return raw

    def plan(self, article, operation):
        document = validate_document(article['document'])
        head = self.latest()
        target = target_path(document)
        previous = article['source_path']
        if previous:
            if not POST_PATH.fullmatch(previous):
                fail('源文章不属于此站点', 409)
            current = self.read_bounded(head, previous)
            if current is None or digest(current) != article['base_hash']:
                fail('打包源文章已修改或删除；请读取源快照对照后合并', 409)
        if target != previous and self.read_bounded(head, target) is not None:
            fail('目标文件已存在；不能覆盖另一篇文章', 409)
        changes = []
        if operation == 'unpublish':
            changes.append({'path': previous or target, 'action': 'delete'})
        else:
            source = document['source']
            for media_id in sorted(set(MEDIA_REF.findall(source))):
                with self.store.connect() as db:
                    media = db.execute('SELECT * FROM media WHERE id=?', (media_id,)).fetchone()
                if not media:
                    fail('正文或封面引用了不存在的私人图片')
                raw = contained_file(self.store.data / 'media', media['filename']).read_bytes()
                change = {'path': f'public/assets/cms-{media_id}.webp', 'action': 'write',
                          'sha256': media_id, 'bytes': len(raw), 'mediaId': media_id}
                self.change_bytes(change)
                changes.append(change)
            meta, _ = parse_source(source)
            urls = re.findall(r'!\[[^\]]*\]\(([^\s)]+)', source)
            urls += [meta[key] for key in ('cover', 'previewImage', 'detailImage', 'stampImage') if meta.get(key)]
            for url in urls:
                if not isinstance(url, str):
                    fail('图片地址必须是文本')
                if MEDIA_REF.fullmatch(url):
                    continue
                if not any(self.read_bounded(head, path) is not None for path in image_paths(document, url)):
                    fail('正文或封面存在缺失图片，请使用媒体库重新插入')
            changes.append({'path': target, 'action': 'write', 'sha256': digest(source),
                            'bytes': len(source.encode()), 'text': source})
            if previous and previous != target:
                changes.append({'path': previous, 'action': 'delete'})
        return {'mode': 'local-snapshot', 'baseCommit': head, 'sourceCommit': head,
                'articleId': article['id'], 'version': article['version'], 'operation': operation,
                'changes': changes, 'committed': False, 'deployed': False,
                'next': '核验完成；冻结候选后可单独部署到此站点'}
