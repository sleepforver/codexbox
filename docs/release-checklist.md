# 发布检查清单

当前第一版发布名称统一为：

```text
AI 开发工具箱 v0.1.0 Beta
```

该版本按 beta / 公测试用版发布。若要发布稳定版，应先完成自动更新、签名分发、干净环境构建和 Electron E2E 回归。

## 环境

- [ ] Node.js 使用 `22.13+` 或项目明确支持的 LTS 版本。
- [ ] `.nvmrc` 与 `package.json` 的 `engines.node` 保持一致。
- [ ] 发布前使用干净依赖环境执行 `npm.cmd ci`。
- [ ] `.env.example` 包含 SiliconFlow、OpenAI、DeepSeek 和 OpenAI 兼容平台的 API Key / Base URL 示例。
- [ ] `.env` 未提交到仓库。
- [ ] 发布终端允许 Electron、esbuild、electron-builder 子进程执行。

## 功能

- [ ] 项目工作区可新增、编辑、删除和标记最近使用项目。
- [ ] 项目工作区可导入 / 导出项目列表和项目数据包。
- [ ] JSON 工具可格式化、压缩、校验和路径查询。
- [ ] API 测试可发送请求、保存请求、导入 OpenAPI、扫描项目 API。
- [ ] API 请求失败、超时、URL 非法时有明确提示。
- [ ] Git 助手可查看状态、日志、diff、暂存、取消暂存和提交。
- [ ] AI 解释、AI 生成、API AI 分析和 Git AI 输出可写入历史。
- [ ] AI 历史中心可筛选、搜索、收藏、复制、删除、重新执行和转为模板。
- [ ] 设置页可保存模型平台、Base URL、模型、API Key 和超时。
- [ ] 设置页可备份、恢复、清理数据库，并显示数据库状态。
- [ ] 首次启动引导可提示模型配置、默认工作目录、第一个项目和基础工具入口。
- [ ] 首次启动引导可跳过，且不会阻塞非 AI 功能使用。
- [ ] 跳过首次启动引导后，可在设置页重新显示引导。

## 数据

- [ ] 首次启动会自动创建本地 SQLite 数据库。
- [ ] 打包环境数据库写入 Electron `userData/data`，不写入安装目录。
- [ ] schema 版本可在设置页查看。
- [ ] 数据库备份文件可以从 `backups/` 找到。
- [ ] 恢复数据库后提示用户重启应用。
- [ ] `npm.cmd test` 中的数据安全验证覆盖 schema、备份、清理和恢复基础闭环。
- [ ] 导入文件格式无效时不会部分写入。
- [ ] 项目包冲突策略支持覆盖、跳过和另存新项目。

## 验证命令

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run build:site
npm.cmd run verify:electron-smoke
npm.cmd run verify:e2e
npm.cmd run verify:packaged-smoke
npm.cmd run pack
npm.cmd run dist
npm.cmd run verify:release
npm.cmd run verify:update-feed
npm.cmd run release:check
```

全部命令通过后，继续人工验收安装包。

其中 `npm.cmd test` 应包含 `scripts/verify-data-safety.mjs`，用于验证数据维护链路的基础可靠性。
同时应包含 `scripts/verify-e2e-readiness.mjs`，用于确认核心页面入口和 IPC 暴露面未偏离发布范围。

`npm.cmd run verify:electron-smoke` 应在 `npm.cmd run build` 之后执行，用隔离数据目录启动构建后的 Electron 应用，检查核心页面路由、导航和 preload API 后自动退出。

`npm.cmd run verify:e2e` 应在 `npm.cmd run build` 之后执行，通过 Playwright Electron 做真实侧边栏点击、路由跳转、preload API、AI 无 Key 状态、设置页数据维护入口、JSON 表单、临时本地 API 请求、临时 Git 仓库操作和截图产物断言。

`npm.cmd run verify:packaged-smoke` 应在 `npm.cmd run pack` 之后执行，用隔离数据目录启动 `release/win-unpacked/AI 开发工具箱.exe`，确认打包产物可以自动启动并正常退出。

`npm.cmd run verify:update-feed` 应在 `npm.cmd run dist` 之后执行，用于确认 Cloudflare R2 generic feed、`latest.yml`、安装包和 blockmap 元数据可校验。

## 发布包

- [ ] `release/AI 开发工具箱 Setup 0.1.0.exe` 存在。
- [ ] `release/AI 开发工具箱 0.1.0.exe` 存在。
- [ ] `release/AI 开发工具箱 Setup 0.1.0.exe.blockmap` 存在。
- [ ] `release/win-unpacked/AI 开发工具箱.exe` 可启动。
- [ ] `release/release-manifest.json` 存在。
- [ ] 安装版可安装、启动、关闭和卸载。
- [ ] 便携版可启动并正常读写用户数据。
- [ ] 发布包 SHA256 已由 `npm.cmd run verify:release` 记录。
- [ ] 更新 feed 元数据已由 `npm.cmd run verify:update-feed` 校验。
- [ ] Cloudflare R2 下载链接 HEAD 返回 200。

## 官网

- [ ] `site/index.html` 显示 `v0.1.0 Beta`。
- [ ] 下载按钮指向 Cloudflare R2 安装版和便携版。
- [ ] `npm.cmd run build:site` 后生成 `site/dist/index.html`。
- [ ] `npm.cmd run build:site` 后生成渲染后的 `site/dist/manual.html`。
- [ ] Cloudflare Pages 输出目录配置为 `site/dist`。

## 发布说明

- [ ] `docs/release-notes.md` 说明当前版本为 beta。
- [ ] README 说明安装、首次配置、数据维护、打包命令和常见问题。
- [ ] README 说明稳定版前仍需补齐自动更新、签名分发和 E2E。
- [ ] 官网、README、发布说明的版本命名保持一致。
