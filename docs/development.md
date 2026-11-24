# 网页版开发与发布

网页版直接从 [Unsliced Core 发布页](https://github.com/harrythex42/unsliced-core/releases)下载固定版本的分页包和字体。`upstream.json` 记录版本标签、完整源码版本号和压缩包校验值。构建先核对压缩包，再核对源码版本号和每个文件；不依赖 MCP，不会自动升级。Markdown 转换和验收辅助代码由本站维护；访客仍然只从本站下载所需文件。

## 独立构建和验收

准备 Node.js 22 或更新版本、pnpm 12.3.4、Python 和 `tar`。以下命令从本项目目录执行；将 `python3` 换为本机可用的 Python 命令。

```sh
pnpm install --frozen-lockfile
python3 -m venv .venv
.venv/bin/python -m pip install -r scripts/requirements.txt
pnpm browser:install
UNSLICED_PYTHON=.venv/bin/python pnpm acceptance
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

用 Chrome 打开 <http://127.0.0.1:4173/>。只需构建时把 `pnpm acceptance` 换成 `pnpm build`。如在 Linux 缺少 Chromium 系统依赖，先安装 Playwright 提示的依赖。验收结果、逐页图片和中英文界面截图放在 `output/web/`。

## Core 升级分页后，网页版怎么跟上

1. 在 Core 发布页选一个已经验收的版本。不必发布新的 npm 版本。
2. 在 `upstream.json` 中填写版本标签（`tag`）、完整源码版本号（`commit`）和压缩包的校验值（`sha256`）。如果清单中的 Playwright 版本变了，也要更新本项目对应的依赖。
3. 跑本项目的 `pnpm acceptance`；看差异报告和逐页图片，必要时用 Chrome 手动打印。确认无误后，单独提交并推送到 `main`。只有这一步会部署新版本。

## 上线后

`pnpm test:live` 在 Chromium 检查正式网址，把结果和逐页图片放到 `output/web-live/`。真实打印对话框另按 [Chrome 一分钟清单](web-live-check.md)复查。
