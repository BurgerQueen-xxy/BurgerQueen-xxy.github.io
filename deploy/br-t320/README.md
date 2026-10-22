# BR-T320：Slow Notes 与独立文章编辑室

这些文件是 **尚未在真实路由器验收的部署准备材料**。本次只在电脑生成、检查，没有连接路由器。8788、示例域名、LAN/WG 网段、运行时位置、NAS 文件系统都需要重新核对。配置保留占位值且 `reviewed=false`；原样执行会拒绝部署。

采用独立 CMS 实例，站点 ID 为 `slow-notes`，服务为 `blog-slow-notes`，业务账号和组为 `slownotes`。草稿、媒体、管理员、会话、SQLite 与候选均使用本站私人目录。GitHub 发布始终禁用，没有旧站 GitHub 授权入口。

此次范围是文章编辑与图片/相册管理，没有启用音乐部署；不配置 `CMS_MUSIC_ROOT`，相关部署操作保守拒绝。

## 文件与固定边界

| 文件 | 用途 |
| --- | --- |
| `router_tool.py` | 只读盘点/预检、制品校验、版本入库、切换与失败恢复、安全追加 LuCI 条目 |
| `site_guard.py` | 校验 TF/NAS 的 UUID、文件系统、mount ID、读写状态、可用空间；不挂载或创建磁盘目录 |
| `supervisor.py` | root 定期证明挂载身份，启动一个非 root CMS 子进程；失盘终止本站进程 |
| `blog-slow-notes.init` | 仅管理本站 procd 实例，不控制全局 nginx 或主站 |
| `site.json.example`、`mounts.json.example`、`service.env.example` | 待现场核对的配置；不含密码、密钥或生产凭据 |
| `nginx.slow-notes.conf.example` | 共享现有 HTTPS 入口的独立公开/编辑室虚拟主机示例 |
| `test_router_tool.py` | 可在电脑运行的 stdlib 单元测试，不访问路由器 |

目录约定：

```text
/etc/blog-sites/slow-notes/             root 配置、部署工具、独立证书
/etc/init.d/blog-slow-notes             root:root 0755，普通文件
/mnt/disks/disk1/blog-sites/slow-notes/
  staging/                            上传和临时解包，仅 root 可写
  programs/<release-bundleId>/         完整不可变版本
    release.json
    app/cms/ + app/site_guard.py
    editor/
    program/
    source/snapshot.json
  current -> programs/<release-bundleId>
/mnt/mmcblk0p6/blog-sites/slow-notes/
  private/                            slownotes:slownotes 0700
/tmp/blog-slow-notes/mount-identity.json
/tmp/blog-slow-notes-backup.lock
```

Python 可使用已经核验、只读的 TF 运行时。不能共用 main 的可写状态、Git 镜像、配置、临时目录、备份锁、音乐、管理员或私钥。第三方 Python 包必须提前在电脑准备兼容 aarch64 的版本或核验现有只读依赖；不对主站运行时直接执行 pip 安装。

## 初装前必须形成的现场记录

这不是通用自动安装器。首次安装需操作员核实并准备用户、目录、配置、独立证书和入口；工具不创建账号、不授权 SSH、不配置 DNS/CA/防火墙、不更改 nginx。

