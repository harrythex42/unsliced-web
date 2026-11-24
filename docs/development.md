# 网页版开发与发布

网页版只维护浏览器界面。分页程序、MCP 的 Markdown 处理方式和中文字体都来自 [Unsliced 主项目](https://github.com/harrythex42/Unsliced)。`upstream.json` 记录了使用的主项目完整提交号。构建会到 GitHub 下载这个版本，放进本项目忽略的 `.upstream/`；不需要本机有主项目，也不会随着主项目发布自动更新。网站访客不需要连接主项目来排版。

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

1. 在主项目先完成验收并推送，选定要采用的完整提交号。
2. 在本项目修改 `upstream.json`，把提交号换成选定版本。重新构建会下载该版本，不需复制或修改分页源码。
3. 跑本项目的 `pnpm acceptance`；看差异报告和逐页图片，必要时用 Chrome 手动打印。确认无误后，单独提交并推送到 `main`。只有这一步会部署新版本。

## 上线后

`pnpm test:live` 在 Chromium 检查正式网址，把结果和逐页图片放到 `output/web-live/`。真实打印对话框另按 [Chrome 一分钟清单](web-live-check.md)复查。
