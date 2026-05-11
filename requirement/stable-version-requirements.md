# AI 开发工具箱稳定版需求文档

## 1. 文档信息

- 文档名称：AI 开发工具箱稳定版需求文档
- 目标版本：v1.0.0
- 当前基础版本：v0.1.0 Beta
- 文档状态：草案
- 维护目录：`requirement/`

## 2. 背景

当前 `v0.1.0 Beta` 已经具备项目工作区、API 测试、Git 助手、AI 代码工作流、AI 历史中心、本地 SQLite 存储和 Cloudflare Pages 官网下载入口。

但该版本仍按 beta / 公测版定位，尚未具备长期稳定版所需的发布可复现性、自动更新、签名分发、完整 E2E 回归、首次启动引导和大规模数据迁移验证能力。

后续所有稳定版相关方案统一放入 `requirement/` 目录，便于后期整合为完整需求基线。

## 3. 目标

稳定版目标命名：

```text
AI 开发工具箱 v1.0.0
```

稳定版需要达到以下目标：

- 发布过程可复现、可验证、可回滚。
- 用户数据长期稳定，升级和迁移风险可控。
- 关键页面和核心流程具备自动化回归能力。
- 应用具备可信分发和自动更新基础能力。
- 新用户可以独立完成安装、首次配置和基础使用。

## 4. 范围

### 4.1 范围内

- 发布工程硬化。
- 数据安全与迁移验证。
- Electron E2E 测试。
- 自动更新与可信分发。
- 首次启动体验和文档拆分。
- 官网下载与校验信息完善。

### 4.2 范围外

- 非 Windows 平台发布。
- 多用户协作云端同步。
- 内置模型服务。
- 企业级权限体系。

## 5. 需求列表

### R1 发布工程硬化

需求描述：

稳定版发布必须在干净环境中可重复构建，并能核对发布产物一致性。

功能要求：

- 固定 Node.js、npm、Electron 和 electron-builder 推荐版本。
- 发布构建入口统一使用 `npm.cmd ci && npm.cmd run dist`。
- 增加发布产物校验脚本，检查安装包、便携包、blockmap、未压缩目录版、文件大小和 SHA256。
- 记录 Cloudflare R2 上传后的对象地址、文件大小和 SHA256。
- 为 `release/` 产物建立版本化目录或稳定命名规则。

当前实现状态：

- 已新增 `.nvmrc` 和 `package.json` `engines`，固定 Node.js 推荐版本为 `22.13.0`。
- 已新增 `scripts/verify-release-artifacts.mjs`，用于检查发布产物并生成 `release/release-manifest.json`。
- 已新增 `npm.cmd run verify:release` 和 `npm.cmd run release:check`。

验收标准：

- 在干净 Windows 发布机上可重复生成安装版、便携版和 blockmap。
- 本地文件和 R2 对象的 SHA256 可核对。
- 发布清单中能追踪构建命令、产物路径、上传地址和校验值。

优先级：高

### R2 数据安全与迁移验证

需求描述：

稳定版必须保证本地数据在长期使用、升级、备份和恢复过程中可靠。

功能要求：

- 增加 SQLite schema 迁移自动测试。
- 增加数据库备份、恢复、清理、导入、导出的自动化测试。
- 对 `.env` 写入失败、数据库写入失败、文件被占用等场景提供清晰错误提示。
- 增加诊断导出能力，至少包含数据库路径、schema 版本、应用版本、平台信息和最近错误。

当前实现状态：

