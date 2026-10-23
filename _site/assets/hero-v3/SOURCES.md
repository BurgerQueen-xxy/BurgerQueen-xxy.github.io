# 首页完整宽屏官方原画（2026-10-23）

四张图片均从 JOGUMAN 官网公开 Downloads 页的 ZIP 附件解包得到，选用官方 **PC wallpaper 169（16:9）**版本。网页文件仅进行技术处理：Pillow LANCZOS 等比缩至 2560×1440，JPEG quality=90、subsampling=0；没有裁切、拼接、改色、抠图或 AI 重绘。原始超大图保存在项目外 `C:/Users/32746/Desktop/BLOG/.hero-v3-originals/`，不随 public 上传。

| 网页文件 | 原始尺寸 | 字节 | 来源页面 / 官方附件 |
| --- | --- | --- | --- |
| autumn-bbq-web.jpg | 19602×11027 | 380035 | [BBQ Party](https://en.joguman.com/downloads_inner/?bmode=view&idx=162980695&t=board) / wallpaper-bbq-party.zip |
| summer-hanok-web.jpg | 19602×11027 | 326095 | [Hanok](https://en.joguman.com/downloads_inner/?bmode=view&idx=162980401&t=board) / wallpaper-hanok.zip |
| winter-snow-web.jpg | 19602×11027 | 105093 | [Merry Christmas](https://en.joguman.com/downloads_inner/?bmode=view&idx=162980824&t=board) / wallpaper-merry-christmas.zip |
| night-halloween-web.jpg | 4705×2647 | 239811 | [Happy Halloween](https://en.joguman.com/downloads_inner/?bmode=view&idx=162980771&t=board) / wallpaper-happy-halloween.zip |

附件的下载地址使用短期令牌，故记录稳定官网页面和 ZIP 文件名。各原始文件在 ZIP 内的路径及 SHA256 见 `metadata.json`。

## 构图与适用性（已逐张目视核验）

- **秋日 BBQ 首选**：天然完整庭院、落叶、黄树与居中五角色聚餐。所有角色来自同一官方整幅画，大小比例自然。聚餐主体约在 x=32%–68%、y=46%–78%；左侧0%–30%主要是天空/草地，可放字，但中间有屋檐横线。宽屏 `object-position:50% 70%` 可优先保护较低的聚餐画面。画中是晴天，不能声称它本身描绘雨雪。
- **夏日 Hanok**：布拉吉奥坐在廊下吃西瓜；其与桌子约在x=37%–66%、y=50%–87%；左上0%–48%、y=0%–50%几乎都是浅蓝天空，最适合长标题。建议 `object-position:50% 75%`。可作为温暖季节日间场景，但不是正式“春季”主题画。
- **冬季雪夜**：深蓝天空、细雪、圣诞帽布拉吉奥和糖果杖。主体约x=44%–54%、y=73%–86%；上方约60%为深蓝留白，适合白色标题。桌面版没有方形预览上的大段节日文字。建议 `object-position:50% 85%`；适合冬夜/圣诞，不宜自动代表全年任意地方下雪。
- **万圣节月夜备用**：橙色天空、满月、枯树、黑色地面、化装的四角色。人物约x=27%–72%、y=57%–74%；大月亮在左侧，标题放左上时须避开月亮/树冠。建议 `object-position:50% 70%`。这是明确的万圣节画，不是一般蓝色夜景，建议节日期间才启用。

`object-position` 仅给“容器比16:9更宽”时的保主体起点；完整原画应优先按16:9展示。手机若直接cover这些横屏，会裁去左右场景，应另用官网竖屏附件或使用contain，并单独验证文字不挡人物。不得通过拉伸改变角色比例。

## 未纳入网页的候选

- Lucky Brachio 的官网附件只有1242×2437竖屏幸运草图，不能完整铺满宽屏。
- Late Night Guitar 的官网ZIP只有2438×5275竖屏吉他夜景（home / lock两版），没有桌面版。不能把小方图或设备预览当作宽屏原画。

所有角色及场景版权归 JOGUMAN / Joguman Studio。本文件记录可核实的出处与处理过程，不代表官方开放许可证或官方认可本博客。

## 手机主场景（追加于2026-10-23）

以下选用官方 ZIP 的 **iPhone lock screen** 原图，未使用安基罗厨师等简化 home screen。仅 Pillow LANCZOS 等比缩至1080宽、JPEG quality90，无裁切/重绘/改色；原图保存于 `.hero-v3-originals/*-mobile-original.jpg`。尺寸、原始ZIP路径、SHA256见 `metadata-mobile.json`。

| 网页文件 | 原始尺寸 → 网页尺寸 | 网页字节 | 原画内容 |
| --- | --- | --- | --- |
| autumn-bbq-mobile.jpg | 5176×10155 → 1080×2119 | 219951 | 完整秋日庭院五角色聚餐，上半部蓝天留白 |
| summer-hanok-mobile.jpg | 5176×10155 → 1080×2119 | 208939 | 廊下吃西瓜，上方天空、太阳和云 |
| winter-snow-mobile.jpg | 5176×10155 → 1080×2119 | 104893 | **圣诞水晶球**中的雪地布拉吉奥；这与桌面雪地版构图不同，是官方手机锁屏原版 |
| night-guitar-mobile.jpg | 2438×5275 → 1080×2337 | 191137 | 布拉吉奥弹吉他、猫狗相伴、窗外月亮及城市，上方室内留白 |

前三张来源同上表的秋/夏/冬公开下载页。夜图来源：[Late Night Guitar](https://en.joguman.com/downloads_inner/?bmode=view&idx=162981207&t=board)，附件 `wallpaper-late-night-guitar.zip`，原文件 `Wallpaper-Late Night Guitar/Wallpaper-Lonesome Night, Guitar-iPhone lock screen.jpg`。

### 日常吉他夜景的编辑式宽屏排版参考

- 原图上方主墙面色：**RGB(191,174,156)，#BFAE9C**。这是原始JPEG上方25%区域的众数值，约320万个像素一致；缩放/重压后边缘可能有轻微JPEG色差。
- 原图底部地面色：**RGB(114,102,90)，#72665A**，由原图(100,5000)像素采样确认。
- 原图最上方约29%为纯墙面留白；主要人物、吉他、前景猫狗约在x=0%–66%、y=51%–76%；窗户约x=66%–100%、y=29%–66%。
- 左边缘下半部原本会经过白沙发、蓝地毯和棕地板，因此把整张夜图放右侧再将左侧填成单一墙面色，会在图的下半部产生接缝。可以让图独立作为完整插画区域、使底部地板色延伸，或用版式留白明确区分；不要强行横向拉伸或裁去角色。
- 手机建议完整按原始比例展示；文字可放上方留白。宽屏使用整张竖图靠右、左侧墙面色留白属于网页编辑排版，不应称为官方原有宽屏画。

### 夜景横屏复核

2026-10-23 再次核对英文新站、[韩文新站](https://www.joguman.com/downloads_inner/?bmode=view&idx=160345112)、[旧版下载页](https://www.joguman.com/asdfvazzx/?bmode=view&idx=14153260)：均仅公开同名 `wallpaper-late-night-guitar.zip`（页面标1155KB），无额外PC/iPad附件。已下载ZIP仅含两张2438×5275 iPhone竖图。旧页另一个1920×1919图片是两部手机的设备样机预览，并非隐藏的横屏原画。本次未找到符合非节日条件的官方完整横屏夜景，未创建 `night-guitar-web.jpg`。