1. 记录路由器 SSH 主机指纹，在本机已有可信渠道核对；使用本站设备独立密钥与 `StrictHostKeyChecking=yes`。如果新设备尚未授权，先审查新增公钥与删除该公钥的回滚方案。不要复制其他电脑私钥或打印完整 `service.env`。
2. 通过已有合法 SSH 维护方式复制 `router_tool.py` 和 `site_guard.py` 到 root 控制的临时目录，用已核验的 Python 运行 `router_tool.py inventory`。该命令只读，输出挂载 UUID/fs/free、内存、现有站点、nginx master 的配置路径和示例 8788 的 loopback 占用结果；不会打印密码、完整进程环境或完整 nginx 配置。另核对 IPv4/IPv6 实际监听，不能仅凭 8788 loopback 检查就认为端口一定可用。
3. 逐项确认唯一公开域名与编辑室域名、空闲后台端口、TF 与 NAS 真实 UUID/文件系统、独立账号 UID/GID、剩余内存和空间。`mounts.json` 必须使用实际值；默认 TF 至少保留 512 MiB，NAS 至少保留 2 GiB。上传大小还会额外计入 NAS 空间预检。
4. 预先准备上述目录。NAS 的站点根、staging、programs 及所有祖先必须是非链接、root 所有且禁止组/其他用户写；目录建议 0755。TF 的站点父目录 root:root 0755，私人目录 `slownotes:slownotes 0700`。不要对共享 NAS、TF 或 main 做递归 chown/chmod。若 NTFS 不能保持这些属性，停止并另选经批准的部署位置，不能降低检查。
5. 安装本站工具 `router_tool.py`、`site_guard.py`、`supervisor.py` 到 `/etc/blog-sites/slow-notes/`，root:root 0644；安装 init 为普通文件 root:root 0755。站点配置目录 root:root 0755。`site.json` 与 `service.env` 建议 root:root 0600；`mounts.json` 必须让业务账号可读（root:root 0644），但不可写。init 只会创建本站 `/tmp` 身份目录，不会创建或修复磁盘挂载。
6. 填写 `site.json` 后，将 `reviewed` 明确设为 true。必须设真实端口；模板中的 null 不会自动替换为 8788。`nginxConfig` 必须来自当前运行 nginx master，而非猜测默认入口。`readOnlyDependencyPaths` 只加入已确认没有业务写权限的依赖目录。检查 `service.env` 的运行时与 `site.json` 一致。
7. 根据现网 `nginx -T` 审查独立虚拟主机。确认 443 共用方式、LAN/WG 网段、独立 SAN 和证书路径，保留原配置副本。使用现有受保护 CA 流程，CA 私钥不离开路由器。新增 SSH 授权、共享 CA 签发配置或网络权限须另行确认；这些脚本不代替该步骤。

安装阶段可能需要用户确认的对象已经具体列在上面。不得运行参考包的 `install_blog_manager.py`、`stage_app.py`、`stage_nas.py`、`network-apply.sh` 或 `apply_foundation.py`。

## 本机产物与校验

项目构建器输出：`release.json` 加 `program/`、`source/`、`app/`、`editor/`。tar 根直接包含这些条目，没有额外 `release/` 外层。`release.files` 覆盖除自身外的全部文件 SHA-256；`bundleId` 是移除 bundleId 后，按原字段顺序紧凑 Unicode JSON 的 SHA-256。它与 `program/program.json` 的程序 bundleId 是两个不同编号。

`deployable` 必须严格为 true。允许脏工作区生成的本地验证包会被部署工具拒绝。版本包含后台与编辑室的完整摘要，不能只改 app 或 editor 而沿用旧版本编号。

在电脑可运行（目录替换为实际构建输出）：

```powershell
python -B deploy/br-t320/router_tool.py verify C:/path/to/release
python -B -m unittest discover -s deploy/br-t320 -p test_router_tool.py -v
```

校验拒绝路径穿越、绝对路径、链接、重复 tar 条目、额外或缺失文件、私钥/数据库/.env、哈希变化和不可部署制品。`stage` 只写本站 staging/programs，不切换 current；已存在版本不会覆盖。

## 上传、首次初始化与版本切换

以下均为路由器上的命令示例；`python` 必须替换为核验后的完整运行时路径。没有 `--apply` 时只给出计划，不执行变更。先核实 mount identity 再上传，避免向空挂载点落盘。上传过程本身应由操作员监视挂载；本工具不会启动 SSH、SCP 或网络连接。

```sh
python /etc/blog-sites/slow-notes/router_tool.py preflight
python /etc/blog-sites/slow-notes/router_tool.py stage /mnt/disks/disk1/blog-sites/slow-notes/staging/release.tar.gz
python /etc/blog-sites/slow-notes/router_tool.py stage /mnt/disks/disk1/blog-sites/slow-notes/staging/release.tar.gz --apply
```

首次启动前，由操作员在核实磁盘仍挂载、数据库目录正确且进程以 `slownotes` 身份运行后，使用新版本 `app` 作为 PYTHONPATH 执行 `python -m cms.cli init-admin --data /mnt/mmcblk0p6/blog-sites/slow-notes/private`。使用保留 stdin/终端的降权方式调用；密码由程序交互读取、不回显，不能放在命令行、日志或聊天。不要以 root 初始化私人数据库，也不设置默认密码。

初次管理员初始化不属于部署工具的自动副作用。先以本站账号验证依赖导入及读写权限；确认私人路径的所有者，再启动服务。生产配置始终要求已有管理员和数据库，不会因丢盘自动创建新库。

```sh
python /etc/blog-sites/slow-notes/router_tool.py activate <release-bundleId>
# 首次启动或明确需要启动此前关闭的博客时才加 --start：
python /etc/blog-sites/slow-notes/router_tool.py activate <release-bundleId> --apply --start
# 已运行博客的后续升级：
python /etc/blog-sites/slow-notes/router_tool.py activate <release-bundleId> --apply
```