- 已新增 `scripts/verify-data-safety.mjs`，用于校验当前 schema 版本、迁移链路入口、默认数据初始化入口和旧 JSON 数据迁移入口。
- 已覆盖 SQLite 初始化表结构、关键字段、数据库备份文件生成、清理可变数据、保留内置 Prompt 模板、从备份恢复后读取数据等基础场景。
- 已新增 schema v8 迁移，用于移除已下线的 GeoJSON 体检历史表。
- 已接入 `npm.cmd test`，与 smoke test 和 Phase 3 静态验证一起执行。
- 已新增设置页诊断导出能力，导出的 JSON 包含数据库路径、schema 版本、应用版本、平台信息、AI 设置摘要和最近 IPC 错误。
- 已补充 `.env` 写入失败、数据库备份 / 恢复文件异常、导入 / 导出异常的清晰错误提示，并将导出类异常纳入最近 IPC 错误诊断链路。
- 暂未覆盖真实 Windows 文件锁、杀毒软件拦截和权限受限目录下的人工回归，这些需要在发布机环境中继续验证。

验收标准：

- 旧 schema 到当前 schema 的迁移可重复验证。
- 备份文件可恢复，并能在重启后读取恢复数据。
- 文件权限异常不会造成静默失败。

优先级：高

### R3 Electron E2E 回归

需求描述：

稳定版需要把关键页面闭环从人工验证升级为自动化验证。

功能要求：

- 接入 Playwright Electron 或同类 E2E 测试方案。
- 覆盖项目工作区、API 测试、Git 助手、AI 无 Key 状态和设置页。
- 增加前端路由、侧边栏导航和 IPC 暴露面的自动化准备度检查。
- 增加打包后 `release/win-unpacked/AI 开发工具箱.exe` 的启动冒烟测试。
- E2E 测试数据应隔离，不能污染用户真实数据。

验收标准：

- 发版前可自动确认主要页面可打开。
- 关键按钮状态和错误状态可被测试断言。
- 打包产物可被自动启动并正常退出。

当前实现状态：

- 已新增 `scripts/verify-e2e-readiness.mjs`，用于校验核心页面路由、侧边栏入口、关键页面源码入口和 IPC 暴露面。
- 已新增 `scripts/verify-electron-smoke.mjs`，用于启动构建后的 Electron 应用，使用隔离 userData、隐藏窗口，检查核心页面路由、导航和 preload API 后自动退出。
- 已接入 `npm.cmd test`，作为正式 Electron E2E 接入前的准备度检查。
- 已接入 `playwright-core` 和 `scripts/verify-playwright-electron.mjs`，可通过 `npm.cmd run verify:e2e` 启动构建后的 Electron 应用，使用隔离 userData 执行真实侧边栏点击、路由跳转、preload API、AI 无 Key 状态和设置页数据维护入口断言。
- 已新增 `scripts/verify-packaged-smoke.mjs` 和 `npm.cmd run verify:packaged-smoke`，用于启动 `release/win-unpacked/AI 开发工具箱.exe`，使用隔离 userData 执行打包产物页面冒烟并自动退出。
- 已扩展 `npm.cmd run verify:e2e`，覆盖截图产物生成、JSON 复杂表单输入和路径查询、本地 HTTP 服务真实 API 请求、临时 Git 仓库 status / file diff / 暂存操作。
- 暂未覆盖像素级截图比对、真实外部网络 API、真实业务 Git 仓库提交和打包后 exe 的 Playwright 点击级回归，这些仍可作为后续稳定版增强项。

优先级：高

### R4 自动更新与可信分发

需求描述：

稳定版应具备应用内更新能力，并降低 Windows 下载和安装时的信任风险。

功能要求：

- 评估并接入 `electron-updater` 或明确的自研更新方案。
- 配置 electron-builder `publish`。
- 明确更新源使用 GitHub Release、Cloudflare R2 或自建 feed。
- 处理签名证书、更新校验、失败回滚和更新说明展示。
- 增加更新失败后的手动下载兜底入口。

验收标准：

- v0.x 到 v1.0.0 的升级流程可在测试环境跑通。
- 更新包校验失败时不会安装。
- 更新失败后用户能看到明确提示和手动下载入口。

当前实现状态：

