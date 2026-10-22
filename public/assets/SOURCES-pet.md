# 布拉吉奥动态角色素材

获取日期：2026-10-23。

## 官方角色动画

- 本地文件：`assets/brachio-pet.json`
- 官方原始文件：https://cdn.jogumancdn.com/lottie/characters/backhole_character_01.json
- 发现位置：JOGUMAN 官方角色页面 https://www.joguman.com/characters/ 的脚本中，`falling-character` / `data-charac="01"` 使用的动画。
- 角色归属：© JOGUMAN。本博客为非官方个人主题；公开 CDN 可访问性不代表授予通用再分发授权。
- 内容：完整的绿色布拉吉奥独立矢量角色，透明背景；252 × 244，60 fps，9 个形状图层，0 个外部资源，原文件约 24 KB。
- 文件按官方下载内容原样保留。原时间线 500 帧，动作关键帧位于 0–19，原文件通过 `loopOut('cycle', 0)` 表达式循环手脚动作。
- 播放方式：轻量 SVG 播放器不支持表达式，因此在播放器中循环播放原有 0–19 帧，以 0.48 倍速呈现；未重绘、替换或改变角色路径、颜色、轮廓与动作关键帧。
- 加载失败时的静态后备图：现有 `assets/brachio.png`，同为 JOGUMAN 官方角色图，来源见项目主素材记录。
- 已排除候选 `brakio_hover_neck.json`：其为 552 × 334 的颈部、帽子、仓鼠组合互动场景，不适合作为完整身体桌面小伙伴。

## 播放器

- 本地文件：`vendor/lottie.min.js`
- 官方包：Airbnb / Bodymovin `lottie-web` 5.13.0，`build/player/lottie_light.min.js`，SVG light renderer。
- 下载地址：https://cdn.jsdelivr.net/npm/lottie-web@5.13.0/build/player/lottie_light.min.js
- 项目：https://github.com/airbnb/lottie-web
- 许可：MIT，全文已保存为 `vendor/lottie-LICENSE.txt`。
- 许可来源：https://cdn.jsdelivr.net/npm/lottie-web@5.13.0/LICENSE.md

## 集成

1. 将项目根目录 `pet.js`、`pet.css` 加入构建复制列表。
2. HTML head 引入 `<link rel="stylesheet" href="./pet.css">`。
3. 在页头添加 `<button id="pet-toggle" type="button" aria-label="隐藏布拉吉奥">…</button>`。
4. 在主模块中 `import { mountPet } from './pet.js';`，DOM 初始化后执行 `mountPet({ trigger: '#pet-toggle' });`。
5. 模块会自动从本站加载 `vendor/lottie.min.js`，无需外部 CDN 请求。

返回实例提供 `show()`、`hide()`、`toggle()`、`pause()`、`play()`、`greet()`、`destroy()`，及 `ready` Promise。也可发送 `document.dispatchEvent(new CustomEvent('brachio-pet', { detail: { action: 'show' } }))`；可用 action 同前六项。

隐藏和暂停状态保存于 `localStorage['slow-notes-pet']`；系统设置减少动态效果时暂停，页面切入后台时暂停。部件固定左下角，桌面 105 × 150、手机 66 × 95，暂停与关闭按钮一直可见。
