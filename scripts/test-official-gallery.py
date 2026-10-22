"""Offline regression checks for the wallpaper ingestion boundary."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location("gallery", Path(__file__).with_name("update-official-gallery.py"))
gallery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gallery)


class GallerySafetyTests(unittest.TestCase):
    def test_remote_hosts_and_redirect_destinations_are_restricted(self):
        self.assertTrue(gallery.allowed_url("https://en.joguman.com/downloads_inner/"))
        for url in ["http://en.joguman.com/", "https://en.joguman.com.evil.example/", "https://127.0.0.1/", "file:///tmp/a", "https://user:pass@en.joguman.com/"]:
            self.assertFalse(gallery.allowed_url(url), url)

    def test_preview_tablet_watch_and_home_screen_not_mistaken_for_cover(self):
        self.assertEqual(gallery.image_kind("Scene_PC wallpaper 169.jpg", (4705, 2647)), "desktop")
        self.assertEqual(gallery.image_kind("Scene_iPhone lock screen.jpg", (1243, 2438)), "mobile")
        self.assertEqual(gallery.image_kind("official-single.jpg", (1242, 2437), True), "mobile")
        for name, size in [("preview.jpg", (1920, 1080)), ("tablet.jpg", (2732, 2048)), ("iPhone home screen.jpg", (1243, 2438)), ("watch.jpg", (468, 585)), ("PC.jpg", (1000, 563)), ("PC.jpg", (40000, 22500))]:
            self.assertIsNone(gallery.image_kind(name, size), name)

    def test_zip_traversal_rejected_without_extraction(self):
        for filename in ["../outside.jpg", "/tmp/outside.jpg", "C:/outside.jpg", "safe/../../outside.jpg", "..\\outside.jpg"]:
            data = io.BytesIO()
            with zipfile.ZipFile(data, "w") as z:
                z.writestr(filename, b"not an image")
            with self.assertRaises(ValueError):
                gallery.safe_zip_images(data.getvalue())

    def test_bad_archive_does_not_replace_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = Path(tmp) / "hero-gallery.json"
            baseline = {"version": 1, "artworks": [], "mobileArtworks": [], "sourcePosts": {}}
            before = (json.dumps(baseline, indent=2) + "\n").encode()
            manifest.write_bytes(before)
            detail = '<h2 class="download-title">Example Wallpaper</h2><a href="/post_file_download.cm?c=x"><p class="tit">wallpaper.zip</p></a>'
            with patch.object(gallery, "MANIFEST", manifest), patch.object(gallery.Downloader, "get", side_effect=[b'bmode=view&idx=123', detail.encode(), b'bad zip']):
                result = gallery.refresh()
            self.assertEqual(result["added"], 0)
            self.assertEqual(result["failedPosts"], 1)
            self.assertEqual(manifest.read_bytes(), before)

    def test_manifest_assets_exist_and_preserve_original_ratio(self):
        data = json.loads(gallery.MANIFEST.read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(data["artworks"]), 8)
        for field in ["artworks", "mobileArtworks"]:
            keys = set()
            for art in data[field]:
                self.assertNotIn(art["key"], keys)
                keys.add(art["key"])
                file = gallery.ROOT / "public" / art["src"].removeprefix("./")
                with gallery.Image.open(file) as image:
                    self.assertEqual(image.size, (art["width"], art["height"]))
                    original_ratio = art["originalSize"][0] / art["originalSize"][1]
                    self.assertLess(abs(image.width / image.height - original_ratio), 0.001)


if __name__ == "__main__":
    unittest.main()
