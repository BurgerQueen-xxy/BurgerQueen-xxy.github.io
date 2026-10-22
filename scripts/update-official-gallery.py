#!/usr/bin/env python3
"""Refresh the checked-in JOGUMAN wallpaper gallery from public official attachments.

No page preview/screenshot is used as artwork. Failures keep the last good gallery.
Only proportional JPEG export is performed; no crop, recolour, repaint or stretching.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import html
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import socket
import sys
import time
import urllib.parse
import urllib.request
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "public/data/hero-gallery.json"
ASSETS = ROOT / "public/assets/hero-gallery"
LIST_URL = "https://en.joguman.com/downloads_inner/?category=8p7c85OM08"
ORIGIN = "https://en.joguman.com"
ALLOWED_HOSTS = {"en.joguman.com", "www.joguman.com", "cdn.imweb.me", "cdn.jogumancdn.com", "dataseoul.s3.ap-northeast-2.amazonaws.com"}
MAX_DOWNLOAD = 40 * 1024 * 1024
MAX_ENTRY = 32 * 1024 * 1024
MAX_TOTAL = 180 * 1024 * 1024
MAX_PIXELS = 230_000_000
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
# These two official designs do not suit this blog's quiet everyday cover collection.
EXCLUDED_POSTS = {"162981303": "gesture poster", "162980963": "gun poster"}
COVER_EXCLUDED_POSTS = {"173621825": "timetable text competes with the homepage heading", "162981263": "comic text competes with the homepage heading"}
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def allowed_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    return parsed.scheme == "https" and parsed.hostname in ALLOWED_HOSTS and not parsed.username and not parsed.password


class OfficialRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed_url(newurl):
            raise ValueError("attachment redirected outside official download hosts")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Downloader:
    def __init__(self, seconds: int):
        self.deadline = time.monotonic() + seconds
        self.total = 0
        self.opener = urllib.request.build_opener(OfficialRedirect())

    def get(self, url: str, limit: int = MAX_DOWNLOAD, referer: str = LIST_URL) -> bytes:
        if not allowed_url(url):
            raise ValueError("unapproved download host")
        left = self.deadline - time.monotonic()
        if left <= 0:
            raise TimeoutError("gallery sync time budget reached")
        request = urllib.request.Request(url, headers={"User-Agent": "SlowNotes-OfficialWallpaperSync/1.0", "Referer": referer})
        with self.opener.open(request, timeout=min(12, left)) as response:
            if not allowed_url(response.url):
                raise ValueError("unapproved final download host")
            if int(response.headers.get("Content-Length", 0)) > limit:
                raise ValueError("attachment exceeds download size limit")
            chunks, count = [], 0
            while True:
                if time.monotonic() > self.deadline:
                    raise TimeoutError("gallery sync time budget reached")
                chunk = response.read(min(128 * 1024, limit + 1 - count))
                if not chunk:
                    break
                count += len(chunk)
                self.total += len(chunk)
                if count > limit or self.total > MAX_TOTAL:
                    raise ValueError("gallery download budget reached")
                chunks.append(chunk)
        return b"".join(chunks)


def parse_list(page: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"bmode=view(?:&amp;|&)idx=(\d+)", page)))[:50]


def parse_post(page: str) -> tuple[str, list[dict]]:
    title_match = re.search(r'<h2\s+class="download-title"[^>]*>(.*?)</h2>', page, re.S)
    if not title_match:
        raise ValueError("official download page structure changed")
    title = html.unescape(re.sub(r"<[^>]+>", "", title_match.group(1))).strip()
    attachments = []
    for href, body in re.findall(r'<a[^>]+href="(/post_file_download\.cm\?[^\"]+)"[^>]*>(.*?)</a>', page, re.S):
        name_match = re.search(r'<p\s+class="tit"[^>]*>(.*?)</p>', body, re.S)
        if not name_match:
            continue
        name = html.unescape(re.sub(r"<[^>]+>", "", name_match.group(1))).strip()
        if Path(name).suffix.lower() not in IMAGE_EXTENSIONS | {".zip"}:
            continue
        href = html.unescape(href)
        token = urllib.parse.parse_qs(urllib.parse.urlparse(href).query).get("c", [""])[0]
        try:
            decoded = base64.b64decode(token).decode("utf-8")
            code = re.search(r'"file_code";s:\d+:"([a-zA-Z0-9]+)"', decoded).group(1)
        except (ValueError, UnicodeDecodeError, AttributeError):
            code = name
        attachments.append({"name": name, "url": ORIGIN + href, "code": code})
    return title, attachments


def safe_zip_images(data: bytes) -> list[tuple[str, bytes]]:
    result = []
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if len(entries) > 150:
            raise ValueError("archive has too many entries")
        if sum(entry.file_size for entry in entries) > MAX_TOTAL:
            raise ValueError("archive expands beyond the memory budget")
        for entry in entries:
            name = entry.filename
            parts = PurePosixPath(name.replace("\\", "/")).parts
            if name.startswith(("/", "\\")) or ".." in parts or ":" in name:
                raise ValueError("unsafe archive path")
            if "__MACOSX" in parts or PurePosixPath(name).suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            if entry.flag_bits & 1 or entry.file_size > MAX_ENTRY or entry.file_size / max(1, entry.compress_size) > 150:
                raise ValueError("unsafe archive entry")
            result.append((name, archive.read(entry)))
    return result


def image_kind(name: str, size: tuple[int, int], standalone: bool = False) -> str | None:
    w, h = size
    if w * h > MAX_PIXELS or min(w, h) < 900:
        return None
    lower = name.lower()
    if any(word in lower for word in ["home", "watch", "logo"]):
        return None
    if 1.70 <= w / h <= 1.85 and w >= 1600 and ("pc" in lower or "desktop" in lower):
        return "desktop"
    if 1.75 <= h / w <= 2.30 and (standalone or any(word in lower for word in ["phone", "lock", "leaving-this-planet"])):
        return "mobile"
    return None


def image_record(name: str, data: bytes, post_id: str, title: str, source_url: str, kind: str) -> tuple[dict, bytes]:
    sha = hashlib.sha256(data).hexdigest()
    key = f"joguman-{post_id}-{sha[:10]}"
    width = 2560 if kind == "desktop" else 1080
    with Image.open(io.BytesIO(data)) as image:
        original_size = image.size
        target_width = min(width, image.width)
        target_size = (target_width, round(image.height * target_width / image.width))
        # JPEG decoder downsampling avoids decoding the original 216MP wallpapers
        # at full resolution on the CI runner. The complete original frame remains.
        image.draft("RGB", (target_size[0] * 2, target_size[1] * 2))
        image.load()
        if image.mode in ("RGBA", "LA"):
            rgb = Image.new("RGB", image.size, "white")
            rgb.paste(image, mask=image.getchannel("A"))
            image = rgb
        else:
            image = image.convert("RGB")
        image = image.resize(target_size, Image.Resampling.LANCZOS)
        top = image.crop((0, 0, image.width, max(1, image.height // 80))).resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
        sky = "#" + "".join(f"{channel:02x}" for channel in top)
        output = io.BytesIO()
        image.save(output, "JPEG", quality=89, subsampling=0, optimize=True)
    record = {"key": key, "src": f"./assets/hero-gallery/{key}.jpg", "title": title, "source": title,
              "sourceUrl": source_url, "sourcePostId": post_id, "sourceFile": name, "originalSHA256": sha,
              "originalSize": list(original_size), "width": target_size[0], "height": target_size[1],
              "aspectRatio": round(target_size[0] / target_size[1], 6), "skyColor": sky}
    if kind == "mobile":
        record["portraitRatio"] = round(target_size[1] / target_size[0], 6)
    if post_id in COVER_EXCLUDED_POSTS or "timetable" in title.lower():
        record["enabled"] = False
        record["exclusionReason"] = COVER_EXCLUDED_POSTS.get(post_id, "timetable text competes with the homepage heading")
    return record, output.getvalue()


def atomic_write(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(data)
    os.replace(temporary, path)


def refresh(max_new: int = 6, seconds: int = 150, cache_dir: Path | None = None) -> dict:
    original = MANIFEST.read_bytes()
    gallery = json.loads(original)
    processed = gallery.setdefault("sourcePosts", {})
    downloader = Downloader(seconds)
    ids = parse_list(downloader.get(LIST_URL, 3 * 1024 * 1024).decode("utf-8"))
    if not ids:
        raise ValueError("official wallpaper list could not be parsed")
    new_posts, additions, failures = 0, 0, 0
    known_hashes = {record.get("originalSHA256") for record in gallery["artworks"] + gallery["mobileArtworks"]}
    for post_id in ids:
        if post_id in EXCLUDED_POSTS:
            continue
        if time.monotonic() >= downloader.deadline:
            print("Gallery time budget reached; remaining posts will be checked on the next publish.")
            break
        source_url = f"{ORIGIN}/downloads_inner/?bmode=view&idx={post_id}"
        try:
            title, attachments = parse_post(downloader.get(source_url, 3 * 1024 * 1024).decode("utf-8"))
            fingerprint = hashlib.sha256(json.dumps([(a["name"], a["code"]) for a in attachments]).encode()).hexdigest()
            if processed.get(post_id, {}).get("fingerprint") == fingerprint:
                continue
            if new_posts >= max_new:
                continue
            new_posts += 1
            pending = {"desktop": [], "mobile": []}
            for index, attachment in enumerate(attachments[:4]):
                cached = cache_dir / f"{post_id}-{index}.zip" if cache_dir else None
                data = cached.read_bytes() if cached and cached.is_file() else downloader.get(attachment["url"], referer=source_url)
                standalone = Path(attachment["name"]).suffix.lower() != ".zip"
                images = [(attachment["name"], data)] if standalone else safe_zip_images(data)
                for filename, payload in images:
                    with Image.open(io.BytesIO(payload)) as image:
                        kind = image_kind(filename, image.size, standalone)
                    if not kind or len(pending[kind]) >= 4 or hashlib.sha256(payload).hexdigest() in known_hashes:
                        continue
                    record, rendered = image_record(filename, payload, post_id, title, source_url, kind)
                    pending[kind].append((record, rendered))
            # Publish every file before making its manifest reference visible. A bad
            # archive never replaces the previously committed gallery or its assets.
            for kind, target in [("desktop", "artworks"), ("mobile", "mobileArtworks")]:
                for record, rendered in pending[kind]:
                    atomic_write(ROOT / "public" / record["src"].removeprefix("./"), rendered)
                    gallery[target].append(record)
                    known_hashes.add(record["originalSHA256"])
                    additions += 1
            processed[post_id] = {"title": title, "fingerprint": fingerprint, "sourceUrl": source_url}
            print(f"Checked official wallpaper: {post_id} ({len(pending['desktop'])} desktop, {len(pending['mobile'])} mobile added)")
        except (OSError, ValueError, KeyError, zipfile.BadZipFile, Image.DecompressionBombError) as error:
            failures += 1
            # Do not log temporary attachment URLs/tokens, just a stable source ID.
            print(f"::warning::Official wallpaper {post_id} unavailable ({type(error).__name__}); keeping existing covers.")
    rendered_manifest = (json.dumps(gallery, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if rendered_manifest != original:
        atomic_write(MANIFEST, rendered_manifest)
    return {"added": additions, "failedPosts": failures, "desktop": len(gallery["artworks"]), "mobile": len(gallery["mobileArtworks"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-new", type=int, default=6, help="Maximum new/changed official posts to download per publish (1–30)")
    parser.add_argument("--seconds", type=int, default=150, help="Total network time budget (15–600 seconds)")
    parser.add_argument("--cache-dir", type=Path, help="Optional local research ZIP cache for the initial import")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    socket.setdefaulttimeout(12)
    try:
        result = refresh(min(30, max(1, args.max_new)), min(600, max(15, args.seconds)), args.cache_dir)
        print("Official gallery: " + json.dumps(result))
    except (OSError, ValueError, KeyError) as error:
        print(f"::warning::Official gallery check unavailable ({type(error).__name__}); deploying the checked-in gallery.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
