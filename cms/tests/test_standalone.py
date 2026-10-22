import io
import json
import secrets
import uuid
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from cms.app import Settings, configured_app, create_app
from cms.content import SECTIONS, validate_document
from cms.publisher import SnapshotPublisher
from cms.releases import program_manifest
from cms.store import Store, digest, encode

ORIGIN = 'http://127.0.0.1:8787'


def document(body='正文', slug='new-note', category='其他', cover='assets/cover.webp'):
    return {'category': category, 'slug': slug,
            'source': f'---\ntitle: 一篇文章\ndate: 2026-10-23\ncategory: {category}\ntags: ["生活"]\n'
                      f'excerpt: 摘要\ncover: {cover}\n---\n\n{body}'}


def png(color='#416844'):
    output = io.BytesIO()
    Image.new('RGB', (64, 32), color).save(output, format='PNG')
    return output.getvalue()


def write_bundle(tmp_path):
    source, program = tmp_path / 'source', tmp_path / 'program'
    (source / 'content/posts').mkdir(parents=True)
    (source / 'public/assets').mkdir(parents=True)
    (source / 'content/site.json').write_text(encode({'categories': list(SECTIONS)}), encoding='utf-8')
    (source / 'content/posts/imported.md').write_text(document('原来公开的正文', 'imported', '收藏')['source'], encoding='utf-8')
    (source / 'public/assets/cover.webp').write_bytes(png())
    manifest = {'schema': 1, 'site': 'slow-notes', 'sourceCommit': 'a' * 40,
                'files': {path.relative_to(source).as_posix(): digest(path.read_bytes()) for path in sorted(source.rglob('*')) if path.is_file()}}
    (source / 'snapshot.json').write_text(encode(manifest), encoding='utf-8')
    program.mkdir()
    (program / 'index.html').write_text('<!doctype html><title>Slow Notes</title>', encoding='utf-8')
    value = {'schema': 1, 'adapter': 'slow-notes-v1', 'site': 'slow-notes', 'contentMode': 'runtime',
             'sourceCommit': manifest['sourceCommit'], 'contentPaths': ['content/posts/imported.md'],
             'files': {'index.html': digest((program / 'index.html').read_bytes())}}
    value['bundleId'] = digest(encode(value))
    (program / 'program.json').write_text(encode(value), encoding='utf-8')
    return source, program


@pytest.fixture
def system(tmp_path):
    source, program = write_bundle(tmp_path)
    settings = Settings(tmp_path / 'private', source, ORIGIN, True, program=program,
                        router_enabled=True, lan_readonly=True, allowed_hosts=('notes.lan',))
    app = create_app(settings)
    password = secrets.token_urlsafe(24)
    app.state.store.initialize_admin(password)
    with TestClient(app, base_url=ORIGIN, headers={'Origin': ORIGIN}) as client:
        response = client.post('/api/login', json={'password': password})
        assert response.status_code == 200, response.text
        client.headers['X-CSRF-Token'] = response.json()['csrf']
        with TestClient(app, base_url='http://notes.lan') as public:
            yield client, public, app, settings, password


def create(client, doc=None):
    response = client.post('/api/articles', json={'id': str(uuid.uuid4()), 'document': doc or document()})
    assert response.status_code == 200, response.text
    return response.json()


def freeze(client, article, operation='publish'):
    response = client.post(f"/api/articles/{article['id']}/candidates",
                           json={'requestId': str(uuid.uuid4()), 'version': article['version'], 'operation': operation})
    assert response.status_code == 200, response.text
    return response.json()


def deploy(client, candidate):
    return client.post(f"/api/candidates/{candidate['id']}/deploy-router", json={})


def test_login_security_public_host_and_csrf(system):
    client, public, app, settings, password = system
    assert public.get('/healthz').json() == {'ready': True, 'site': 'slow-notes'}
    assert public.get('/').status_code == 200
    assert public.get('/api/articles').status_code == 401
    assert public.get('/api/session').status_code == 401
    assert client.post('/api/articles', json={}, headers={'X-CSRF-Token': 'wrong'}).status_code == 403
    assert client.post('/api/login', json={'password': password}, headers={'Origin': 'http://notes.lan'}).status_code == 403
    assert client.get('/api/articles', headers={'Sec-Fetch-Site': 'cross-site'}).status_code == 403
    assert public.get('/healthz', headers={'Host': 'other-site.lan'}).status_code == 400
    cookie = client.cookies.get('cms_session_slow-notes')
    assert cookie
    assert client.post('/api/logout', json={}).status_code == 200
    client.cookies.set('cms_session_slow-notes', cookie)
    assert client.get('/api/articles').status_code == 401


