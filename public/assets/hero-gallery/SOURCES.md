# JOGUMAN 官方封面图库

2026-10-23 从 [JOGUMAN 官网 Downloads / Wallpaper](https://en.joguman.com/downloads_inner/?category=8p7c85OM08) 实际下载、解包并逐张检查。本轮共收集 **13 张桌面完整横屏原画、22 张手机完整竖屏原画**；首页实际随机使用 **13 张桌面、18 张手机**。桌面只接收官方 PC / Desktop 约 16:9 文件，手机使用官方 lock screen / phone 文件，未使用设备样机、网页缩略图或安装说明。

每幅图的稳定来源页、官方压缩包内文件名、原始尺寸和 SHA256 均在 [`public/data/hero-gallery.json`](../../data/hero-gallery.json) 中。原有图片继续引用 `hero-v3/`，本文件夹保存新增图片。官网附件使用短期下载令牌，故不保存会过期的附件链接。

## 本轮新增作品

| 官方作品 | 官方页面 | 桌面 / 手机新增 |
| --- | --- | --- |
| Joguman Timetable | [官方页面](https://en.joguman.com/downloads_inner/?bmode=view&idx=173621825) | 0 / 2 |
| Loading Brachio | [官方页面](https://en.joguman.com/downloads_inner/?bmode=view&idx=172585463) | 1 / 1 |
| Long Woody | [官方页面](https://en.joguman.com/downloads_inner/?bmode=view&idx=172237278) | 0 / 1 |
| Joguman Dinos 2025 | [官方页面](https://en.joguman.com/downloads_inner/?bmode=view&idx=166778994) | 1 / 2 |
| Lucky Brachio | [官方页面](https://en.joguman.com/downloads_inner/?bmode=view&idx=162983351) | 0 / 1 |
| Joguman Dinos | [官方页面](https://en.joguman.com/downloads_inner/?bmode=view&idx=162983171) | 1 / 2 |
| Brachio & Diplo Gazing | [官方页面](https://en.joguman.com/downloads_inner/?bmode=view&idx=162983027) | 2 / 2 |
| I'm Leaving This Planet | [官方页面](https://en.joguman.com/downloads_inner/?bmode=view&idx=162981263) | 0 / 2 |
| Undercover Mosa | [官方页面](https://en.joguman.com/downloads_inner/?bmode=view&idx=162981168) | 1 / 1 |
| Brachio Drifting Away | [官方页面](https://en.joguman.com/downloads_inner/?bmode=view&idx=162981023) | 1 / 1 |
| Happy Halloween（补手机原图） | [官方页面](https://en.joguman.com/downloads_inner/?bmode=view&idx=162980771) | 0 / 1 |
| Pretending to be Productive | [官方页面](https://en.joguman.com/downloads_inner/?bmode=view&idx=162980561) | 1 / 1 |
| Diplo Drinking Beer | [官方页面](https://en.joguman.com/downloads_inner/?bmode=view&idx=162980505) | 1 / 1 |

Gazing 是官方 3D 地铁场景；Timetable 是官方日程表构图；Leaving This Planet 是官方两格小漫画。均保持原本构图，没有在博客制作中拼贴或重绘。Timetable 和 Leaving This Planet 共 4 张手机图的正文会与首页标题争抢位置，因此保留下载来源记录但标为 `enabled:false`，不会进入首页随机池，后续同步也保留此选择。原有 BBQ、Hanok、Christmas、Halloween 宽屏及吉他竖屏的来源见 `../hero-v3/SOURCES.md`。

## 技术处理

只作等比缩放：桌面最长宽度 2560px，手机最长宽度 1080px；Pillow LANCZOS、JPEG quality 89、subsampling 0。大尺寸 JPEG 先在解码阶段等比缩小以控制内存；不裁切、不拉伸、不改色。透明原图以白色画布导出 JPEG。`skyColor` 取原图顶部均色，供页面在完整原画上方自然接色；`aspectRatio` / `portraitRatio` 保留各图实际比例。

## 随文章发布检查新图

每次 `main` 收到上传（包括文章更新）或手动运行 Pages 工作流时，会先运行 `scripts/update-official-gallery.py`：

1. 读取官网当前 Wallpaper 列表，检查新作品或已有作品的新附件。用稳定附件标识计算指纹，不把短期令牌当成更新。
2. 每次最多下载 6 个新增/变更作品，网络总预算 150 秒；只接收官方来源及官方附件 CDN、验证文件大小/图片尺寸/ZIP 路径，排除手表、小尺寸预览、home screen 和 logo 版。
3. 图片全部写入后，原子更新图库清单；图片通过 SHA256 去重。官网不可用、附件损坏或超时，继续发布仓库里已有的封面，不影响文章上线。
4. 新素材与清单由 GitHub Actions 自动提交回仓库，再随同本次文章构建部署。使用工作流的 `GITHUB_TOKEN`，无额外账户或服务；不会触发循环部署。若发布期间 `main` 已有新提交，不强推覆盖：本次网站仍使用下载到的图片，下次发布重新检查并存入仓库。

手动检查：`python -m pip install Pillow==13.0.0` 后执行 `python scripts/update-official-gallery.py`。离线回归检查：`python scripts/test-official-gallery.py`。

自动同步依赖官网公开下载页结构；若官网改变页面或停止提供附件，已有素材仍可用，工作流会留下提示。不会承诺官网按固定周期更新。所有原画及角色版权归 JOGUMAN / Joguman Studio。
