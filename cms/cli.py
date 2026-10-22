"""Run with python -m cms.cli. Password entry is interactive and never echoed."""
import argparse
import getpass
import shutil
from pathlib import Path

from .store import Store


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['init', 'init-admin', 'serve', 'backup', 'restore'])
    parser.add_argument('--data', required=True, type=Path)
    parser.add_argument('--backup', type=Path)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--program', type=Path)
    parser.add_argument('--editor', type=Path)
    parser.add_argument('--port', type=int, default=8788)
    args = parser.parse_args()
    if args.command in ('init', 'init-admin'):
        password = getpass.getpass('新管理员密码 (至少14字符): ')
        if password != getpass.getpass('再次输入: '):
            raise SystemExit('两次密码不一致')
        Store(args.data).initialize_admin(password)
        print('管理员已初始化；没有默认密码，也没有网页注册入口')
    elif args.command == 'serve':
        import uvicorn
        from .app import Settings, create_app
        project = Path(__file__).resolve().parents[1]
        app = create_app(Settings(
            data=args.data, repo=args.source or project / 'release/source',
            origin=f'http://127.0.0.1:{args.port}', development=True,
            dist=args.editor or project / 'cms-dist', program=args.program or project / 'release/program',
            router_enabled=True, require_initialized=True, lan_readonly=True))
        uvicorn.run(app, host='127.0.0.1', port=args.port)
    elif args.command == 'backup':
        if not args.backup:
            raise SystemExit('需要 --backup 指向不存在的备份目录；先停止服务')
        args.backup.mkdir(parents=True, exist_ok=False)
        Store(args.data, require_initialized=True).backup(args.backup / 'cms.sqlite3')
        shutil.copytree(args.data / 'media', args.backup / 'media')
        shutil.copytree(args.data / 'originals', args.backup / 'originals')
        if (args.data / 'audio').exists():
            shutil.copytree(args.data / 'audio', args.backup / 'audio')
        print('数据库与媒体备份完成。请将备份作为私人数据保护')
    else:
        if not args.backup or not (args.backup / 'cms.sqlite3').is_file() or not (args.backup / 'media').is_dir():
            raise SystemExit('无效备份；恢复前先停止服务')
        if args.data.exists():
            raise SystemExit('恢复目标必须不存在；请先保留原数据目录以便回滚')
        shutil.copytree(args.backup, args.data)
        with Store(args.data).connect() as db:
            result = db.execute('PRAGMA integrity_check').fetchone()[0]
            if result != 'ok':
                raise SystemExit('恢复后数据库校验失败，保留目录供检查')
            db.execute('DELETE FROM sessions')
        print('恢复完成，旧会话已撤销；启动服务后重新登录')


if __name__ == '__main__':
    main()
