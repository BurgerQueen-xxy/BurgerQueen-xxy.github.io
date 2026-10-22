"""Private album classification and the accepted program's music catalogue."""
import hashlib
import json
from urllib.parse import unquote

from .content import fail
from .releases import program_manifest


def album(store):
    with store.connect() as db:
        return [dict(row) for row in db.execute(
            "SELECT media.* FROM media JOIN media_usage ON media.id=media_usage.media "
            "WHERE media_usage.kind='album' ORDER BY media.created DESC")]


def builtin_music(program):
    if program is None:
        return []
    manifest = program_manifest(program)
    name = 'blog-music.json'
    if name not in manifest['files']:
        return []
    path = program / name
    if path.stat().st_size > 1024 * 1024:
        fail('博客音乐目录过大', 409)
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != manifest['files'][name]:
        fail('博客音乐目录校验失败', 409)
    tracks = json.loads(raw)
    if not isinstance(tracks, list) or len(tracks) > 10000:
        fail('博客音乐目录无效', 409)
    result = []
    for item in tracks:
        src = item.get('src', '')
        filename = unquote(src).removeprefix('/')
        if (not src.startswith('/music/') or filename not in manifest['files'] or
                not (program / filename).resolve().is_relative_to(program.resolve())):
            fail('博客音乐路径无效', 409)
        result.append({'title': str(item.get('title', '未命名音乐'))[:160],
                       'artist': str(item.get('artist', ''))[:160], 'path': filename,
                       'sha256': manifest['files'][filename]})
    return result
