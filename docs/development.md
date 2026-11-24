# 网页版开发与发布

网页版只维护浏览器界面。分页源码在 [Unsliced 核心仓库](https://github.com/harrythex42/Unsliced)。构建从公开的 [unsliced-mcp 仓库](https://github.com/harrythex42/unsliced-mcp) 取指定提交中的分页产物、字体和 Markdown 处理代码，并核对产物的核心版本及文件内容。`upstream.json` 记录两个完整提交号。构建无需访问核心源码仓库，也不会随着其他项目推送自动升级；访客仍然只从本站下载文件。

## 独立构建和验收

准备 Git、Node.js 22 或更新版本、pnpm 12.3.4 和 Python。以下命令从本项目目录执行；将 `python3` 换为本机可用的 Python 命令。

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r scripts/requirements.txt
pnpm browser:install
UNSLICED_PYTHON=.venv/bin/python pnpm acceptance
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

用 Chrome 打开 <http://127.0.0.1:4173/>。只需构建时把 `pnpm acceptance` 换成 `pnpm build`。如在 Linux 缺少 Chromium 系统依赖，先安装 Playwright 提示的依赖。验收结果、逐页图片和中英文界面截图放在 `output/web/`。

## 主项目升级分页后，网页版怎么跟上

1. 在核心仓库选好已验收的提交。按 [MCP 的开发说明](https://github.com/harrythex42/unsliced-mcp/blob/main/docs/development.md#更新分页程序) 导出并提交该版本的公开构建产物。不必发布新的 npm 版本。
2. 在本项目修改 `upstream.json`：`artifactCommit` 填公开产物的提交号，`coreCommit` 填对应的核心提交号。重新构建会下载并核对该版本，不需修改分页源码。
3. 跑本项目的 `pnpm acceptance`；看差异报告和逐页图片，必要时用 Chrome 手动打印。确认无误后，单独提交并推送到 `main`。只有这一步会部署新版本。

## 上线后

`pnpm test:live` 在 Chromium 检查正式网址，把结果和逐页图片放到 `output/web-live/`。真实打印对话框另按 [Chrome 一分钟清单](web-live-check.md)复查。