def test_production_cookies_and_persistent_rate_limit(system):
    client, _, app, settings, password = system
    secure = create_app(replace(settings, origin='https://editor.lan', development=False))
    with TestClient(secure, base_url='https://editor.lan', headers={'Origin': 'https://editor.lan'}) as browser:
        response = browser.post('/api/login', json={'password': password})
        cookie = response.headers['set-cookie'].lower()
        assert 'secure' in cookie and 'httponly' in cookie and 'samesite=strict' in cookie
        assert 'max-age=31536000' in response.headers['strict-transport-security']
    client.post('/api/logout', json={})
    for _ in range(5):
        assert client.post('/api/login', json={'password': 'incorrect'}).status_code == 401
    assert client.post('/api/login', json={'password': password}).status_code == 429
    restarted = create_app(settings)
    with TestClient(restarted, base_url=ORIGIN, headers={'Origin': ORIGIN}) as other:
        assert other.post('/api/login', json={'password': password}).status_code == 429


def test_save_stays_private_import_uses_frontmatter_category(system):
    client, public, app, _, _ = system
    baseline = public.get('/router-content.json').json()
    article = create(client, document('绝不能提前公开的草稿'))
    assert public.get('/router-content.json').json() == baseline
    assert '绝不能提前公开' not in public.get('/').text
    imported = client.post('/api/import', json={}).json()
    assert imported['errors'] == [] and len(imported['imported']) == 1
    remote = client.get('/api/articles/' + imported['imported'][0]).json()
    assert remote['document']['category'] == '收藏'
    assert remote['source_path'] == 'content/posts/imported.md'
    assert client.post('/api/import', json={}).json()['skipped'] == ['content/posts/imported.md']
    assert public.get('/source/snapshot.json').status_code == 404
    assert public.get('/data/posts.json').status_code == 404


@pytest.mark.parametrize('change', [
    {'category': 'posts'}, {'slug': '../other'}, {'slug': 'Upper'}, {'slug': '中文'},
    {'slug': 'a--b'}, {'slug': 'a-'}, {'source': document()['source'].replace('category: 其他', 'category: 金子')},
    {'source': document()['source'].replace('["生活"]', '[生活]')},
    {'source': document()['source'].replace('title: 一篇文章', 'title: |\n  多行')},
    {'source': document()['source'].replace('2026-10-23', '2026-02-30')},
    {'source': document()['source'].replace('date: 2026-10-23', 'date: ["2026-10-23"]')},
    {'source': document()['source'].replace('assets/cover.webp', 'https://example.com/image.webp')},
])
def test_document_validation(change):
    with pytest.raises(HTTPException):
        validate_document(document() | change)


def test_frozen_version_is_immutable_and_initial_rollback_restores_baseline(system):
    client, public, app, _, _ = system
    baseline = public.get('/router-content.json').json()
    article = create(client, document('已冻结的正文'))
    first = freeze(client, article)
    assert first['articleTitle'] == '一篇文章'
    response = client.put('/api/articles/' + article['id'], json={'version': 1, 'document': document('尚未冻结的新草稿')})
    assert response.status_code == 200
    assert deploy(client, first).status_code == 200
    catalog = public.get('/router-content.json').json()
    assert catalog['candidate'] == first['id']
    assert '已冻结的正文' in catalog['documents']['content/posts/new-note.md']
    assert '尚未冻结' not in encode(catalog)
    assert deploy(client, first).status_code == 200
    rollback = client.post('/api/router/rollback', json={})
    assert rollback.status_code == 200 and rollback.json()['baseline'] is True
    assert public.get('/router-content.json').json() == baseline
    assert client.post('/api/router/rollback', json={}).json()['candidate'] == first['id']
    assert public.get('/router-content.json').json() == catalog


def test_media_album_isolation_and_only_current_deployment_is_public(system):
    client, public, app, _, _ = system
    media = client.post('/api/media?purpose=image', content=png(), headers={'Content-Type': 'image/png'}).json()
    private = client.post('/api/media?purpose=album', content=png('#9f1244'), headers={'Content-Type': 'image/png'}).json()
    assert [item['id'] for item in client.get('/api/media').json()] == [private['id']]
    assert public.get(media['url']).status_code == 401
    assert public.get(media['url'] + '/original').status_code == 401
    assert public.get('/site-media/' + media['id'] + '.webp').status_code == 404
    article = create(client, document('![图](' + media['url'] + ')', cover=media['url']))
    candidate = freeze(client, article)
    assert deploy(client, candidate).status_code == 200
    catalog = public.get('/router-content.json').json()
    assert '/api/media/' not in encode(catalog)
    assert public.get('/site-media/' + media['id'] + '.webp').status_code == 200
    assert public.get('/site-media/' + private['id'] + '.webp').status_code == 404
    assert client.delete(media['url']).status_code == 409
    assert client.delete('/api/album/' + private['id']).status_code == 200
    assert client.get('/api/media').json() == []
    assert client.get(private['url']).status_code == 200
    assert client.post('/api/router/rollback', json={}).status_code == 200
    assert public.get('/site-media/' + media['id'] + '.webp').status_code == 404


