"""Scoped BR-T320 operations. Inspection is read-only; every mutation needs --apply.

Run on the router with the operator's existing SSH workflow. This program never
creates users, changes SSH/DNS/CA/firewall configuration, or installs services.
"""
import argparse
import contextlib
import hashlib
import http.client
import json
import os
import re
import shutil
import socket
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

from site_guard import block_uuid, mount_fields, protected_file, validate_mounts, validate_spec

SITE = "slow-notes"
SERVICE = "blog-slow-notes"
NAS = Path("/mnt/disks/disk1/blog-sites/slow-notes")
PRIVATE = Path("/mnt/mmcblk0p6/blog-sites/slow-notes/private")
CONFIG = Path("/etc/blog-sites/slow-notes/site.json")
REGISTRY = Path("/etc/blog-manager/sites.json")
INIT = Path("/etc/init.d/blog-slow-notes")
MAX_TOTAL = 512 * 1024 * 1024
MAX_FILE = 128 * 1024 * 1024
SHA = re.compile(r"[a-f0-9]{64}")


def canonical(value):
    # Match the builder's JSON.stringify insertion order (manifest is read with order preserved).
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def sha256(path):
    with Path(path).open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def release_path(name):
    if not isinstance(name, str) or not name or "\\" in name or ":" in name or any(ord(char) < 32 for char in name):
        raise ValueError("Invalid release filename")
    path = PurePosixPath(name)
    if path.is_absolute() or str(path) != name or any(part in (".", "..") or part.startswith(".") for part in path.parts):
        raise ValueError("Release filename escapes its directory")
    if path.parts[0] not in ("program", "source", "app", "editor") or len(path.parts) < 2:
        raise ValueError("Unknown release subtree")
    if path.suffix.lower() in (".pem", ".key", ".p12", ".pfx", ".sqlite", ".sqlite3", ".db", ".pyc") or any(part in ("__pycache__", "node_modules") or part.lower().startswith(".env") for part in path.parts):
        raise ValueError("Private or generated runtime state must not be packaged")
    return path


def validate_manifest(value):
    if not isinstance(value, dict) or value.get("schema") != 1 or value.get("site") != SITE or value.get("deployable") is not True or value.get("sourceStatus") != "clean":
        raise ValueError("Only clean deployable Slow Notes schema=1 releases are accepted")
    if not re.fullmatch(r"[a-f0-9]{40}|[a-f0-9]{64}", value.get("sourceCommit", "")):
        raise ValueError("A real source commit is required")
    files = value.get("files")
    if not isinstance(files, dict) or not 4 <= len(files) <= 8192:
        raise ValueError("Invalid release file inventory")
    for name, digest in files.items():
        release_path(name)
        if not isinstance(digest, str) or not SHA.fullmatch(digest):
            raise ValueError("Invalid file SHA-256")
    required = {"program/index.html", "program/program.json", "source/snapshot.json", "app/cms/app.py", "app/site_guard.py", "editor/index.html"}
    if not required.issubset(files):
        raise ValueError("Release is missing program/source/backend/guard/editor entry points")
    expected = dict(value)
    identity = expected.pop("bundleId", None)
    if not isinstance(identity, str) or not SHA.fullmatch(identity) or hashlib.sha256(canonical(expected)).hexdigest() != identity:
        raise ValueError("Release bundleId does not cover the complete manifest")
    return value


def verify_release(directory):
    directory = Path(directory)
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError("Release must be an actual directory")
    manifest_path = directory / "release.json"
    if manifest_path.is_symlink() or not manifest_path.is_file() or manifest_path.stat().st_size > 4 * 1024 * 1024:
        raise ValueError("Invalid release.json")
    value = validate_manifest(json.loads(manifest_path.read_bytes()))
    seen, size = set(), 0
    for path in directory.rglob("*"):
        if path.is_symlink():
            raise ValueError("Symlinks are not allowed inside releases")
        if path.is_dir():
            continue
        if not path.is_file() or path.stat().st_nlink != 1:
            raise ValueError("Only single-link regular release files are allowed")
        name = path.relative_to(directory).as_posix()
        if name == "release.json":
            continue
        release_path(name)
        if name not in value["files"] or sha256(path) != value["files"][name]:
            raise ValueError("Release inventory or SHA-256 mismatch")
        size += path.stat().st_size
        if path.stat().st_size > MAX_FILE or size > MAX_TOTAL:
            raise ValueError("Release exceeds the deployment size budget")
        seen.add(name)
    if seen != set(value["files"]):
        raise ValueError("Release files are missing")
    return value, size


