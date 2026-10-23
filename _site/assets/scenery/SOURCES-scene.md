# 随季节、日夜与天气变化的场景

本页记录 2026-10-23 新增的原图与场景规则。所有角色与图片均为 JOGUMAN 官方原图，原文件字节未编辑；没有重新生成或描绘角色。官网没有发布覆盖「四季 × 日夜 × 晴雨雪雾」的同版式背景套图，因此页面采用 **官方云朵、树丛、角色及插画 + 本站制作的背景配色与 CSS 天气效果**。组合后的网页场景不是官方整幅作品。

## 新增官方原图

图片均为 1920 × 1920，保存自官网文章直接引用的 CDN。版权 © JOGUMAN, INC.。

| 本地文件 | 官方文章 | 原图 URL | 用途 |
| --- | --- | --- | --- |
| `summer-hanok-art.jpg` | [Hanok Wallpaper](https://en.joguman.com/downloads_inner/?bmode=view&idx=162980401&t=board) | https://cdn.imweb.me/upload/S2020070945bd60b018bf8/df0d9ca3025df.jpg | 夏季：布拉吉奥在廊下吃西瓜 |
| `autumn-bbq-official.jpg` | [BBQ Party Wallpaper](https://en.joguman.com/downloads_inner/?bmode=view&idx=162980695&t=board) | https://cdn.imweb.me/upload/S2020070945bd60b018bf8/16bfff68dbd2e.jpg | 秋季：落叶、金黄灌木与伙伴聚餐 |
| `winter-christmas-official.jpg` | [Merry Christmas Wallpaper](https://en.joguman.com/downloads_inner/?bmode=view&idx=162980824&t=board) | https://cdn.imweb.me/upload/S2020070945bd60b018bf8/b4809812053d7.jpg | 冬季：雪地里的布拉吉奥，保留原图节日文字 |
| `night-guitar-official.jpg` | [Late Night Guitar Wallpaper](https://en.joguman.com/downloads_inner/?bmode=view&idx=162981207&t=board) | https://cdn.imweb.me/upload/S2020070945bd60b018bf8/2b830d058a15a.jpg | 夜间：月光下弹吉他的布拉吉奥 |
| `autumn-halloween-official.jpg` | [Happy Halloween Wallpaper](https://en.joguman.com/downloads_inner/?bmode=view&idx=162980771&t=board) | https://cdn.imweb.me/upload/S2020070945bd60b018bf8/fff898d1351d3.jpg | 研究备选，当前未启用 |
| `mosa-official.jpg` | [Undercover Mosa Wallpaper](https://en.joguman.com/downloads_inner/?bmode=view&idx=162981168&t=board) | https://cdn.imweb.me/upload/S2020070945bd60b018bf8/2b0dfd2d397c6.jpg | 夏日喷泉备选，当前未启用 |

春季复用 `../lucky-official.jpg`：[Lucky Brachio Wallpaper](https://en.joguman.com/downloads_inner/?bmode=view&idx=162983351&t=board)，原图 https://cdn.imweb.me/upload/S2020070945bd60b018bf8/90bd1dc9b9cb2.jpg 。原版云、灌木和砖墙来源见同目录 `SOURCES.md`。

插画作为小幅明信片完整等比呈现，不裁剪角色、不做颜色滤镜。850px 以下为保护原有标题与角色版式，不显示小明信片；四季配色与天气、日夜场景仍然生效。`mountScene({postcard:false})` 可关闭桌面明信片。

## 状态映射

- 季节：北半球 3–5 月春、6–8 月夏、9–11 月秋、12–2 月冬。城市纬度小于 0 时对调南北半球季节；默认杭州。城市提供有效时区时使用城市时区，否则沿用站点日历 `Asia/Shanghai`。这是按月份划分的季节，不将其当作当地气温或植被的实测值。
- 春：淡蓝与浅粉晨色、嫩绿地面、少量花瓣；夏：明亮蓝天、草绿地面；秋：暖灰蓝天、麦色地面与少量落叶；冬：冷淡蓝天、浅灰绿地面。树丛只加 CSS 季节色调，角色始终保留原色。
- 自动日夜：优先使用所选城市 Open-Meteo 缓存中当天的 `sunrise`、`sunset` 和 `utc_offset_seconds`。晨间为日出前 45 分钟至日出后 85 分钟；傍晚为日落前 90 分钟至日落后 45 分钟；其余区间为白天或夜晚。日出日落不足时用城市经纬度与当前 UTC 时刻估算太阳高度，公式来源 [NOAA Solar Calculations](https://gml.noaa.gov/grad/solcalc/solareqns.PDF)。该估算只用于装饰场景，不作为精密天文数据。
- 手动明暗：用户手动选择明/暗主题时，相应显示日间/夜间外观；回到自动模式后继续根据所在地日照。夜景显示月亮、星星、夜间原画与较暗的地景；所有四季仍保留各自地面色调。
- 天气：读取现有 widgets 写入的 `data-weather-condition`。`clear` 晴空，`cloud` 灰蓝云层，`rain` / `storm` 阴天与轻雨、地面水洼，`snow` 浅色地面与雪花，`fog` 低对比雾层，`unknown` 不展示降水。雷雨不使用闪烁效果。冬季本身不会触发动态降雪，只有天气为雪才下雪。
- 空间：天气粒子避开主标题区，不拦截点击；手机减少粒子数量。尊重 `prefers-reduced-motion`，后台标签页暂停动画。

## 接线与更新

1. 在 `island.css` 之后引入 `modules/scene.css`。
2. 导入 `mountScene` / `syncScene`；widgets 初始化之后调用 `mountScene()`，每次重新渲染首页后调用 `syncScene()`。
3. 模块监听根元素的时间、天气、主题状态，每分钟及回到前台时同步；复用现有天气数据，不再发起另一套天气请求。

源码：`public/modules/scene.js`、`public/modules/scene.css`。该模块不会更改文章、栏目、天气设置或手动主题偏好。

基本验证：JavaScript 语法检查通过；四季月份、南半球对调、日出/日落时区换算、手动主题覆盖、太阳高度后备以及 112 组季节 × 时间 × 天气映射通过，映射的本地图片均存在。