def test_slug_ownership_rename_unpublish_and_candidate_reapplication(system):
    client, public, _, _, _ = system
    first_article = create(client, document('第一篇', 'same'))
    first = freeze(client, first_article)
    assert deploy(client, first).status_code == 200
    other_article = create(client, document('第二篇不能覆盖', 'same'))
    assert deploy(client, freeze(client, other_article)).status_code == 409
    renamed = client.put('/api/articles/' + first_article['id'], json={'version': 1, 'document': document('第一篇已改名', 'renamed')}).json()
    assert deploy(client, freeze(client, renamed)).status_code == 200
    catalog = public.get('/router-content.json').json()
    assert catalog['documents']['content/posts/same.md'] is None
    assert '第一篇已改名' in catalog['documents']['content/posts/renamed.md']
    third = create(client, document('另一篇', 'third'))
    assert deploy(client, freeze(client, third)).status_code == 200
    assert deploy(client, first).status_code == 409
    assert public.get('/router-content.json').json()['documents']['content/posts/third.md']
    rename_collision = client.put('/api/articles/' + renamed['id'], json={'version': 2, 'document': document('不能覆盖另一篇', 'third')}).json()
    assert deploy(client, freeze(client, rename_collision)).status_code == 409
    restored_name = client.put('/api/articles/' + renamed['id'], json={'version': 3, 'document': document('第一篇', 'renamed')}).json()
    assert deploy(client, freeze(client, restored_name, 'unpublish')).status_code == 200
    assert public.get('/router-content.json').json()['documents']['content/posts/renamed.md'] is None


def test_conflicts_history_and_trash_are_private(system):
    client, public, _, _, _ = system
    article = create(client)
    url = '/api/articles/' + article['id']
    assert client.put(url, json={'version': 1, 'document': document('新正文')}).status_code == 200
    response = client.put(url, json={'version': 1, 'document': document('冲突正文')})
    assert response.status_code == 409
    history = client.get(url + '/history').json()
    assert len(history['revisions']) == 2 and len(history['conflicts']) == 1
    assert '冲突正文' in history['conflicts'][0]['document']['source']
    assert client.post(url + '/trash', json={'version': 2, 'trashed': True}).status_code == 200
    assert client.get('/api/articles').json() == []
    assert len(client.get('/api/articles?trash=true').json()) == 1
    assert public.get(url + '/history').status_code == 401


def test_source_integrity_and_snapshot_swap_reject_old_candidates(system):
    client, _, app, settings, _ = system
    candidate = freeze(client, create(client))
    path = settings.repo / 'content/posts/imported.md'
    original = path.read_bytes()
    path.write_bytes(original + b'corrupted')
    with pytest.raises(HTTPException):
        app.state.publisher.read('a' * 40, 'content/posts/imported.md')
    path.write_bytes(original)
    manifest_path = settings.repo / 'snapshot.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest['sourceCommit'] = 'b' * 40
    manifest_path.write_text(encode(manifest), encoding='utf-8')
    assert deploy(client, candidate).status_code == 409


def test_program_upgrade_keeps_deployed_catalog_and_allows_rollback_but_not_reapply(system):
    client, public, app, settings, _ = system
    baseline = public.get('/router-content.json').json()
    article = create(client, document('已发布的私人版本'))
    old_candidate = freeze(client, article)
    assert deploy(client, old_candidate).status_code == 200
    deployed = public.get('/router-content.json').json()
    source_path, program_path = settings.repo / 'snapshot.json', settings.program / 'program.json'
    source = json.loads(source_path.read_text(encoding='utf-8'))
    source['sourceCommit'] = 'b' * 40
    post_path = settings.repo / 'content/posts/imported.md'
    post_path.write_text(document('新源码内容，不应自动混入部署', 'imported', '收藏')['source'], encoding='utf-8')
    source['files']['content/posts/imported.md'] = digest(post_path.read_bytes())
    source_path.write_text(encode(source), encoding='utf-8')
    program = json.loads(program_path.read_text(encoding='utf-8'))
    program.pop('bundleId')
    program['sourceCommit'] = source['sourceCommit']
    (settings.program / 'index.html').write_text('<title>兼容的新程序</title>', encoding='utf-8')
    program['files']['index.html'] = digest((settings.program / 'index.html').read_bytes())
    program['bundleId'] = digest(encode(program))
    program_path.write_text(encode(program), encoding='utf-8')
    assert public.get('/router-content.json').json() == deployed
    assert deploy(client, old_candidate).status_code == 409
    # Startup independently validates the new source+program without invalidating
    # existing published snapshots or importing a newer baseline automatically.
    restarted = create_app(settings)
    with TestClient(restarted, base_url='http://notes.lan') as after_restart:
        assert after_restart.get('/router-content.json').json() == deployed
    assert client.post('/api/router/rollback', json={}).json()['baseline'] is True
    assert public.get('/router-content.json').json() == baseline
    assert client.post('/api/router/rollback', json={}).json()['candidate'] == old_candidate['id']
    assert public.get('/router-content.json').json() == deployed
    new_candidate = freeze(client, client.get('/api/articles/' + article['id']).json())
    assert deploy(client, new_candidate).status_code == 200