def inspect_archive(path):
    with tarfile.open(path, "r:*") as archive:
        members = archive.getmembers()
        if len(members) > 16384:
            raise ValueError("Too many archive members")
        names, total = set(), 0
        manifest = None
        for member in members:
            name = member.name.rstrip("/")
            if name in names:
                raise ValueError("Duplicate archive entry")
            names.add(name)
            if member.isdir():
                # Directory entries must obey the same path rules; only the four roots are special.
                if name not in ("program", "source", "app", "editor"):
                    release_path(name)
                continue
            if not member.isfile() or member.issym() or member.islnk():
                raise ValueError("Archive links and special files are forbidden")
            if name != "release.json":
                release_path(name)
            if member.size < 0 or member.size > MAX_FILE:
                raise ValueError("Archive file size exceeds the deployment budget")
            total += member.size
            if total > MAX_TOTAL:
                raise ValueError("Archive is too large")
            if name == "release.json":
                if member.size > 4 * 1024 * 1024:
                    raise ValueError("Release manifest is too large")
                manifest = validate_manifest(json.load(archive.extractfile(member)))
        if manifest is None:
            raise ValueError("Archive has no root release.json")
        files = {member.name for member in members if member.isfile()}
        if files != set(manifest["files"]) | {"release.json"}:
            raise ValueError("Archive contents do not exactly match the release manifest")
        for member in members:
            if member.isfile() and member.name != "release.json":
                with archive.extractfile(member) as source:
                    digest = hashlib.file_digest(source, "sha256").hexdigest()
                if digest != manifest["files"][member.name]:
                    raise ValueError("Archive SHA-256 verification failed")
        return manifest, total


def origin(value):
    if not isinstance(value, str):
        raise ValueError("HTTPS origin is required")
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment or parsed.port not in (None, 443):
        raise ValueError("Expected an exact HTTPS hostname origin without trailing slash")
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", parsed.hostname) or ".." in parsed.hostname:
        raise ValueError("Only reviewed ASCII hostnames are accepted")
    return parsed.hostname


def load_config(path=CONFIG):
    value = json.loads(protected_file(path))
    if value.get("schema") != 1 or value.get("site") != SITE or value.get("reviewed") is not True:
        raise ValueError("site.json must contain the operator-reviewed Slow Notes configuration")
    if type(value.get("port")) is not int or not 1024 <= value["port"] <= 65535 or value["port"] in (8787, 8843):
        raise ValueError("Replace the port placeholder with a verified unused dedicated port")
    if origin(value.get("publicOrigin")) == origin(value.get("editorOrigin")):
        raise ValueError("Independent public and editor hostnames are required")
    if value.get("user") != "slownotes" or value.get("group") != "slownotes":
        raise ValueError("Dedicated slownotes user and group are required")
    if value.get("mountSpec") != "/etc/blog-sites/slow-notes/mounts.json" or value.get("attestation") != "/tmp/blog-slow-notes/mount-identity.json":
        raise ValueError("Mount policy must stay in the Slow Notes namespace")
    if type(value.get("minimumMemoryAvailable")) is not int or value["minimumMemoryAvailable"] < 67108864:
        raise ValueError("Reserve at least 64 MiB available memory before deployment")
    if not isinstance(value.get("nginxConfig"), str) or not value["nginxConfig"].startswith("/etc/nginx/") or ".." in Path(value["nginxConfig"]).parts:
        raise ValueError("Set nginxConfig to the existing nginx master's actual /etc/nginx configuration")
    if not isinstance(value.get("python"), str) or not value["python"].startswith("/mnt/mmcblk0p6/"):
        raise ValueError("Use the verified read-only TF Python runtime")
    dependencies = value.get("readOnlyDependencyPaths", [])
    if not isinstance(dependencies, list) or any(not isinstance(item, str) or not item.startswith("/mnt/mmcblk0p6/") or ".." in Path(item).parts for item in dependencies):
        raise ValueError("Read-only dependency paths must remain on the TF volume")
    return value


def protected_directory(path):
    path = Path(path)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise RuntimeError("Pre-provisioned root-owned directory required: " + str(path))