- 已配置 electron-builder `publish` 为 Cloudflare R2 generic feed，发布源统一指向当前 R2 下载域名。
- 已新增 `electron/main/services/updateInfo.ts` 和 `registerUpdateIpc.ts`，提供更新源信息读取、`latest.yml` 检查和手动下载页兜底入口。
- 已在设置页新增“更新与发布”入口，用户可以查看当前版本、更新 feed、执行检查更新，并在失败或发现新版本时打开官网手动下载页。
- 已新增 `scripts/verify-update-feed.mjs` 和 `npm.cmd run verify:update-feed`，校验发布源配置、`release:check` 链路和已生成的 `latest.yml` / 安装包 / blockmap 元数据。
- 当前仍未接入静默下载安装、差分自动应用、签名证书校验和真实 v0.x -> v1.0.0 升级回归；这些需要在签名证书和稳定版发布 feed 就绪后继续验证。

优先级：高

### R5 首次启动体验

需求描述：

稳定版需要让新用户独立完成安装、模型配置、项目创建和基础使用。

功能要求：

- 增加首次启动引导。
- 引导用户完成模型平台选择、API Key 配置、默认工作目录设置和第一个项目创建。
- 无 API Key、错误 API Key、断网时给出明确说明。
- 提供跳过引导的选项。

验收标准：

- 新用户首次启动后能在 5 分钟内完成基础配置。
- 跳过引导后仍能在设置页重新找到相关配置入口。
- 首次启动不会因为 AI 配置缺失阻断非 AI 功能使用。

当前实现状态：

- 已在主界面新增首次启动引导横幅，默认在模型 API Key、默认工作目录或项目工作区未完成时显示。
- 引导覆盖模型平台配置、默认工作目录、第一个项目创建和基础工具试用，并提供跳转到设置页、项目工作区和 API 测试页的快捷入口。
- 引导为非阻塞式设计，用户可继续使用 JSON、API、Git 和项目工作区等非 AI 功能；跳过状态保存在本地 `localStorage`。
- 已在设置页提供“重新显示首次引导”入口，跳过后可以恢复引导横幅。
- 已将引导存在性、跳过入口和关键步骤纳入 `scripts/verify-e2e-readiness.mjs` 静态验证。
- 当前仍未覆盖真实错误 API Key / 断网的人工体验回归；这些可在下一轮 R5 增强中继续补齐。

优先级：中

### R6 文档与官网完善

需求描述：

稳定版需要把用户手册、开发文档、发布文档和需求文档分层维护。

功能要求：

- README 保持为用户操作手册。
- 稳定版、路线图、后续需求统一放入 `requirement/`。
- 发布说明继续放在 `docs/release-notes.md`。
- 发布检查清单继续放在 `docs/release-checklist.md`。
- 官网增加系统要求、文件大小、SHA256、Beta/Stable 状态和更新策略说明。

验收标准：

- 用户能从 README 完成安装和基础使用。
- 开发者能从 `requirement/` 找到后续需求来源。
- 官网下载信息与实际发布包一致。

优先级：中

## 6. 里程碑建议

### M1 发布工程与文档基线

- 完成 R1 的构建环境固定和产物校验。
- 完成 R6 的文档分层。

### M2 数据可靠性

- 完成 R2 的迁移、备份、恢复和异常测试。

### M3 自动化回归

- 完成 R3 的 Electron E2E 基础覆盖。

### M4 更新与分发

- 完成 R4 的自动更新和可信分发验证。

### M5 稳定版发布候选

- 完成 R5 的首次启动体验。
- 执行完整发布验收。
- 产出 v1.0.0 Release Candidate。

## 7. 后续整合规则

- 每个新增需求应在 `requirement/` 下创建独立 Markdown 文件。
- 文件名建议使用 `领域-需求名称.md`，例如 `release-artifact-verification.md`。
- 每份需求文档至少包含背景、目标、范围、需求列表和验收标准。
- 后期可将多个需求文档整合为 `requirement/index.md` 或正式 PRD。
