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

当前包含 8 篇生活示例，覆盖“收藏”“出去吃饭”“在家做饭”“户外”“其他”五个栏目。其中有一篇面馆外食记录和一篇番茄炒蛋的具体做饭过程；这些内容用于演示写作形式，不是已核实的餐厅推荐。文章封面使用 `assets/journal-official.jpg`、`assets/woody-official.jpg`、`assets/lucky-official.jpg` 三张官方原版素材。

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

阅读收藏保存在当前浏览器的 `localStorage` 中，刷新后仍会保留。它不会同步到其他设备；清除网站数据或换浏览器后需要重新收藏。博客没有登录、云数据库或提交到服务器的表单。

## UBHC 与布拉吉奥伴宠

站点 Logo 和浏览器图标使用原版 UBHC 盾徽。六个栏目入口、首页角色与文章插图均来自原版素材，没有采用前期被否定的生成图片。来源详见 `public/assets/SOURCES.md`。

左下角布拉吉奥使用官方完整矢量动画，可以点击打招呼、暂停或隐藏；隐藏后可点页头右侧的布拉吉奥重新显示。偏好只保存在当前浏览器，遵循系统减少动态效果设置。伴宠模块在 `pet.js`、`pet.css`，动画与播放器来源、许可见 `public/assets/SOURCES-pet.md` 和 `public/vendor/lottie-LICENSE.txt`。

## 部署到 GitHub Pages

仓库已包含 `.github/workflows/pages.yml`。将**此项目目录的内容**放到 GitHub 仓库根目录，默认分支使用 `main`。在仓库 `Settings → Pages → Build and deployment` 选择 `GitHub Actions`，再推送代码，或手动运行 `Deploy blog to GitHub Pages`。

工作流会使用 Node.js 22 构建，上传 `dist/` 并部署。没有安装依赖的步骤。如果仓库默认分支不是 `main`，把工作流中的分支名称改成实际名称。

资源和数据请求使用相对地址，页面采用 `#/...` 路由，因此可以部署在 `用户名.github.io/`，也可以部署在 `用户名.github.io/仓库名/`。部署到项目子路径时，`url` 也应包含仓库名，例如 `https://用户名.github.io/仓库名/`。

也可以把 `dist/` 的全部内容上传到任意静态网站托管服务。只需要静态文件服务，无需服务器端应用。

## RSS 与预览地址

配置 `content/site.json` 中的 `url` 后，每次构建会生成 `dist/rss.xml`，包含完整正文和指向 `/#/post/文章名` 的链接。若 `url` 为空，则不生成 RSS。

目前 `url` 指向创建时的 Sites 预览地址。该地址处于所有者私有预览状态时，外部读者及 RSS 阅读器可能无法访问；正式公开部署前，请将 `url` 改成最终公开地址并重新构建。RSS 本身是静态 XML，不会收集订阅者信息。

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
