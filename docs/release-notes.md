# 发布说明

## v0.2.0 项目管理开发快照

当前开发分支已完成第二版项目管理主线的大部分闭环。该快照仍沿用本地优先、单机桌面应用定位，不引入云端账号、多用户协作或自动改写源码。

### 主要变化

- 新增 `项目总览`，聚合项目资料、任务统计、Git 摘要、API 资产和 AI 活动。
- 新增 `项目任务`，支持需求、Bug、优化、重构、文档和发布任务，并可上传任务文件。
- 新增 `Agent工作站`，支持项目级多 Agent 配置，并可把项目目标或任务编排为协同工作流草案。
- 新增 `项目知识库`，支持保存项目结论、AI 输出沉淀、来源追踪和收藏。
- 项目知识库新增项目内统一搜索，结果限定在当前项目，覆盖项目资料、任务、知识条目、AI 历史和 API 请求。
- AI 生成流程支持项目/任务上下文，输出会记录 `projectId`、`taskId`、来源类型和来源引用。
- 新增独立 `代码审查` 页面，支持 unstaged diff、staged diff、指定文件和粘贴内容，并可关联项目任务。
- API 请求集合和响应分析支持任务归属，继续保留 `{{baseUrl}}` 占位符。
- 项目数据包覆盖范围扩展为项目资料、项目任务、项目知识库、AI 历史和 API 请求集合。
- 项目包导入预览显示项目、任务、知识条目、AI 历史、API 请求数量；冲突策略支持覆盖、跳过和另存新项目。

### 验证结果

当前开发快照已通过：

- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd test`
- `npm.cmd run build`

### 后续收口

- README、发布说明和发布检查清单需要随 v0.2.0 能力持续同步。
- 项目包旧版本兼容和导入冲突场景需要在后续 E2E 中加入更细的真实操作覆盖。
- 稳定发布前仍需执行 `pack`、`dist`、站点构建、更新 feed 和打包产物验证。

## v0.1.0 Beta

`v0.1.0 Beta` 是 AI 开发工具箱的第一个公开试用版本。该版本已经具备核心桌面功能闭环，适合开发者在真实项目中试用、反馈问题和验证工作流，但暂不建议作为长期稳定版面向非技术用户分发。

### 版本定位

- 版本名称：`AI 开发工具箱 v0.1.0 Beta`
- 发布阶段：第一版公测 / beta
- 适用对象：愿意反馈问题的开发者、内部团队、早期试用用户
- 不包含承诺：自动更新、大规模数据迁移保障、完整 Electron E2E 回归
- 代码签名：当前暂不申请 exe 签名证书，Windows 可能显示 SmartScreen 或未知发布者提示

### 主要变化

- 设置页支持 SiliconFlow、OpenAI、DeepSeek 和 OpenAI 兼容平台。
- API Key 保存到项目根目录 `.env`，不写入 SQLite。
- API 测试支持 Spring Controller、前端 fetch / axios 和 OpenAPI / Swagger JSON 导入。
- API 扫描结果和导入后的请求集合按分组折叠展示。
- 相对路径接口保存和回显时保留 `{{baseUrl}}`，发送请求时再解析环境变量。
- AI 解释、生成、API 分析和 Git 助手支持项目隔离、历史记录、Markdown 输出和模板选择。
- 项目包支持导入前预览、冲突策略和导入明细。
- 发布验证链路接入 ESLint、Prettier、TypeScript、smoke test、静态验证和 build 输出检查。
- 发布产物校验链路接入 `verify:release`，可检查安装版、便携版、blockmap、未压缩目录版、文件大小和 SHA256。
- 数据安全验证接入 `npm.cmd test`，覆盖 schema、备份、清理和恢复基础闭环。
- GeoJSON 体检模块已从第一版后续稳定版路线中下线，前端入口、IPC 暴露和新 schema 表结构已移除。
- E2E 准备度验证接入 `npm.cmd test`，用于确认核心页面和 IPC 暴露面。
- 新增 Electron 页面级冒烟验证，可在构建后用隔离数据目录启动应用，检查核心页面路由、导航和 preload API 后自动退出。
- 新增 Playwright Electron E2E 验证，可执行真实侧边栏点击、路由跳转、preload API、AI 无 Key 状态、设置页数据维护入口、JSON 表单、临时本地 API 请求、临时 Git 仓库操作和截图产物断言。
- 新增打包产物冒烟验证，可启动 `release/win-unpacked/AI 开发工具箱.exe` 并确认自动退出。
- 新增更新与发布基础链路：electron-builder generic publish 指向 Cloudflare R2，设置页可查看更新源、检查 `latest.yml` 并打开手动下载页兜底。
- 新增 `verify:update-feed`，用于校验发布源配置、`release:check` 串联关系以及已生成的 `latest.yml` / 安装包 / blockmap 元数据。
- 新增首次启动引导横幅，覆盖模型配置、默认工作目录、第一个项目创建和基础工具试用入口，并允许用户跳过或在设置页重新显示。
- Playwright Electron E2E 已加入首次启动引导点击级回归，覆盖展示、跳转、跳过、恢复和截图产物。
- 官网下载入口指向 Cloudflare R2 发布包，并提示未签名安装包风险、文件大小和 SHA256 校验方式。

### 验证结果

最近一次发布审核中确认：

- `npm.cmd install` 通过，漏洞扫描结果为 0。
- `npm.cmd run typecheck` 通过。
- `npm.cmd run lint` 通过。
- `npm.cmd test` 通过。
- `npm.cmd run build` 在允许子进程执行的环境中通过。
- `npm.cmd run build:site` 在允许删除 `site/dist` 的环境中通过。
- `npm.cmd run pack` 通过，并生成 `release/win-unpacked`。
- `npm.cmd run dist` 通过，并生成安装版、便携版和 blockmap。
- `npm.cmd run verify:release` 可生成 `release/release-manifest.json`。
- Cloudflare R2 两个下载链接 HEAD 验证返回 200。

### 已知限制

- 当前 AI 平台调用使用 OpenAI 兼容 Chat Completions 协议；非兼容平台需要后续新增适配器。
- API 自动发现以静态扫描为主，复杂动态路由、运行时拼接 URL 和深度框架约定仍需要人工确认。
- 构建环境若存在安全策略、文件锁或沙箱限制，可能触发 `spawn EPERM`，需要在干净终端或允许子进程执行的环境中运行。
- Playwright Electron E2E 已接入基础页面闭环和关键交互扩展，但尚未覆盖像素级截图比对、真实外部网络 API、真实业务 Git 仓库提交和打包后 exe 的点击级回归。
- 自动更新已具备更新源配置、应用内检查和手动下载兜底入口，但尚未接入静默下载安装、签名证书校验、差分应用和真实 v0.x -> v1.0.0 升级回归。
- 当前发布包暂未代码签名，Windows 可能出现 SmartScreen 或未知发布者提示；用户应从官网入口下载并核对 SHA256。签名证书在预算允许后补齐。
- 首次启动引导已具备基础路径提示和恢复入口，但尚未完成错误 API Key / 断网场景的人工体验回归。

### 稳定版方向

稳定版建议命名为 `AI 开发工具箱 v1.0.0`。进入稳定版前需要完成发布工程硬化、数据迁移测试、Electron E2E、自动更新和首次启动体验优化；签名分发在预算允许后补齐，不作为当前发布链路阻塞项。
