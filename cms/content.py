import io
import json
import re
import uuid
import warnings
from pathlib import PurePosixPath
from urllib.parse import unquote

from fastapi import HTTPException
from PIL import Image, ImageOps

from .store import digest

SECTIONS = ('收藏', '出去吃饭', '在家做饭', '户外', '其他', '金子')
MEDIA_REF = re.compile(r'/api/media/([a-f0-9]{64})')
MAX_UPLOAD = 10 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 20_000_000


def fail(message, status=422):
    raise HTTPException(status, message)


def parse_source(source):
    match = re.fullmatch(r'---\n(.*?)\n---\n(.*)', source.removeprefix('\ufeff').replace('\r\n', '\n'), re.S)
    if not match:
        fail('需要带 --- frontmatter 的 Markdown')
    meta = {}
    for line in match[1].split('\n'):
        if not line.strip() or line.strip().startswith('#'):
            continue
        pair = re.fullmatch(r'([a-zA-Z]+):\s*(.*?)\s*', line)
        if not pair or pair[1] in meta:
            fail('frontmatter 每行只支持一个不重复的字段；不接受多行 YAML')
        key, value = pair[1], pair[2]
        if value.startswith(('[', '"')):
            try:
                value = json.loads(value)
            except ValueError:
                fail('frontmatter 引号文本及列表必须使用 JSON 格式')
        if not isinstance(value, (str, list)) or isinstance(value, list) and any(not isinstance(item, str) for item in value):
            fail('frontmatter 仅支持文本及字符串数组')
        if value in ('|', '>'):
            fail('不接受多行 YAML 字段')
        meta[key] = value
    if len(meta) > 80:
        fail('frontmatter 字段过多')
    return meta, match[2]


def validate_document(value):
    if not isinstance(value, dict) or set(value) != {'category', 'slug', 'source'}:
        fail('文章必须包含 category、slug、source')
    category, slug, source = (value[k] for k in ('category', 'slug', 'source'))
    if category not in SECTIONS or not isinstance(slug, str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug) or len(slug) > 100:
        fail('栏目或文件名无效；文件名仅接受小写英文、数字及分隔短横线')
    if not isinstance(source, str):
        fail('文章正文必须是文本')
    try:
        size = len(source.encode('utf-8'))
    except UnicodeError:
        fail('文章包含无效的 Unicode 字符')
    if size > 512_000:
        fail('文章过大')
    meta, _ = parse_source(source)
    for field in ('title', 'excerpt', 'cover'):
        if not isinstance(meta.get(field), str) or not meta[field].strip():
            fail(f'请填写 {field}')
    if not isinstance(meta.get('tags'), list):
        fail('tags 必须使用 JSON 字符串数组，例如 ["生活"]')
    cover = meta['cover']
    if not MEDIA_REF.fullmatch(cover):
        if not re.fullmatch(r'assets/[^\x00-\x20\x7f\\"\'<>:%?#]+', cover):
            fail('封面必须是 assets/ 相对图片或已上传的媒体地址')
        safe_repo_path(cover)
    if meta.get('category') != category:
        fail('文章栏目必须与 frontmatter category 一致')
    from datetime import date
    try:
        if not isinstance(meta.get('date'), str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', meta.get('date', '')):
            raise ValueError()
        date.fromisoformat(meta['date'])
    except ValueError:
        fail('请填写有效的 YYYY-MM-DD 格式 date')
    return {'category': category, 'slug': slug, 'source': source}


def article_view(row):
    value = dict(row)
    value['document'] = json.loads(value['document'])
    meta, _ = parse_source(value['document']['source'])
    value['title'] = meta.get('title', value['document']['slug'])
    value['tags'] = meta.get('tags', [])
    return value


def target_path(document):
    return f"content/posts/{document['slug']}.md"


def stable_id(path, source):
    meta, _ = parse_source(source)
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'slow-notes:' + (meta.get('id') or path)))


def normalized_image(raw):
    if len(raw) > MAX_UPLOAD:
        fail('图片不能超过 10 MiB', 413)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in ('PNG', 'JPEG', 'WEBP'):
                    fail('只接受可解码的 PNG、JPEG、WebP；不接受 SVG、GIF 或可执行文件')
                image.verify()
            with Image.open(io.BytesIO(raw)) as original:
                if getattr(original, 'n_frames', 1) != 1:
                    fail('第一版仅接受静态图片')
                # The bound is symmetric, so resize before orientation correction.
                # This avoids copying a full 20 MP frame before shrinking it.
                original.thumbnail((2400, 2400))
                image = ImageOps.exif_transpose(original)
                image = image.convert('RGBA' if 'A' in image.getbands() or 'transparency' in image.info else 'RGB')
                output = io.BytesIO()
                image.save(output, 'WEBP', quality=88, method=4)
                content = output.getvalue()
                return digest(content), content, image.width, image.height
    except HTTPException:
        raise
    except Exception:
        fail('图片损坏、尺寸过大或真实格式不受支持')


def safe_repo_path(path):
    if not isinstance(path, str) or not path or len(path) > 512:
        fail('不安全的快照路径')
    item = PurePosixPath(path)
    if (item.is_absolute() or '\\' in path or ':' in path or '%' in path or
            any(part in ('', '.', '..') or part.startswith('.') for part in path.split('/')) or
            any(ord(character) < 32 for character in path)):
        fail('不安全的快照路径')
    return path


def image_paths(document, url):
    url = unquote(url).replace('\\', '/')
    if url.startswith(('https:', 'http:', 'data:', '//')):
        fail('请先上传外链图片到私人媒体库')
    relative = url.removeprefix('./').removeprefix('/')
    path = relative if relative.startswith('public/') else 'public/' + relative
    safe_repo_path(path)
    if not path.startswith('public/assets/'):
        fail('图片必须位于此站点 public/assets 或私人媒体库')
    return [path]
