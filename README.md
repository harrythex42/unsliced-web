# Unsliced 网页原型（本地）

浅灰蓝工作台。可以贴入 Markdown 或使用中英文项目周报示例。本页不上传、不统计、不保存文稿；按需中文字体只从同一个网站加载。推荐 Chrome 和 Edge；其他浏览器可以继续，但不保证打印效果。

## 本地打开

在 Unsliced 文件夹的终端运行。前四条是首次准备；如果 `apps/web/dist/` 已经生成，只需要最后两条。

```sh
pnpm install --frozen-lockfile
python3 -m venv apps/web/.venv
apps/web/.venv/bin/python -m pip install -r scripts/requirements.txt
UNSLICED_PYTHON=apps/web/.venv/bin/python pnpm web:build
mkdir -p output/web/manual
python3 -m http.server 4173 --bind 127.0.0.1 --directory apps/web/dist
```

在 **Chrome** 打开 **<http://127.0.0.1:4173/>**。终端先别关；结束后按 `Ctrl+C`。启动后只有本机静态网页，没有处理文稿的服务器。

## 负责人手动检查（只测 Chrome，约 3 分钟）

1. 右上角选「简体中文」。点「试试示例」，等右侧显示页数。打开打印前可以先看一下两页分别从哪里开始。
2. 点「存为 PDF」。在 Chrome 的打印窗口选目标「另存为 PDF」；打开「更多设置」，选 A4、100%，取消「页眉和页脚」。如果有「背景图形」选项，打开后可以保留样例表格的底色。
3. 点「保存」，保存到项目的 **`output/web/manual/`**，保留默认建议文件名「阅读空间项目周报.pdf」。打开 PDF，用 `⌘F` 搜索「周报归档」，选中文字复制回输入框临时核对即可，不需要再打印。

每项只答 **是 / 否**：

| 问题 | 正常应该看到什么 |
| --- | --- |
| 示例能自动生成预览吗？ | 不需要额外点「排版」，右侧出现页数和示例页面。 |
| 默认建议文件名有意义吗？ | 显示「阅读空间项目周报」，不是 `Unsliced`。 |
| PDF 和网页的页数、每页开头一样吗？ | 没有多一页，PDF 每页开头的标题或正文在网页的同一页。 |
| 没有空白页、日期、网址或网页按钮吗？ | PDF 只有原稿正文，页边没有浏览器附加的文字。 |
| 可以搜索并准确复制中文吗？ | 搜得到「周报归档」，复制出来还是这四个字。 |

## 自动验收与输出

首次运行需要已安装本项目依赖及 Python 工具，如上。自动脚本模拟 Chromium 打印，不经过真实的打印窗口。

```sh
pnpm exec playwright install chromium
UNSLICED_PYTHON=apps/web/.venv/bin/python pnpm acceptance
```

- 网页输出：[结果表](../../output/web/report.md) · [按页并排对照](../../output/web/comparison.html) · [中文截图](../../output/web/interface-zh.png) · [英文截图](../../output/web/interface-en.png)。
- 正式静态文件在 `apps/web/dist/`，原样复制整目录即可在网站子路径提供服务。GitHub Actions 的部署配置在 `.github/workflows/pages.yml`。
- BreakFlow 的 MIT 声明和字体 OFL 许可证随构建复制。没有更改核心、浏览器分页包或 MCP 包。
