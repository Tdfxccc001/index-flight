# 指数飞行 · Index Flight

Vite + TypeScript + Three.js 纯前端飞行游戏。无需账号或后端。
WASD / 方向键控制；鼠标或触屏按住拖动。Esc 暂停。

在线游玩：https://tdfxccc001.github.io/index-flight/

## 本地开发与验证

Node.js 24，pnpm 11.25.0：

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:pages
pnpm preview
```

## GitHub Pages

仓库 Settings → Pages → Source 选择 GitHub Actions。
推送 main 自动测试、构建并发布；Actions 中也可手动运行。
拉取请求只测试构建，没有 Pages 发布权限。
默认网址为 https://<owner>.github.io/<repository>/ 。无需购买域名或服务器。
以后在此发布仓库中修改代码并推送 main，网站会在检查通过后自动更新。
本地原开发仓库独立保留；在原目录修改不会自动同步到本仓库。
所有字体、行情 JSON、脚本均随站点提供；首次完整加载后支持离线。
高分与设置仅保存在当前浏览器。

## 发布来源与数据

此仓库为脱敏发布快照；原始开发仓库及历史保留在本地。
未包含竞赛目录扫描报告、私人文件清单、原始抓取响应或测试产物。
原有玩法、UI 和行情数据保持不变；字体许可证见 public/fonts/。
行情数据来源及授权限制见 docs/DATA_SOURCES.md；公开可读取不等于已获再分发授权。
