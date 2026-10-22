"""Local stdlib regression checks; never accesses a router or changes real paths."""
import copy
import contextlib
import hashlib
import io
import json
import tarfile
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import router_tool as tool
from site_guard import validate_mounts, validate_spec


def manifest(files):
    value = {"schema": 1, "site": "slow-notes", "sourceCommit": "a" * 40, "deployable": True,
             "sourceStatus": "clean", "files": {name: hashlib.sha256(raw).hexdigest() for name, raw in files.items()}}
    value["bundleId"] = hashlib.sha256(tool.canonical(value)).hexdigest()
    return value


FILES = {"program/index.html": b"<html>Slow Notes</html>", "program/program.json": b"{}",
         "source/snapshot.json": b"{}", "app/cms/app.py": b"# fixture",
         "app/site_guard.py": b"# guard", "editor/index.html": b"<html>Editor</html>"}


class ReleaseTests(unittest.TestCase):
    def test_valid_release_covers_backend_and_editor(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name, raw in FILES.items():
                (root / name).parent.mkdir(parents=True, exist_ok=True)
                (root / name).write_bytes(raw)
            value = manifest(FILES)
            (root / "release.json").write_bytes(tool.canonical(value))
            self.assertEqual(tool.verify_release(root)[0], value)
            (root / "app/cms/app.py").write_bytes(b"# changed backend")
            with self.assertRaises(ValueError):
                tool.verify_release(root)

    def test_manifest_rejects_escape_paths_and_private_payloads(self):
        for path in ("../private", "/etc/shadow", "program/../private", "program//index.html", "app/C:/escape",
                     "app/.env", "program/key.pem", "app/cms/__pycache__/x.pyc", "program/x\\..\\escape", "app/a:stream"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                tool.release_path(path)

    def test_manifest_rejects_dirty_or_tampered_identity(self):
        for update in ({"deployable": False}, {"site": "main"}, {"bundleId": "b" * 64}, {"sourceCommit": "dirty"}):
            value = manifest(FILES) | update
            with self.subTest(update=update), self.assertRaises(ValueError):
                tool.validate_manifest(value)

    def test_unlisted_or_missing_files_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "release.json").write_bytes(tool.canonical(manifest(FILES)))
            with self.assertRaises(ValueError):
                tool.verify_release(root)

    def write_archive(self, path, *, extra=None, links=False, duplicate=False):
        with tarfile.open(path, "w") as archive:
            for name, raw in {"release.json": tool.canonical(manifest(FILES)), **FILES}.items():
                member = tarfile.TarInfo(name)
                member.size = len(raw)
                archive.addfile(member, io.BytesIO(raw))
            if extra:
                member = tarfile.TarInfo(extra)
                member.size = 1
                archive.addfile(member, io.BytesIO(b"x"))
            if links:
                member = tarfile.TarInfo("program/linked")
                member.type = tarfile.SYMTYPE
                member.linkname = "/etc/shadow"
                archive.addfile(member)
            if duplicate:
                member = tarfile.TarInfo("program/index.html")
                archive.addfile(member, io.BytesIO(b""))

    def test_archive_verifies_all_hashes_and_rejects_links_duplicates_escape(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "release.tar"
            self.write_archive(path)
            self.assertEqual(tool.inspect_archive(path)[0], manifest(FILES))
            for options in ({"extra": "../private"}, {"links": True}, {"duplicate": True}, {"extra": "program/unlisted.txt"}):
                self.write_archive(path, **options)
                with self.subTest(options=options), self.assertRaises(ValueError):
                    tool.inspect_archive(path)


class RegistryTests(unittest.TestCase):
    def setUp(self):
        self.main = {"id": "main", "url": "https://mession.blog/", "editor": "https://mession.blog.admin/admin/",
                     "healthPort": 8787, "services": ["blog-cms", "blog-cms-web"], "unknown": {"keep": True}}
        self.original = {"schema": 1, "futureSchemaField": {"must": "survive"}, "sites": [self.main]}
        self.entry = tool.proposed_entry({"publicOrigin": "https://slow-notes.home.arpa", "editorOrigin": "https://slow-notes.home.arpa.admin", "port": 8788})

    def test_append_preserves_main_unknown_fields_and_input(self):
        before = copy.deepcopy(self.original)
        result = tool.merge_registry(self.original, self.entry)
        self.assertEqual(self.original, before)
        self.assertEqual(result["sites"][0], before["sites"][0])
        self.assertEqual(result["futureSchemaField"], before["futureSchemaField"])
        self.assertEqual(result["sites"][1], self.entry)
        result["sites"][1]["unknownNewSiteField"] = 42
        self.assertEqual(tool.merge_registry(result, self.entry), result)

    def test_rejects_port_host_and_service_conflicts(self):
        for conflict in ({"healthPort": 8788}, {"url": self.entry["url"]}, {"editor": self.entry["editor"]}, {"services": ["blog-slow-notes"]}):
            original = copy.deepcopy(self.original)
            original["sites"][0].update(conflict)
            with self.subTest(conflict=conflict), self.assertRaises(ValueError):
                tool.merge_registry(original, self.entry)

    def test_rejects_overwrite_or_lost_main(self):
        for original in ({"schema": 1, "sites": []}, self.original | {"sites": [self.main, self.main]},
                         self.original | {"sites": [self.main, self.entry | {"healthPort": 9999}]}):
            with self.assertRaises(ValueError):
                tool.merge_registry(original, self.entry)


class MountTests(unittest.TestCase):
    def setUp(self):
        self.rows = [{"path": path, "uuid": "11111111-abcd", "fs": filesystem, "root": "/", "minimumFree": 268435456}
                     for path, filesystem in (("/mnt/mmcblk0p6", "ext4"), ("/mnt/disks/disk1", "ntfs3"))]
        self.mounts = {row["path"]: {"fs": row["fs"], "root": "/", "options": ["rw"], "super": ["rw"], "source": row["path"]} for row in self.rows}
        self.free = lambda _path: types.SimpleNamespace(free=4 * 1024**3)

    def test_fail_closed_mount_identity_space_and_readonly(self):
        validate_mounts(self.rows, self.mounts, lambda _source: "11111111-abcd", disk_usage=self.free)
        for mounts, reader, free in (({}, lambda _: "11111111-abcd", self.free),
                                     (self.mounts, lambda _: "wrong", self.free),
                                     (self.mounts, lambda _: "11111111-abcd", lambda _: types.SimpleNamespace(free=1))):
            with self.assertRaises(RuntimeError):
                validate_mounts(self.rows, mounts, reader, disk_usage=free)
        self.mounts["/mnt/disks/disk1"]["options"] = ["ro"]
        with self.assertRaises(RuntimeError):
            validate_mounts(self.rows, self.mounts, lambda _: "11111111-abcd", disk_usage=self.free)

    def test_placeholders_are_never_accepted(self):
        value = {"schema": 1, "site": "slow-notes", "mounts": self.rows}
        self.assertEqual(validate_spec(value), self.rows)
        self.rows[0]["uuid"] = "REPLACE_WITH_UUID"
        with self.assertRaises(ValueError):
            validate_spec(value)


class ActivationTests(unittest.TestCase):
    def test_failed_candidate_restores_previous_pointer_and_running_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            previous = base / "programs" / ("a" * 64)
            target = base / "programs" / ("b" * 64)
            events = []
            def operation(action, _config):
                events.append(action)
                if len(events) == 2:
                    raise RuntimeError("candidate failed readiness")
            with patch.object(tool, "NAS", base), patch.object(tool, "CONFIG", base / "site.json"), \
                    patch.object(tool, "verify_release", return_value=({"bundleId": target.name}, 1)), \
                    patch.object(tool, "preflight", return_value={"serviceRunning": True}), \
                    patch.object(tool, "current_target", return_value=previous), \
                    patch.object(tool, "running", return_value=True), \
                    patch.object(tool, "maintenance_lock", return_value=contextlib.nullcontext()), \
                    patch.object(tool, "check_mounts"), patch.object(tool, "fsync_directory"), \
                    patch.object(tool, "switch_pointer") as switch, patch.object(tool, "service", side_effect=operation):
                with self.assertRaisesRegex(RuntimeError, "previous pointer and service state restored"):
                    tool.activate({"port": 8788}, target.name, apply=True)
                self.assertEqual([call.args[0] for call in switch.call_args_list], [target, previous])
                self.assertEqual(events, ["stop", "start", "stop", "start"])
            receipts = list(base.glob("activation-*.json"))
            self.assertEqual(len(receipts), 1)
            self.assertEqual(json.loads(receipts[0].read_text())["state"], "rolled-back")

    def test_dry_run_never_stops_services_or_changes_pointer(self):
        target = "b" * 64
        with patch.object(tool, "verify_release", return_value=({"bundleId": target}, 1)), \
                patch.object(tool, "preflight", return_value={"serviceRunning": True}), \
                patch.object(tool, "current_target", return_value=tool.NAS / "programs" / ("a" * 64)), \
                patch.object(tool, "service") as service, patch.object(tool, "switch_pointer") as switch:
            plan = tool.activate({"port": 8788}, target)
            self.assertFalse(plan["apply"])
            service.assert_not_called()
            switch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
