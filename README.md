# 慢慢来 · SLOW NOTES

一本记录收藏、出去吃饭、在家做饭、户外、其他生活碎片，以及小黑猫金子日常的小博客。六个栏目分别由布拉吉奥、迪波罗、安基罗、史铁哥、崔卡拉和伍迪陪伴。原生 HTML、CSS、JavaScript，使用 Node.js 原生脚本构建，不用安装 npm 包。动画使用已随项目打包的 Lottie 播放器。

当前文章、作者信息、随记和生活收藏都是**可替换的示例内容**，用于展示页面与交互。使用前请替换成自己的故事。站点是个人博客创作示例，不是 JOGUMAN 官方网站。

角色图像使用 [JOGUMAN 官方网站](https://en.joguman.com/) 的原版素材，角色与图像权利归 JOGUMAN 及相应权利人所有，页面保留来源署名。本项目仅制作个人博客主题，不代表官方合作或授权。

## 本地运行

安装 Node.js 20 或更新版本，在项目目录运行：

```sh
npm run dev
```

打开 `http://127.0.0.1:4173`。开发服务会在内容、页面或资源保存后重新构建，刷新浏览器即可看到变化。若端口被占用：

```sh
npm run dev -- --port 4174
```

也可以直接使用 `node scripts/server.mjs --watch --port 4173`，整个项目不要求 npm install。

```sh
npm run build   # 将静态页面、资源与文章数据写入 dist/
npm run preview # 先构建，再在本地预览 dist/
npm run check   # 检查 JavaScript 语法，并构建验证文章配置
```

请通过本地服务打开页面；直接双击 HTML 文件会受浏览器本地文件读取限制。

## 写一篇文章

在 `content/posts/` 新建一个 Markdown 文件，例如 `my-first-day.md`。文件名会成为文章地址 `#/post/my-first-day`，只使用小写英文字母、数字和短横线。

```md
---
title: 今天的小小发现
date: 2026-10-23
category: 其他
tags: ["散步", "生活观察"]
excerpt: 一小段用于首页与文章列表的介绍。
cover: assets/journal-official.jpg
readingTime: 3 分钟
---

这里是文章开头。

## 一段小标题

正文支持 **加粗**、*斜体*、`行内代码` 和 [普通链接](https://example.com)。

> 也可以写一句想记住的话。

- 一个小发现
- 另一个小发现
```

`tags` 使用 JSON 字符串数组；`title` 等文本可以直接填写，也可以使用 JSON 双引号。每个字段占一行，不支持 YAML 的多行缩进语法。`readingTime` 可以省略，构建时会估算阅读时长。

`category` 请填写以下六个栏目之一，与 `content/site.json` 中的 `categories` 保持一致：

| 栏目 | 角色 | 英文名 | 角色图片 |
| --- | --- | --- | --- |
| 收藏 | 布拉吉奥 | BRACHIO | `assets/brachio.png` |
| 出去吃饭 | 迪波罗 | DIPLO | `assets/diplo.png` |
| 在家做饭 | 安基罗 | ANKYLO | `assets/ankylo.png` |
| 户外 | 史铁哥 | STEGO | `assets/stego.png` |
| 其他 | 崔卡拉 | TRICERA | `assets/tricera.png` |
| 金子 | 伍迪 | WOODY | `assets/woody.png` |

当前包含 8 篇生活示例，覆盖“收藏”“出去吃饭”“在家做饭”“户外”“其他”五个栏目。其中有一篇面馆外食记录和一篇番茄炒蛋的具体做饭过程；这些内容用于演示写作形式，不是已核实的餐厅推荐。示例封面自动适配栏目角色，真实上传的封面仍使用原照片；`sceneAsset` 用于大幅栏目插画，`asset` 保留用于导航的小角色图。

“金子”记录的是真实的小黑猫，目前保留空栏目，之后再添加金子的真实文章与照片。伍迪是这个栏目的陪伴角色，角色素材不作为金子的照片。现有内容没有为金子编写虚构经历或性格设定。

正文支持标题、段落、简单列表、引用、分隔线、代码块和图片。为保持内容安全，原始 HTML 会显示为普通文本，脚本链接不会被渲染为可点击链接。暂不支持表格、嵌入组件与完整 Markdown 插件语法。封面图片放进 `public/assets/`，文章中填写 `assets/文件名.png`。构建会检查文章分类是否已配置、封面文件是否存在，并在报错中指出需要修改的文章。

### 添加金子的真实照片

把自己拍摄的金子照片放进 `public/assets/`，也可以创建 `public/assets/jinzi/` 子文件夹。例如放入 `public/assets/jinzi/photo.jpg` 后，在真实记录的 Markdown 正文里写：

```md
![根据这张真实照片填写说明](assets/jinzi/photo.jpg)
```

图片语法既可以独占一行，也可以放在正文中间，图片会使用懒加载。引用地址从 `assets/` 开始，不需要写 `public/`；文件名可以用中文，尽量避免空格。也可以引用完整的 `https://` 图片地址；`http://`、`data:`、脚本地址和 `assets/` 以外的相对路径不会渲染为图片。

示例中的文件名只是写法说明，项目没有添加或生成金子的照片。准备好真实照片与记录后，将文章的 `category` 设为 `金子`，再构建即可显示在对应栏目。

文章按日期从新到旧排序。构建后全部文章位于 `dist/data/posts.json`，每条包括 `slug`、`title`、`date`、`category`、`tags`、`excerpt`、`readingTime`、`cover` 和已经安全渲染的 `body`。

## 改成你自己的博客

编辑 `content/site.json`：

- `name`、`englishName`：博客名称。
- `author`、`description`、`bio`、`location`：作者与博客介绍。
- `currentNote`：最近的生活状态。
- `categories`：六个生活栏目，每项包含 `name`、`character`、`englishName`、`asset`、`description`，分别设置栏目名、角色中文名、英文名、原版角色图片与简短介绍。
- `sampleNotice`：示例内容说明；替换完全部示例后可以改成自己的说明。
- `collections`：作为“收藏”栏目的补充生活清单，每项包含 `id`、`title`、`kind`、`note`、`color`。
- `notes`：随记，每项包含 `id`、`date`、`text`。
- `url`：站点完整地址，供 RSS 使用；部署到其他地址后需要同步修改。

页面和样式分别是项目根目录的 `index.html`、`app.js`、`styles.css`。`public/` 内的文件会原样复制到 `dist/` 根目录，不要在引用地址里添加 `public/`。

阅读收藏保存在当前浏览器的 `localStorage` 中，刷新后仍会保留。它不会同步到其他设备；清除网站数据或换浏览器后需要重新收藏。公开博客不要求登录；下面的独立文章编辑室需要管理员登录，草稿保存在路由器专属的私人目录。

## BR-T320 局域网部署与文章编辑室

默认部署目标为局域网 BR-T320，独立站点 ID 为 `slow-notes`。已按项目外的交接文档和参考源码适配，保留现有六个栏目。域名暂定 `slow-notes.home.arpa` 与 `slow-notes.home.arpa.admin`；端口、域名、挂载 UUID、运行账号和证书路径必须在实际路由器核对后填写。**本地适配完成不代表路由器已经部署或网络隔离已验收。**

文章编辑室支持登录、写作与预览、保存草稿、历史版本、回收站、图片上传、私人相册、冻结候选、部署/下架和上一版本回滚。保存草稿不会改变博客；部署只应用明确选中的冻结版本。正文/封面上传不自动加入相册，移出相册不会删除文章引用的原图。

程序仍由电脑构建。路由器使用 Python CMS 读取不可变来源快照和当前部署内容，无需 Node.js，也不读取旧博客的 Git 仓库。GitHub 发布在此 CMS 中被禁用。私人数据库、会话、媒体、配置与主站隔离；不要上传私人后台到公开仓库。

运行基本检查（没有 npm 时直接运行这些 Node 命令）：

```sh
node scripts/check.mjs
node scripts/check-runtime.mjs
python -m pip install -r cms/requirements-dev.txt
python -m pytest cms/tests -q
python -m unittest discover -s deploy/br-t320 -p "test_*.py"
```

审查并提交本机改动后，在**仓库外不存在的新目录**构建正式候选包，例如 Windows：

```powershell
node scripts/build-router.mjs --output ..\slow-notes-release-001 --url https://slow-notes.home.arpa/
```

输出目录含 `program/`、`source/`、`app/`、`editor/` 和 `release.json`，旁边生成 `.tar.gz` 和 SHA-256 校验文件。每个文件均记录哈希；不覆盖上一版本。程序只读取 CMS 当前目录，不携带可能残留已下架文章的 `data/posts.json` 或静态 RSS。静态网站构建方式仍保留。

工作区尚有改动时，可加 `--allow-dirty` 生成**仅本地验证包**。该包标记 `deployable:false`，路由器工具会拒绝部署。初始化管理员时密码仅通过交互输入，不放到命令行或源码中：

```powershell
python -m cms.cli init --data ..\slow-notes-local-private
python -m cms.cli serve --data ..\slow-notes-local-private --source ..\slow-notes-release-001\source --program ..\slow-notes-release-001\program --editor ..\slow-notes-release-001\editor --port 8788
```

打开 `http://127.0.0.1:8788/admin/` 登录，点「导入本机基线文章」即可编辑已有文章。本地服务只监听 loopback。部署工具、文件布局、LuCI 登记、挂载检查、安装顺序及回滚见 [BR-T320 部署说明](deploy/br-t320/README.md)。DNS、CA 签发、SSH 授权和防火墙必须先给出实际变更范围，不能套用旧站脚本。

## UBHC 与布拉吉奥伴宠

站点 Logo、护照和浏览器图标统一使用 UBHC 盾徽透明版，原始白底图也保留。透明版经过 ImageGen 去背景处理，属于网页派生文件，并非官方透明母版，详见 `public/assets/UBHC-SOURCE.md`。栏目和背景角色保留官方原画；外食用举杯迪波罗，做饭用戴厨师帽安基罗，户外使用官网史铁哥站姿。来源见 `public/assets/roles/SOURCES.md`。

左下角布拉吉奥使用官方完整矢量动画，眼睛跟随鼠标，可拖动、点击打招呼、暂停或隐藏，带进出场动画；隐藏后可从页头或手机「更多」重新召唤。位置归一化保存在本机，方向键也能移动，Home 归位，Esc 收起。偏好只保存在当前浏览器，遵循系统减少动态效果设置。伴宠模块在 `pet.js`、`pet.css`，动画与播放器来源、许可见 `public/assets/SOURCES-pet.md` 和 `public/vendor/lottie-LICENSE.txt`。

## 天气场景与生活护照

首页根据所选城市天气、当地日出日落及南北半球季节组合官方云朵、植物、角色和季节插画；雨雪、雾、落叶与环境配色由本站制作，不是官方完整气象壁纸。可在天气面板选择「跟随日夜」恢复自动模式。来源与映射见 `public/assets/scenery/SOURCES-scene.md`。

护照包含封面、作者页、六栏目生活印章、随记与户外手记、封底，支持目录、按钮、左右方向键和触屏横向滑动。示例信息来自 `content/site.json`。

## 部署到 GitHub Pages

已按本次要求配置公开仓库 [BurgerQueen-xxy/Blog](https://github.com/BurgerQueen-xxy/Blog)。网站地址为 https://burgerqueen-xxy.github.io/Blog/ 。`.github/workflows/pages.yml` 在每次推送 `main` 时自动检查、构建和部署，也支持手动运行。

Pages 工作流使用 Node.js 22，只上传静态构建产物 `dist/`。CMS 是独立的可选局域网后端，GitHub Pages 不运行它。数据库、账号密码、会话与本机配置不属于发布内容；它们已被 Git 忽略。

资源和数据请求使用相对地址，页面采用 `#/...` 路由，因此可以部署在 `用户名.github.io/`，也可以部署在 `用户名.github.io/仓库名/`。部署到项目子路径时，`url` 也应包含仓库名，例如 `https://用户名.github.io/仓库名/`。

也可以把 `dist/` 的全部内容上传到任意静态网站托管服务。只需要静态文件服务，无需服务器端应用。

## RSS 与预览地址

配置 `content/site.json` 中的 `url` 后，静态构建会生成 `dist/rss.xml`，包含完整正文和指向 `/#/post/文章名` 的链接。若 `url` 为空，则不生成 RSS。路由器 runtime 包暂不提供 RSS，避免继续暴露已下架的静态文章内容。

目前 `url` 已指向 GitHub Pages 的正式项目子路径。RSS 本身是静态 XML，不会收集订阅者信息。

## 项目结构

```text
content/
  posts/              Markdown 文章
  site.json           博客配置、随记与生活收藏
public/
  assets/             图片与其他静态资源
scripts/
  build.mjs           无依赖静态构建
  markdown.mjs        frontmatter 解析与安全 Markdown 渲染
  server.mjs          本地服务与开发构建监听
  check.mjs           语法、安全渲染与构建检查
.github/workflows/
  pages.yml           GitHub Pages 部署
index.html
app.js
styles.css
dist/                 构建产物，不提交到仓库
```
