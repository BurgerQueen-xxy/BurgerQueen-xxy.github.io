# 世界地图数据

- 数据：Natural Earth 5.1.2，1:50m Admin 0 Countries，公共领域。[使用条款](https://www.naturalearthdata.com/about/terms-of-use/)
- 原始 GeoJSON：https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson
- 本地 `world.json` 复用参考博客 [Mession18/mession18.github.io](https://github.com/Mession18/mession18.github.io) 的 `src/pages/passport/journey-map/world.generated.json`，仅包含由上述公共领域数据投影生成的国家轮廓、名称与标记坐标；241 个形状，南极洲已省略。没有复制参考博客的旅行记录、照片、地图背景插画或用户数据。
- Natural Earth I 投影：前向多项式与数据参数一致，公式参考 [d3-geo naturalEarth1](https://github.com/d3/d3-geo/blob/main/src/projection/naturalEarth1.js)，许可证见 `D3-LICENSE.txt`。模块使用原生 JavaScript，没有打包 D3 依赖。
- 经纬网、地图文字、方向罗盘与样式为本站代码制作。地图仅用于个人旅行记录和地理浏览。

## 旅行数据

地图默认没有足迹。真实记录仅从 `site.journeys` 读取：

```json
{
  "journeys": []
}
```

每个实际条目可包含 `name`（地点名）、`countryCode`（ISO 两字母或三字母代码）、`latitude`、`longitude`、`date`（YYYY-MM-DD）、`slug`（对应现有文章，可不填）。无效/缺失经纬度不会生成图钉；缺失或无效日期显示“日期待补充”；只对存在的文章生成链接。不要用演示旅行记录填充这里。

澳大利亚及其附属区域在源数据中有多个 AU 轮廓，国家选择器合并为一个澳大利亚入口。各轮廓保留原始名称供指针查看。

文件获取于 2026-10-23；地理数据本地随站点分发，在打开地图章节时才加载，不向地图服务发送用户地点信息。

缩放、平移与当前选择的国家仅在当前页面的模块内存中保留，翻页回来会恢复；不会写入 localStorage，也不会缓存私人旅行数据。

## 乔古曼风格地图底纸

`joguman-atlas-paper-v4.webp` 是 2026-10-23 使用 ImageGen 生成的淡色手绘纸张、指南针、云朵与叶片装饰，不是 JOGUMAN 官方插画。底纸不包含地理形状；地图国家轮廓、投影与经纬网仍来自上述 Natural Earth 数据。中央保持留白，让地图横跨整本护照。