切换流程：记录旧指针及运行状态 → 获取本站维护锁 → 停止本站并等待旧端口排空 → 同一 NAS 文件系统原子替换 current → 启动本站 → 确认 procd 运行及 `/healthz`。进程启动时将所有 app/source/program/editor 路径解析为同一个不可变版本，不会在运行中混用两个版本。

失败时先终止候选，再恢复旧指针和原运行状态。初次安装没有旧版本时，移除候选 current 并保持服务停止。若自动恢复失败，命令明确报错并给出 root 配置目录中的 activation 回执，须人工处理，不能宣称部署成功。回执记录准备/健康/已回滚/需人工恢复状态。

`activate` 不运行数据库迁移。若将来版本引入不向后兼容的数据库变更，必须先有私人数据的一致性备份和独立迁移/恢复方案；切回程序指针不能代替数据库恢复。

## HTTPS 与 LuCI 登记

1. 使用模板为已存在 nginx 增加两个精确虚拟主机。独立证书必须覆盖两个域名；不把证书私钥放入 program、source 或 NAS 制品。模板中的 `REPLACE_WITH_VERIFIED_PORT` 会让未经审查的 nginx 配置校验失败。
2. 先对实际配置入口执行 `nginx -t -c <实际入口>`，成功后仅 reload 现有服务。不要重启路由器，不要新开 443，不覆盖 uci.conf，不停止全局 nginx。
3. 客户端用局域网 DNS，验证真实 HTTPS 证书链和首页/文章/资源/移动布局。公开域名的 `/api`、`/admin`、`/healthz` 返回 404；编辑室由 CMS 提供管理员认证、CSRF、精确 Origin 校验与登录限流。检查未登录 API 401、错误 Origin 403、跨站 Cookie 无效。
4. 完成健康与独立入口检查后追加卡片：

```sh
python /etc/blog-sites/slow-notes/router_tool.py register
python /etc/blog-sites/slow-notes/router_tool.py register --apply
```

登记工具保留 root 对象未知字段、main 条目及现有所有站点；拒绝 ID/端口/域名/服务冲突，保存原清单，写同目录临时文件后原子替换。操作前后检查原始字节是否改变；请避免并发登记或地址变更。已经相同登记时不重复写入。没有 `addressConfig`，不会启用仅支持 main 的自动换域名功能。LuCI 的 `/healthz` 使用公开 Host，CMS 精确接受公开与编辑室两个 Host，写 API 仍仅接受编辑室 Origin。

最初不登记 `statusFile/repository`：新站不配置 GitHub，所以不伪造上传/上线时间。CMS 可自行生成本站 `operational-status.json`，将来如需在卡片展示“未配置”状态，须验证实际文件属主 UID、权限、单硬链接、大小后再显式添加状态字段。卡片仅控制 `blog-slow-notes`。

## 回滚与验收记录

程序回滚使用同一个 `activate <上一正常release-bundleId>` 流程；保留当前与上一正常版本。若服务已不健康，先明确停止 `blog-slow-notes` 并确认后台端口释放，再用 `--apply --start` 回到已验证版本。不要删除仍被 current 引用的版本。

初装撤销时先关闭本站、恢复/移除仅本站拥有的 nginx 虚拟主机并验证 reload；只移除本站独立 DNS 与证书关联，保留已有主站、LuCI、WG 配置。LuCI 清单须从当前版本移除仅 `id=slow-notes` 的条目，保留其他与未知字段再原子替换。保留工具生成的原清单作为比对证据，不能用旧整份备份覆盖期间发生的其他站点变更。私人数据保留供恢复；没有脚本自动删除目录。

每次记录站点 ID、源码提交、release/program 编号、时间、当前/上一指针、配置检查与真实验收结果。需要分别检查：草稿保存与公开隔离、冻结候选不随草稿变更、单篇部署/撤下/回滚、图片及相册引用、LuCI 启停、主站/原编辑室/8843/LuCI 仍可访问。实际 IPv4/IPv6 WAN 拒绝、LAN/WG 可达性、DNS/证书与磁盘丢失测试尚未实测时，必须标记“未验收”。

独立私人备份尚未自动计划。仅在本站服务已停止、持有 `/tmp/blog-slow-notes-backup.lock` 且目标挂载身份核验后，使用本站 `cms.cli backup` 生成包含 SQLite 与媒体的一致性备份；保护备份权限，不向公开 NAS 目录写明文。恢复先校验备份，恢复到新的私人目录并撤销旧会话。参考包里写死 `blog-cms` 的备份脚本不能使用。