def protected_tree_path(path, *, base):
    path, base = Path(path), Path(base)
    if not path.is_absolute() or ".." in path.parts or not path.is_relative_to(base):
        raise ValueError("Path is outside its allowed namespace")
    current = base
    protected_directory(current)
    for part in path.relative_to(base).parts:
        current /= part
        protected_directory(current)


def check_mounts(config, incoming=0):
    spec = json.loads(protected_file(config["mountSpec"]))
    rows = validate_spec(spec)
    mounts = mount_fields(Path("/proc/self/mountinfo").read_text())
    validate_mounts(rows, mounts, block_uuid, incoming=incoming)
    return [{"path": row["path"], "uuid": row["uuid"], "fs": row["fs"], "free": shutil.disk_usage(row["path"]).free} for row in rows]


def memory_available():
    text = Path("/proc/meminfo").read_text()
    match = re.search(r"^MemAvailable:\s+(\d+) kB$", text, re.M)
    return int(match[1]) * 1024 if match else 0


def running():
    result = subprocess.run(["/bin/ubus", "call", "service", "list", json.dumps({"name": SERVICE})], capture_output=True, timeout=8, check=True)
    value = json.loads(result.stdout)
    return any(item.get("running") for item in value.get(SERVICE, {}).get("instances", {}).values())


def port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=.5):
            return True
    except OSError:
        return False


def health(config):
    connection = http.client.HTTPConnection("127.0.0.1", config["port"], timeout=1.5)
    try:
        connection.request("GET", "/healthz", headers={"Host": urlsplit(config["publicOrigin"]).netloc})
        response = connection.getresponse()
        raw = response.read(1025)
        return response.status == 200 and len(raw) <= 1024 and json.loads(raw) == {"ready": True, "site": SITE}
    except (OSError, ValueError, http.client.HTTPException):
        return False
    finally:
        connection.close()


def service(action, config):
    protected_file(INIT)
    subprocess.run([str(INIT), action], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=45)
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if action == "stop" and not running() and not port_open(config["port"]):
            return
        if action == "start" and running() and health(config):
            return
        time.sleep(.5)
    raise RuntimeError("Dedicated service did not stop/drain or become healthy within 45 seconds")


def nginx_inventory():
    masters = []
    for proc in Path("/proc").glob("[0-9]*"):
        try:
            command = (proc / "cmdline").read_bytes().replace(b"\0", b" ").decode(errors="replace")
            if command.startswith("nginx: master process "):
                # Only report config filenames, never complete process environments or configuration text.
                match = re.search(r"(?:^|\s)-c\s+(\S+)", command)
                masters.append({"pid": int(proc.name), "config": match[1] if match else "default (must verify)"})
        except (OSError, ValueError):
            continue
    return masters


def proposed_entry(config):
    return {"id": SITE, "name": "Slow Notes", "url": config["publicOrigin"] + "/", "editor": config["editorOrigin"] + "/admin/",
            "storage": "NAS immutable releases; TF private CMS data", "services": [SERVICE],
            "backupLock": "/tmp/blog-slow-notes-backup.lock", "healthPort": config["port"]}


def merge_registry(value, entry):
    if not isinstance(value, dict) or value.get("schema") != 1 or not isinstance(value.get("sites"), list):
        raise ValueError("Existing registry must have schema=1 and a sites array")
    sites = value["sites"]
    if len(sites) > 16 or any(not isinstance(row, dict) or not isinstance(row.get("id"), str) for row in sites):
        raise ValueError("Existing site registry is malformed")
    ids = [row["id"] for row in sites]
    if len(set(ids)) != len(ids) or "main" not in ids:
        raise ValueError("Existing main site must be retained in an unambiguous registry")
    if entry.get("id") != SITE or entry.get("services") != [SERVICE] or type(entry.get("healthPort")) is not int:
        raise ValueError("Only the dedicated Slow Notes service may be registered")
    requested = {urlsplit(entry[field]).hostname for field in ("url", "editor")}
    existing = None
    for row in sites:
        if row["id"] == SITE:
            existing = row
            continue
        hosts = {urlsplit(row.get(field) or "").hostname for field in ("url", "editor")}
        if requested & hosts or row.get("healthPort") == entry["healthPort"] or SERVICE in row.get("services", []):
            raise ValueError("Site hostname, health port, or init service conflicts with an existing site")
    if existing is not None:
        if any(existing.get(key) != item for key, item in entry.items()):
            raise ValueError("Slow Notes is already registered differently; review an explicit migration")
        if existing.get("addressConfig"):
            raise ValueError("Automatic address policy is unsupported for this site")
        return value
    if len(sites) >= 16:
        raise ValueError("Registry has no free site slot")
    return value | {"sites": sites + [entry]}


