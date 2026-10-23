# JOGUMAN 官方场景素材

获取日期：2026-10-23。以下图片均直接保存自 JOGUMAN 官方 CDN，未重画角色、未重绘图像、未修改颜色或路径。版权归 JOGUMAN, INC. 所有；本站为个人非官方博客。

来源网页：[Characters](https://en.joguman.com/characters/)、[Home](https://en.joguman.com/home/)。文件 URL 来自官网实际加载的 [joguman.css](https://cdn.jogumancdn.com/css/joguman.css?ver=250515)。

| 本地文件 | 原始尺寸 | 官方原文件 |
| --- | --- | --- |
| wall_long_sky_pc.png | 3402 × 388 | https://cdn.jogumancdn.com/images/characters/wall_long_sky_pc.png |
| wall_long_tree_pc.png | 5522 × 207 | https://cdn.jogumancdn.com/images/characters/wall_long_tree_pc.png |
| wall_long_bg_pc_new.png | 5522 × 557 | https://cdn.jogumancdn.com/images/characters/wall_long_bg_pc_new.png |
| wall_long_bottom_pc.svg | 4142 × 1118 | https://cdn.jogumancdn.com/images/characters/wall_long_bottom_pc.svg |
| cloud_01_pc.svg | 902 × 418 | https://cdn.jogumancdn.com/images/characters/cloud_01_pc.svg |
| cloud_02_pc.svg | 508 × 270 | https://cdn.jogumancdn.com/images/characters/cloud_02_pc.svg |
| cloud_03_pc.svg | 785 × 552 | https://cdn.jogumancdn.com/images/characters/cloud_03_pc.svg |
| home_light_bg_pc.svg | 5343 × 1777 | https://cdn.jogumancdn.com/images/home/home_light_bg_pc.svg |
| plant.png | 196 × 320 | https://cdn.jogumancdn.com/images/home/plant.png |
| sofa.png | 420 × 332 | https://cdn.jogumancdn.com/images/home/sofa.png |
| clock.png | 104 × 104 | https://cdn.jogumancdn.com/images/home/clock.png |

## 组合建议

- 首页户外全宽场景：天空底色 `#c4e6f7` 附近，`wall_long_sky_pc.png` 放在顶部横向云层；独立 cloud SVG 可用于缓慢平移。底部放透明背景 `wall_long_tree_pc.png`，再将现有官方 `brachio-original.svg` 及角色 PNG 作为前景。所有角色保持原始宽高比，不裁脸、不改变线条。
- `wall_long_bg_pc_new.png` 是红砖墙，不是草坪。若使用，只作场景下部窄条，避免遮住角色和内容。`wall_long_bottom_pc.svg` 为同一街景的地面层。
- `home_light_bg_pc.svg` 是官网客厅的浅蓝不规则背景，配套有沙发、盆栽和时钟；可作为室内栏目背景的备选，不应误标为户外场景。
- 装饰图片无语义时使用空 alt；栏目角色须使用对应中文名作为 alt。图片仅用 CSS 排版和等比缩放，不重新生成角色。
