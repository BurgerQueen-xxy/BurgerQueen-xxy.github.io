# 博客字体

全站采用「小赖字体 / Xiaolai」v3.126 比例版。导航、标题、正文、天气、日历、播放器及角色气泡共用圆润的手写字体；护照机读码和日期印章保留等宽字形。

- 项目：https://github.com/lxgw/kose-font
- 固定版本：https://github.com/lxgw/kose-font/releases/tag/v3.126
- 原始文件：https://github.com/lxgw/kose-font/releases/download/v3.126/Xiaolai-Regular.ttf
- Copyright 2020–2024 LXGW; Copyright 2014 Nozomi Seto。
- 许可证：SIL Open Font License 1.1，完整文本见 `xiaolai-OFL.txt`。
- 本地文件：`fonts/xiaolai-common.woff2`、`fonts/xiaolai-extended.woff2`、`fonts/xiaolai.css`。

字体随网站部署，不调用第三方字体 CDN。字形未经重绘；通过 FontTools 转为 WOFF2，并拆成常用字与扩展字两个互斥子集。常用子集覆盖 GB2312、拉丁字母及常用标点；简繁体生僻字、日韩文字按 CSS `unicode-range` 按需加载。彩色 emoji 交由系统字体显示。新增文章不需要重新裁剪字体。

重新生成：安装 `fonttools[woff]`，从上述固定版本下载原始 TTF，运行 `python scripts/prepare-font.py /path/to/Xiaolai-Regular.ttf`。字体许可、版权、名称元数据保留于子集内。

原有 `wenkai.woff2` 与 `wenkai-OFL.txt` 保留作历史素材，当前页面不再加载。