def preflight(config, *, require_layout=True, incoming=0):
    if os.name != "posix" or os.geteuid() != 0:
        raise RuntimeError("Router preflight requires a root operator on Linux")
    volumes = check_mounts(config, incoming=incoming)
    available = memory_available()
    if available < config["minimumMemoryAvailable"]:
        raise RuntimeError("Available memory is below the reviewed deployment budget")
    import pwd, grp
    user, group = pwd.getpwnam(config["user"]), grp.getgrnam(config["group"])
    if user.pw_uid == 0 or group.gr_gid == 0 or user.pw_gid != group.gr_gid:
        raise RuntimeError("Dedicated non-root user/group has not been provisioned correctly")
    runtime = Path(config["python"]).resolve(strict=True)
    runtime_info = runtime.stat()
    if not runtime.is_relative_to("/mnt/mmcblk0p6") or not stat.S_ISREG(runtime_info.st_mode) or runtime_info.st_uid != 0 or runtime_info.st_mode & 0o022 or not os.access(runtime, os.X_OK):
        raise RuntimeError("Python runtime must be a verified root-owned read-only TF executable")
    for dependency in config.get("readOnlyDependencyPaths", []):
        protected_tree_path(dependency, base="/mnt/mmcblk0p6")
    if require_layout:
        for directory in (NAS / "staging", NAS / "programs"):
            protected_tree_path(directory, base="/mnt/disks/disk1")
        protected_tree_path(PRIVATE.parent, base="/mnt/mmcblk0p6")
        data = PRIVATE.lstat()
        if not stat.S_ISDIR(data.st_mode) or data.st_uid != user.pw_uid or data.st_gid != group.gr_gid or data.st_mode & 0o077:
            raise RuntimeError("Private data directory must be a real slownotes:slownotes 0700 TF directory")
        protected_file(INIT)
    raw = protected_file(REGISTRY, maximum=1024 * 1024)
    merged = merge_registry(json.loads(raw), proposed_entry(config))
    live = running()
    if port_open(config["port"]) and (not live or not health(config)):
        raise RuntimeError("Requested backend port belongs to another or unhealthy listener")
    masters = nginx_inventory()
    if not any(item["config"] == config["nginxConfig"] for item in masters):
        raise RuntimeError("Reviewed nginx configuration does not match a running nginx master")
    probe = subprocess.run(["/usr/sbin/nginx", "-T", "-c", config["nginxConfig"]], capture_output=True, timeout=15)
    if probe.returncode:
        raise RuntimeError("Existing nginx configuration validation failed; detailed output withheld")
    return {"site": SITE, "mounts": volumes, "memoryAvailable": available, "userUid": user.pw_uid,
            "port": config["port"], "serviceRunning": live, "nginx": masters, "nginxConfigurationValid": True,
            "sites": [{key: row.get(key) for key in ("id", "url", "editor", "services", "healthPort")} for row in json.loads(raw)["sites"]],
            "registrationAlreadyPresent": len(merged["sites"]) == len(json.loads(raw)["sites"]),
            "networkIsolation": "not tested", "dnsAndCertificate": "not tested"}


def fsync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def update_receipt(path, value):
    temporary = path.with_name("." + path.name + ".tmp")
    try:
        with temporary.open("x", encoding="utf-8") as output:
            os.chmod(temporary, 0o600)
            json.dump(value, output, ensure_ascii=False)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        fsync_directory(path.parent)
    finally:
        if temporary.exists():
            temporary.unlink()


@contextlib.contextmanager
def maintenance_lock():
    import fcntl
    path = "/tmp/blog-slow-notes-backup.lock"
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_nlink != 1:
            raise RuntimeError("Invalid dedicated maintenance lock")
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(descriptor)


