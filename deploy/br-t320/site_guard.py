"""Slow Notes mount identity guard. Never creates directories or mounts disks."""
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import time
from pathlib import Path

MOUNTS = {"/mnt/mmcblk0p6", "/mnt/disks/disk1"}


def protected_file(path, *, maximum=65536):
    path = Path(path)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_nlink != 1 or info.st_size > maximum:
        raise RuntimeError("Root-owned protected regular file required: " + str(path))
    return path.read_bytes()


def mount_fields(text):
    def unescape(value):
        return re.sub(r"\\([0-7]{3})", lambda match: chr(int(match[1], 8)), value)
    mounts = {}
    for line in text.splitlines():
        left, right = line.split(" - ", 1)
        fields, fs = left.split(), right.split()
        mounts[unescape(fields[4])] = {
            "id": fields[0], "device": fields[2], "root": unescape(fields[3]),
            "options": fields[5].split(","), "fs": fs[0], "source": unescape(fs[1]),
            "super": fs[2].split(","),
        }
    return mounts


def validate_spec(value):
    if not isinstance(value, dict) or value.get("schema") != 1 or value.get("site") != "slow-notes":
        raise ValueError("Invalid Slow Notes mount specification")
    rows = value.get("mounts")
    if not isinstance(rows, list) or len(rows) != 2 or {row.get("path") for row in rows} != MOUNTS:
        raise ValueError("Explicit TF and NAS mount identities are required")
    for row in rows:
        if not isinstance(row.get("uuid"), str) or not re.fullmatch(r"[A-Fa-f0-9-]{8,64}", row["uuid"]):
            raise ValueError("Replace each UUID placeholder with a verified device UUID")
        if row.get("fs") not in ("ext4", "ntfs3") or row.get("root") != "/":
            raise ValueError("Explicit filesystem and root=/ are required")
        if row["path"] == "/mnt/mmcblk0p6" and row["fs"] != "ext4":
            raise ValueError("Private data requires the verified TF ext4 filesystem")
        if type(row.get("minimumFree")) is not int or row["minimumFree"] < 268435456:
            raise ValueError("minimumFree must reserve at least 256 MiB per volume")
    return rows


def block_uuid(source):
    raw = subprocess.check_output(["/sbin/block", "info", source], timeout=5, stderr=subprocess.DEVNULL).decode()
    match = re.search(r'UUID="([^"]+)"', raw)
    return match[1] if match else None


def validate_mounts(rows, mounts, read_uuid, *, disk_usage=shutil.disk_usage, incoming=0):
    for row in rows:
        actual = mounts.get(row["path"])
        if not actual or actual["fs"] != row["fs"] or actual["root"] != row["root"]:
            raise RuntimeError("Required mount identity/filesystem is unavailable")
        if "rw" not in actual["options"] or "rw" not in actual["super"]:
            raise RuntimeError("A required filesystem is read-only")
        if row["path"] == "/mnt/mmcblk0p6" and "noexec" in actual["options"]:
            raise RuntimeError("Python runtime filesystem has noexec")
        if read_uuid(actual["source"]) != row["uuid"]:
            raise RuntimeError("Required filesystem UUID does not match")
        reserve = incoming if row["path"] == "/mnt/disks/disk1" else 0
        if disk_usage(row["path"]).free - reserve < row["minimumFree"]:
            raise RuntimeError("Insufficient reserved storage space")


class MountGuard:
    def __init__(self, spec, attestation):
        self.spec = Path(spec)
        self.attestation = Path(attestation)
        raw = protected_file(self.spec)
        self.digest = hashlib.sha256(raw).hexdigest()
        self.rows = validate_spec(json.loads(raw))

    def attest(self, incoming=0):
        if os.geteuid() != 0:
            raise RuntimeError("Only the root supervisor can attest mount UUIDs")
        if hashlib.sha256(protected_file(self.spec)).hexdigest() != self.digest:
            raise RuntimeError("Mount policy changed; restart is required")
        mounts = mount_fields(Path("/proc/self/mountinfo").read_text())
        validate_mounts(self.rows, mounts, block_uuid, incoming=incoming)
        identity = {row["path"]: {key: mounts[row["path"]][key] for key in ("id", "device", "root", "source")} for row in self.rows}
        value = {"schema": 1, "site": "slow-notes", "spec": self.digest, "at": time.monotonic(), "mounts": identity}
        parent = self.attestation.parent
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError("Protected attestation directory must already exist")
        # Parent is root-only writable. Exclusive creation also refuses stale symlinks.
        temporary = parent / (".identity-" + str(os.getpid()) + ".tmp")
        try:
            with temporary.open("x", encoding="utf-8") as output:
                os.chmod(temporary, 0o644)
                json.dump(value, output, separators=(",", ":"))
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.attestation)
        finally:
            if temporary.exists() and not temporary.is_symlink():
                temporary.unlink()
        return value

    def __call__(self):
        raw = protected_file(self.attestation, maximum=16384)
        value = json.loads(raw)
        if value.get("site") != "slow-notes" or value.get("spec") != self.digest or not 0 <= time.monotonic() - value["at"] < 15:
            raise RuntimeError("Mount attestation is missing, stale, or belongs to another site")
        mounts = mount_fields(Path("/proc/self/mountinfo").read_text())
        for row in self.rows:
            actual = mounts.get(row["path"], {})
            if any(actual.get(key) != item for key, item in value["mounts"][row["path"]].items()):
                raise RuntimeError("Mounted device changed; operator verification is required")
        by_source = {mounts[row["path"]]["source"]: row["uuid"] for row in self.rows}
        validate_mounts(self.rows, mounts, by_source.get)


def configured_guard():
    spec = os.environ.get("CMS_MOUNT_SPEC")
    identity = os.environ.get("CMS_MOUNT_ATTESTATION")
    if not spec or not identity or os.environ.get("CMS_REQUIRE_MOUNTS") != "1":
        raise RuntimeError("Explicit production mount guard configuration is required")
    return MountGuard(spec, identity)
