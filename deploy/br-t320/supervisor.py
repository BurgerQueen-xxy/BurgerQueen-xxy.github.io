"""Root-only mount supervisor for one unprivileged Slow Notes CMS process."""
import argparse
import hashlib
import os
import signal
import stat
import subprocess
import sys
import time
from pathlib import Path

from router_tool import CONFIG, NAS, PRIVATE, current_target, load_config, protected_directory, protected_tree_path, verify_release
from site_guard import MountGuard, protected_file


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=CONFIG)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise SystemExit("The mount supervisor must run as root; its CMS child never does")
    config = load_config(args.config)
    guard = MountGuard(config["mountSpec"], config["attestation"])
    guard.attest()
    protected_tree_path(NAS / "programs", base="/mnt/disks/disk1")
    protected_tree_path(PRIVATE.parent, base="/mnt/mmcblk0p6")
    target = current_target()
    if target is None:
        raise RuntimeError("No verified Slow Notes release is active")
    manifest, _ = verify_release(target)
    if manifest["bundleId"] != target.name:
        raise RuntimeError("Active directory does not match the verified release identity")
    # Every source and dependency file is immutable to the business account.
    for path in [target, *target.rglob("*")]:
        info = path.lstat()
        if info.st_uid != 0 or info.st_mode & 0o022 or not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
            raise RuntimeError("Application release must be root-owned and read-only to other users")
    import pwd, grp
    user, group = pwd.getpwnam(config["user"]), grp.getgrnam(config["group"])
    if user.pw_uid == 0 or group.gr_gid == 0 or user.pw_gid != group.gr_gid:
        raise RuntimeError("Dedicated non-root user/group is required")
    private_info = PRIVATE.lstat()
    if not stat.S_ISDIR(private_info.st_mode) or private_info.st_uid != user.pw_uid or private_info.st_gid != group.gr_gid or private_info.st_mode & 0o077:
        raise RuntimeError("Private CMS directory must be slownotes:slownotes 0700")
    runtime = Path(config["python"]).resolve(strict=True)
    protected_file(runtime, maximum=512 * 1024 * 1024)
    if not runtime.is_relative_to("/mnt/mmcblk0p6") or not os.access(runtime, os.X_OK):
        raise RuntimeError("Verified TF Python executable is required")
    paths = [str(target / "app")]
    for directory in config.get("readOnlyDependencyPaths", []):
        protected_tree_path(directory, base="/mnt/mmcblk0p6")
        paths.append(directory)
    # Build a small clean environment: no inherited CMS GitHub token/config or root credentials.
    environment = {
        "PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8",
        "PYTHONPATH": os.pathsep.join(paths), "PYTHONUNBUFFERED": "1", "PYTHONDONTWRITEBYTECODE": "1",
        "CMS_SITE_ID": "slow-notes", "CMS_PORT": str(config["port"]), "CMS_USER": config["user"], "CMS_GROUP": config["group"],
        "CMS_DATA": str(PRIVATE), "CMS_SOURCE": str(target / "source"), "CMS_REPO": str(target / "source"),
        "CMS_PROGRAM": str(target / "program"), "CMS_EDITOR_DIST": str(target / "editor"),
        "CMS_ORIGIN": config["editorOrigin"], "CMS_PUBLIC_ORIGIN": config["publicOrigin"],
        "CMS_DEV": "0", "CMS_GITHUB_ENABLED": "0", "CMS_ROUTER_ENABLED": "1", "CMS_LAN_READONLY": "1",
        "CMS_REQUIRE_MOUNTS": "1", "CMS_MOUNT_GUARD": "site_guard:configured_guard",
        "CMS_MOUNT_SPEC": config["mountSpec"], "CMS_MOUNT_ATTESTATION": config["attestation"],
        "CMS_PROGRAM_MANIFEST_SHA256": hashlib.sha256((target / "program/program.json").read_bytes()).hexdigest(),
        "CMS_MINIMUM_FREE": "268435456", "CMS_MEDIA_QUOTA": "536870912",
    }
    child = subprocess.Popen([str(runtime), "-B", "-m", "uvicorn", "cms.app:configured_app", "--factory", "--host", "127.0.0.1",
                              "--port", str(config["port"]), "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1",
                              "--no-access-log", "--limit-concurrency", "16", "--timeout-graceful-shutdown", "10"],
                             cwd=str(target / "app"), env=environment, user=user.pw_uid, group=group.gr_gid, extra_groups=[], umask=0o077)
    stopping = False
    def stop(_signal, _frame):
        nonlocal stopping
        stopping = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        while child.poll() is None and not stopping:
            time.sleep(3)
            guard.attest()
    finally:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=12)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
    raise SystemExit(child.returncode)


if __name__ == "__main__":
    main()