def test_frozen_catalog_and_media_corruption_fail_closed(system):
    client, public, app, _, _ = system
    candidate = freeze(client, create(client))
    assert deploy(client, candidate).status_code == 200
    with app.state.store.connect() as db:
        db.execute('UPDATE catalogs SET documents=? WHERE candidate=?', (encode({'content/posts/private.md': 'not published'}), candidate['id']))
    response = public.get('/router-content.json')
    assert response.status_code == 409 and 'not published' not in response.text


@pytest.mark.parametrize('kind', ['other-site', 'traversal', 'other-adapter', 'baked-content', 'bad-hash'])
def test_program_manifest_rejects_unrelated_or_unsafe_packages(tmp_path, kind):
    _, program = write_bundle(tmp_path)
    file = program / 'program.json'
    manifest = json.loads(file.read_text(encoding='utf-8'))
    manifest.pop('bundleId')
    if kind == 'other-site': manifest['site'] = 'main'
    if kind == 'other-adapter': manifest['adapter'] = 'legacy'
    if kind == 'traversal': manifest['files']['../private/cms.sqlite3'] = 'a' * 64
    if kind == 'baked-content': manifest['files']['data/posts.json'] = 'a' * 64
    if kind == 'bad-hash': manifest['files']['index.html'] = 'a' * 64
    manifest['bundleId'] = digest(encode(manifest))
    file.write_text(encode(manifest), encoding='utf-8')
    with pytest.raises(HTTPException):
        program_manifest(program, verify_files=True)


def test_source_site_path_and_github_configuration_fail_closed(system, monkeypatch):
    client, _, app, settings, _ = system
    candidate = freeze(client, create(client))
    assert client.post('/api/candidates/' + candidate['id'] + '/approve-github', json={}).status_code == 409
    with pytest.raises(ValueError): create_app(replace(settings, site_id='main'))
    with pytest.raises(ValueError): create_app(replace(settings, github_token='not-a-real-token'))
    with pytest.raises(HTTPException): app.state.publisher.read('a' * 40, '../other-site/private.txt')
    monkeypatch.setenv('CMS_GITHUB_ENABLED', '1')
    with pytest.raises(ValueError): configured_app()
    path = settings.repo / 'snapshot.json'
    value = json.loads(path.read_text(encoding='utf-8'))
    value['site'] = 'main'
    path.write_text(encode(value), encoding='utf-8')
    with pytest.raises(HTTPException): SnapshotPublisher(settings.repo, app.state.store)


def test_production_factory_requires_explicit_isolated_mount_guard(monkeypatch):
    for key in ('CMS_DEV', 'CMS_REQUIRE_MOUNTS', 'CMS_MOUNT_SPEC', 'CMS_MOUNT_ATTESTATION', 'CMS_GITHUB_ENABLED'):
        monkeypatch.delenv(key, raising=False)
    with pytest.raises(RuntimeError, match='挂载守卫'):
        configured_app()


def test_production_factory_rejects_main_data_before_initialization(monkeypatch, tmp_path):
    monkeypatch.delenv('CMS_DEV', raising=False)
    monkeypatch.setenv('CMS_REQUIRE_MOUNTS', '1')
    monkeypatch.setenv('CMS_MOUNT_SPEC', str(tmp_path / 'mounts.json'))
    monkeypatch.setenv('CMS_MOUNT_ATTESTATION', str(tmp_path / 'attestation.json'))
    monkeypatch.setenv('CMS_DATA', '/mnt/mmcblk0p6/blog-private')
    with pytest.raises(RuntimeError, match='独立目录'):
        configured_app()


def test_private_data_cannot_overlap_source_program_or_editor(system):
    _, _, _, settings, _ = system
    for public in (settings.repo, settings.program):
        with pytest.raises(ValueError, match='完全分离'):
            create_app(replace(settings, data=public / 'private'))
