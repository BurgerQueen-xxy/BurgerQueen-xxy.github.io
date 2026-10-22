"""Linux mount checks. No mounts or repairs are performed by this module."""
import json
import os
import re
import shutil
import subprocess
import time
import hashlib
from pathlib import Path


def mount_fields(text):
    def unescape(value):
        return re.sub(r'\\([0-7]{3})', lambda m: chr(int(m[1], 8)), value)
    result = {}
    for line in text.splitlines():
        left, right = line.split(' - ', 1)
        fields, fs = left.split(), right.split()
        result[unescape(fields[4])] = {'id': fields[0], 'device': fields[2], 'root': unescape(fields[3]), 'options': set(fields[5].split(',')),
                                       'fs': fs[0], 'source': unescape(fs[1]), 'super': set(fs[2].split(','))}
    return result


def validate_mounts(expected, mounts, read_uuid):
    for volume in expected:
        actual = mounts.get(volume['path'])
        if not actual or actual['fs'] != volume.get('fs','ext4') or actual['root'] != volume.get('root', '/'):
            raise RuntimeError('博客存储挂载缺失或文件系统不符')
        if 'rw' not in actual['options'] or 'rw' not in actual['super']:
            raise RuntimeError('博客存储为只读')
        if volume.get('exec') and 'noexec' in actual['options']:
            raise RuntimeError('博客运行盘禁止执行')
        if read_uuid(actual['source']) != volume['uuid']:
            raise RuntimeError('博客存储 UUID 不符')


class MountGuard:
    def __init__(self, spec: Path):
        self.expected = json.loads(spec.read_text(encoding='utf-8'))
        if not isinstance(self.expected, list) or len(self.expected) not in (2,3,4):
            raise ValueError('需要运行盘、数据盘、bind 入口及可选 NAS 的挂载约束')
        self.spec_digest = hashlib.sha256(spec.read_bytes()).hexdigest()
        self.attestation = Path(os.environ.get('CMS_MOUNT_ATTESTATION', '/tmp/blog-slow-notes/mount-identity.json'))

    def attest(self):
        """Only the root supervisor reads raw block UUIDs, never the editor process."""
        def read_uuid(source):
            output = subprocess.check_output(['/sbin/block', 'info', source], timeout=5, stderr=subprocess.DEVNULL).decode()
            match = re.search(r'UUID="([^"]+)"', output)
            return match[1] if match else None
        mounts = mount_fields(Path('/proc/self/mountinfo').read_text())
        validate_mounts(self.expected, mounts, read_uuid)
        identity = {item['path']: {key: mounts[item['path']][key] for key in ('id', 'device', 'root', 'source')}
                    for item in self.expected}
        payload = {'spec': self.spec_digest, 'at': time.monotonic(), 'mounts': identity}
        temporary = self.attestation.with_suffix('.tmp')
        temporary.write_text(json.dumps(payload))
        temporary.chmod(0o644)
        temporary.replace(self.attestation)

    def __call__(self):
        info = self.attestation.stat()
        if info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError('存储守卫凭据权限不符')
        payload = json.loads(self.attestation.read_text())
        if payload['spec'] != self.spec_digest or not 0 <= time.monotonic() - payload['at'] < 15:
            raise RuntimeError('存储守卫未运行或凭据过期')
        mounts = mount_fields(Path('/proc/self/mountinfo').read_text())
        for volume in self.expected:
            actual = mounts.get(volume['path'], {})
            if any(actual.get(key) != value for key, value in payload['mounts'][volume['path']].items()):
                raise RuntimeError('挂载已改变，需要维护程序重新核验')
        # UUIDs were read from block devices by root for these exact mount IDs.
        by_source = {mounts[v['path']]['source']: v['uuid'] for v in self.expected}
        validate_mounts(self.expected, mounts, by_source.get)


def check_capacity(path: Path, minimum_free: int, incoming=0):
    if shutil.disk_usage(path).free - incoming < minimum_free:
        from .content import fail
        fail('存储剩余空间不足，内容保留在客户端；请先备份并检查存储', 507)


def configured_guard():
    adapter = os.environ.get('CMS_MOUNT_GUARD')
    if adapter:
        import importlib
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.]*:[A-Za-z_][A-Za-z0-9_]*', adapter):
            raise RuntimeError('无效的挂载守卫入口')
        module, factory = adapter.split(':')
        guard = getattr(importlib.import_module(module), factory)()
        if not callable(guard):
            raise RuntimeError('挂载守卫必须返回可调用对象')
        return guard
    spec = os.environ.get('CMS_MOUNT_SPEC')
    if os.environ.get('CMS_REQUIRE_MOUNTS') == '1' and not spec:
        raise RuntimeError('生产挂载守卫配置缺失')
    return MountGuard(Path(spec)) if spec else None