def stage(config, archive_path, apply=False):
    archive_path = Path(archive_path)
    if archive_path.is_symlink() or not archive_path.is_file() or archive_path.stat().st_nlink != 1:
        raise ValueError("Use a regular uploaded archive")
    manifest, size = inspect_archive(archive_path)
    report = preflight(config, incoming=size)
    destination = NAS / "programs" / manifest["bundleId"]
    if destination.exists() or destination.is_symlink():
        raise ValueError("Version directory already exists; immutable releases are never overwritten")
    plan = {"action": "stage", "apply": apply, "bundleId": manifest["bundleId"], "destination": str(destination), "bytes": size, "preflight": report}
    if not apply:
        return plan
    with maintenance_lock():
        check_mounts(config, incoming=size)
        temporary = Path(tempfile.mkdtemp(prefix=".extract-", dir=NAS / "staging"))
        try:
            # Do not use tar.extractall: archive paths and member types were checked above.
            with tarfile.open(archive_path, "r:*") as archive:
                extracted = set()
                for member in archive:
                    if member.isdir():
                        continue
                    # Revalidate on extraction as the uploaded archive might have changed
                    # since inspection. No path is written before this check.
                    if not member.isfile() or member.name in extracted or member.name not in set(manifest["files"]) | {"release.json"} or member.size > MAX_FILE:
                        raise ValueError("Archive changed or contains an invalid extraction member")
                    if member.name != "release.json":
                        release_path(member.name)
                    extracted.add(member.name)
                    target = temporary / member.name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.extractfile(member) as source, target.open("xb") as output:
                        shutil.copyfileobj(source, output, length=1024 * 1024)
                        output.flush()
                        os.fsync(output.fileno())
            actual, _ = verify_release(temporary)
            if actual != manifest:
                raise ValueError("Archive changed during staging")
            check_mounts(config)
            for path in temporary.rglob("*"):
                path.chmod(0o555 if path.is_dir() else 0o444)
                info = path.lstat()
                if info.st_uid != 0 or info.st_mode & 0o022:
                    raise RuntimeError("Filesystem does not preserve root ownership/read-only release permissions")
            temporary.chmod(0o555)
            os.rename(temporary, destination)
            fsync_directory(destination.parent)
        finally:
            if temporary.exists() and temporary.parent == NAS / "staging" and temporary.name.startswith(".extract-") and not temporary.is_symlink():
                # This directory was created exclusively by this call and contains only verified regular files.
                for path in temporary.rglob("*"):
                    if path.is_dir():
                        path.chmod(0o755)
                temporary.chmod(0o755)
                shutil.rmtree(temporary)
    return plan | {"verified": True, "currentUnchanged": True}


def current_target():
    current = NAS / "current"
    if not current.exists() and not current.is_symlink():
        return None
    if not current.is_symlink():
        raise RuntimeError("current must be the dedicated release symlink")
    target = current.resolve(strict=True)
    if target.parent != NAS / "programs" or not SHA.fullmatch(target.name):
        raise RuntimeError("current points outside the dedicated version directory")
    return target


def switch_pointer(target):
    temporary = NAS / (".current-" + uuid.uuid4().hex)
    try:
        temporary.symlink_to("programs/" + target.name, target_is_directory=True)
        os.replace(temporary, NAS / "current")
        fsync_directory(NAS)
    finally:
        if temporary.is_symlink():
            temporary.unlink()


def activate(config, bundle, apply=False, start=False):
    if not SHA.fullmatch(bundle):
        raise ValueError("Use a complete release bundleId")
    target = NAS / "programs" / bundle
    manifest, _ = verify_release(target)
    if manifest["bundleId"] != bundle:
        raise ValueError("Version directory and release identity do not match")
    report = preflight(config)
    old = current_target()
    was_running = report["serviceRunning"]
    plan = {"action": "activate", "apply": apply, "bundleId": bundle, "previous": old.name if old else None,
            "serviceWasRunning": was_running, "requiresExplicitStart": not was_running, "preflight": report}
    if not apply:
        return plan
    if not was_running and not start:
        raise ValueError("Service is stopped; --start explicitly authorizes starting it after activation")
    with maintenance_lock():
        check_mounts(config)
        if current_target() != old or running() != was_running:
            raise RuntimeError("Live state changed since preflight; retry after inspection")
        # Keep a root-owned receipt before making the live change.
        receipt = CONFIG.parent / ("activation-" + uuid.uuid4().hex + ".json")
        with receipt.open("x", encoding="utf-8") as output:
            os.chmod(receipt, 0o600)
            json.dump(plan | {"at": int(time.time()), "state": "prepared"}, output)
            output.flush()
            os.fsync(output.fileno())
        try:
            if was_running:
                service("stop", config)
            elif port_open(config["port"]):
                raise RuntimeError("Dedicated port is unexpectedly occupied")
            switch_pointer(target)
            service("start", config)
        except BaseException as error:
            # Stop the candidate before restoring the complete previous application/content bundle.
            rollback_error = None
            try:
                service("stop", config)
                if old is None:
                    (NAS / "current").unlink(missing_ok=True)
                    fsync_directory(NAS)
                else:
                    switch_pointer(old)
                if was_running:
                    service("start", config)
            except BaseException as recovery:
                rollback_error = type(recovery).__name__
            update_receipt(receipt, plan | {"at": int(time.time()), "state": "recovery-required" if rollback_error else "rolled-back", "errorType": type(error).__name__, "recoveryErrorType": rollback_error})
            if rollback_error:
                raise RuntimeError("Activation failed and automatic recovery needs operator attention; receipt=" + str(receipt)) from error
            raise RuntimeError("Activation failed; previous pointer and service state restored; receipt=" + str(receipt)) from error
        update_receipt(receipt, plan | {"at": int(time.time()), "state": "healthy", "httpsAcceptance": "not yet tested"})
    return plan | {"healthy": True, "receipt": str(receipt), "httpsAcceptance": "not yet tested"}


def register(config, apply=False):
    report = preflight(config)
    protected_directory(REGISTRY.parent)
    protected_file(INIT)
    original = protected_file(REGISTRY, maximum=1024 * 1024)
    value = json.loads(original)
    result = merge_registry(value, proposed_entry(config))
    plan = {"action": "register", "apply": apply, "entry": proposed_entry(config), "alreadyRegistered": result == value, "preflight": report}
    if not apply or result == value:
        return plan
    if not running() or not health(config):
        raise RuntimeError("Start and validate this site's real backend before registering it")
    with maintenance_lock():
        backup = REGISTRY.parent / ("sites.before-slow-notes-" + uuid.uuid4().hex + ".json")
        with backup.open("xb") as output:
            os.chmod(backup, 0o600)
            output.write(original)
            output.flush()
            os.fsync(output.fileno())
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=REGISTRY.parent, prefix=".slow-notes-", delete=False) as output:
                temporary = Path(output.name)
                os.chmod(temporary, 0o600)
                output.write(canonical(result))
                output.flush()
                os.fsync(output.fileno())
            if protected_file(REGISTRY, maximum=1024 * 1024) != original:
                raise RuntimeError("Registry changed concurrently; refusing to overwrite it")
            os.replace(temporary, REGISTRY)
            fsync_directory(REGISTRY.parent)
        finally:
            if temporary and temporary.exists():
                temporary.unlink()
    return plan | {"backup": str(backup), "mainPreserved": True}


def inventory():
    rows = []
    mounts = mount_fields(Path("/proc/self/mountinfo").read_text())
    for path in ("/mnt/mmcblk0p6", "/mnt/disks/disk1"):
        item = mounts.get(path)
        rows.append({"path": path, "mounted": bool(item), **({"fs": item["fs"], "root": item["root"], "uuid": block_uuid(item["source"]), "free": shutil.disk_usage(path).free} if item else {})})
    registry = json.loads(protected_file(REGISTRY, maximum=1024 * 1024))
    return {"architecture": os.uname().machine, "memoryAvailable": memory_available(), "mounts": rows, "nginx": nginx_inventory(),
            "sites": [{key: row.get(key) for key in ("id", "url", "editor", "services", "healthPort")} for row in registry.get("sites", [])],
            "examplePort8788Listening": port_open(8788), "changesMade": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=CONFIG)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("inventory")
    sub.add_parser("preflight")
    verify = sub.add_parser("verify")
    verify.add_argument("directory", type=Path)
    staged = sub.add_parser("stage")
    staged.add_argument("archive", type=Path)
    staged.add_argument("--apply", action="store_true")
    active = sub.add_parser("activate")
    active.add_argument("bundle")
    active.add_argument("--apply", action="store_true")
    active.add_argument("--start", action="store_true")
    registered = sub.add_parser("register")
    registered.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.command == "verify":
        manifest, size = verify_release(args.directory)
        result = {"verified": True, "bundleId": manifest["bundleId"], "bytes": size}
    elif args.command == "inventory":
        result = inventory()
    else:
        config = load_config(args.config)
        if args.command == "preflight":
            result = preflight(config)
        elif args.command == "stage":
            result = stage(config, args.archive, args.apply)
        elif args.command == "activate":
            result = activate(config, args.bundle, args.apply, args.start)
        else:
            result = register(config, args.apply)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError, KeyError, tarfile.TarError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
