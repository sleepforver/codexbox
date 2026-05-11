# AI 开发工具箱操作手册

`AI 开发工具箱` 是一款面向本地软件开发工作的 Windows 桌面应用，基于 Electron、Vue、TypeScript 和 SQLite 构建。它把项目工作区、JSON 处理、API 调试、Git 辅助、AI 代码解释、AI 代码生成、AI 历史复用和本地数据维护整合到一个本地优先的开发工作台中。

当前公开版本命名为 **v0.1.0 Beta**。这个版本适合作为第一版公测版试用，不建议按长期稳定版分发给非技术用户。

## 目录

- [版本定位](#版本定位)
- [安装与启动](#安装与启动)
- [首次配置](#首次配置)
- [界面导航](#界面导航)
- [项目工作区](#项目工作区)
- [JSON 工具](#json-工具)
- [API 测试](#api-测试)
- [Git 助手](#git-助手)
- [AI 代码工作流](#ai-代码工作流)
- [AI 历史中心](#ai-历史中心)
- [设置与数据维护](#设置与数据维护)
- [开发与发布命令](#开发与发布命令)
- [发布前检查清单](#发布前检查清单)
- [常见问题](#常见问题)

## 版本定位

### v0.1.0 Beta

第一版命名建议使用：

```text
AI 开发工具箱 v0.1.0 Beta
```

定位说明：

- 面向早期试用、功能验证和真实开发场景反馈。
- 核心模块已经形成基础闭环，但仍缺少完整的 Electron E2E 回归、正式自动更新、稳定版签名发布和大规模用户数据迁移验证。
- 下载安装包后建议先在测试项目或非关键仓库中试用。

不建议使用的命名：

- `v1.0.0`：稳定性、自动更新和签名分发条件还不够。
- `正式版`：当前更适合 beta / 公测版定位。
- `内测版`：官网和 R2 下载已经具备公开试用入口，内测语义偏保守。

## 安装与启动

### 使用发布包

当前 Windows 发布包包括安装版和便携版：

```text
release/AI 开发工具箱 Setup 0.1.0.exe
release/AI 开发工具箱 0.1.0.exe
release/win-unpacked/AI 开发工具箱.exe
```

- `AI 开发工具箱 Setup 0.1.0.exe`：安装版，适合长期试用。
- `AI 开发工具箱 0.1.0.exe`：便携版，适合快速启动和临时验证。
- `release/win-unpacked/AI 开发工具箱.exe`：未压缩目录版，适合发布前检查。

官网首页的下载按钮指向 Cloudflare R2 公网文件。点击后会直接下载对应的 Windows 安装文件。

### 从源码启动

建议使用 Node.js `22.13+` 或项目依赖明确支持的 LTS 版本。Windows PowerShell 下建议使用 `npm.cmd`：

```powershell
npm.cmd install
npm.cmd run dev
```

如果本机 Electron 或 esbuild 子进程被安全策略拦截，构建或启动可能出现 `spawn EPERM`。请在无文件锁、允许子进程执行的终端环境中重试。

## 首次配置

AI 功能需要配置至少一个兼容 OpenAI Chat Completions 协议的模型平台。可以使用 `.env` 文件，也可以在应用的 `设置` 页面保存。
首次启动时，主界面会显示非阻塞式引导横幅，提示完成模型平台、默认工作目录、第一个项目和基础工具试用。可以按步骤跳转，也可以跳过引导；跳过后仍可在 `设置` 和 `项目工作区` 中完成同样配置，并可在设置页重新显示首次引导。

### 使用 `.env`

复制 `.env.example` 为 `.env`，按需填写：

```env
SILICONFLOW_API_KEY=
SILICONFLOW_BASE_URL=https://api.siliconflow.com/v1
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
OPENAI_COMPATIBLE_API_KEY=
OPENAI_COMPATIBLE_BASE_URL=https://api.example.com/v1
```

API Key 不会写入 SQLite。通过设置页保存 API Key 时，会写入项目根目录 `.env`。

### 在设置页配置

1. 打开左侧 `设置`。
2. 选择模型平台，例如 SiliconFlow、OpenAI、DeepSeek 或 OpenAI 兼容平台。
3. 填写 Base URL、模型名称、API Key 和请求超时。
4. 点击保存。
5. 使用连接测试确认模型可用。

## 界面导航

应用左侧为模块导航：

- `项目工作区`：维护本地项目目录、标签、说明和项目数据包。
- `JSON工具`：格式化、压缩、校验 JSON，并按路径查询字段。
- `API测试`：发送 HTTP 请求、保存集合、导入接口、分析响应。
- `Git助手`：查看状态、日志、diff，暂存文件并生成提交说明。
- `AI解释代码`：用 Prompt 模板解释代码并保存历史。
- `AI生成代码`：根据需求生成代码草稿并复制代码块。
- `AI历史中心`：检索、复用、收藏、导出和清理 AI 历史。
- `设置`：管理模型、模板、默认目录、数据库和导入导出。

顶部的最近项目下拉框可以快速切换项目上下文。

## 项目工作区

项目工作区用于把 AI 历史、API 请求集合和 Git 默认目录关联到具体项目。

### 新增项目

1. 打开 `项目工作区`。
2. 点击新建或选择项目目录。
3. 填写项目名称、目录、标签和说明。
4. 点击 `保存项目`。

保存后，该项目会出现在左侧项目列表和顶部最近项目入口中。

### 编辑和删除项目

编辑项目时，在项目列表中选择项目，修改名称、目录、标签或说明后点击 `保存项目`。

删除项目时，选择项目后点击删除按钮，并在确认弹窗中确认。删除项目工作区不会删除本地源码目录。

### 项目数据包

项目数据包用于迁移项目相关数据，包括项目记录、AI 历史和 API 请求。

- `导出项目包`：导出当前项目相关数据。
- `导入项目包`：导入前显示预览数量和冲突项目。
- 冲突策略：支持覆盖、跳过和另存新项目。

## JSON 工具

JSON 工具支持格式化、压缩、校验和路径查询。

常用流程：

1. 打开 `JSON工具`。
2. 将 JSON 粘贴到输入区。
3. 按需点击格式化、压缩或校验。
4. 需要查询字段时，在路径查询中输入 `profile.name`、`items[0].id` 等路径。

格式错误时，状态栏会显示解析失败原因。

## API 测试

API 测试支持请求调试、环境变量、请求集合、请求历史、OpenAPI 导入和项目接口自动发现。

### 发送请求

1. 打开 `API测试`。
2. 选择项目工作区。
3. 选择请求方法。
4. 输入 URL。相对路径可以使用 `{{baseUrl}}` 前缀。
5. 按需填写 Headers、Query、Body 和断言。
6. 点击发送。

响应区域会显示状态码、耗时、响应头和响应 Body。

### 保存请求

完成请求配置后，填写请求名称并点击保存。保存后的请求会进入 API 请求集合，并可按分组折叠查看。

### 导入 OpenAPI / Swagger

导入 OpenAPI / Swagger JSON 后，应用会展示接口数量和分组预览。确认后可导入为请求集合。

### 自动发现项目 API

先在 `项目工作区` 保存项目目录，再进入 `API测试` 选择项目并启动项目 API 自动扫描。应用会静态扫描后端 Spring Controller 和前端 fetch / axios 调用。

自动发现以静态扫描为主，动态拼接 URL、运行时路由和深度框架约定仍需要人工复核。

## Git 助手

Git 助手用于查看仓库状态、差异、提交历史，并辅助生成变更说明和提交信息。

常用流程：

1. 打开 `Git助手`。
2. 选择项目工作区，或手动输入 Git 仓库目录。
3. 执行状态、日志或差异命令。
4. 需要提交时，先暂存文件，再填写或生成 Commit Message。
5. 提交前会弹出确认。

Git 路径会做越界检查，文件级暂存使用 `git add -- <path>`，取消暂存使用 `git restore --staged -- <path>`。

## AI 代码工作流

AI 代码工作流包括 `AI解释代码`、`AI生成代码`、API 响应分析和 Git 辅助输出。

通用流程：

1. 先在设置页配置模型平台并通过连接测试。
2. 选择项目工作区。
3. 选择 Prompt 模板。
4. 填写模板变量和输入内容。
5. 执行生成。
6. 查看 Markdown 渲染结果，必要时复制代码块或保存历史。

生成过程中支持停止流式输出。没有配置 API Key 时，页面会显示明确提示。

## AI 历史中心

AI 历史中心统一管理代码解释、代码生成、API 分析、Git 变更说明和 Commit Message 历史。

支持能力：

- 按项目、任务类型、关键词和收藏状态筛选。
- 查看完整 Prompt 和输出。
- 复制 Prompt 或输出。
- 重新执行历史任务。
- 收藏或取消收藏。
- 将历史 Prompt 创建为模板。
- 删除单条历史或清空当前筛选结果。

## 设置与数据维护

### 模型设置

设置页支持 SiliconFlow、OpenAI、DeepSeek 和 OpenAI 兼容平台。可配置 Base URL、模型、API Key 和请求超时，并执行连接测试。

### Prompt 模板

设置页集中管理 Prompt 模板：

1. 选择任务类型。
2. 选择已有模板或新建模板。
3. 编辑模板名称和内容。
4. 使用变量预览模板。
5. 保存模板。

模板变量使用双花括号，例如：

```text
请解释以下代码：

{{ code }}
```

### 数据库信息

设置页会显示数据库路径、schema 版本、文件大小、更新时间和表统计。

开发环境数据库默认位于：

```text
data/devtools-codex.db
```

打包环境会使用 Electron `userData/data` 目录，避免安装目录不可写。

### 数据库维护

支持以下操作：

- 备份数据库到 `backups/`。
- 从 `.db/.sqlite/.sqlite3` 文件恢复数据库。
- 清理 AI 历史。
- 清理 API 请求历史。
- 清理 API 请求集合。
- 清理自定义 Prompt 模板。
- 导出诊断 JSON，包含数据库路径、schema 版本、应用版本、平台信息和最近错误。

清理和恢复操作会先要求确认。
如果 `.env` 写入、数据库备份 / 恢复或导入 / 导出失败，状态栏会显示权限、文件占用或格式校验等具体原因。失败记录也会进入诊断 JSON，便于排查发布环境问题。

## 开发与发布命令

### 本地开发

```powershell
npm.cmd install
npm.cmd run dev
```

### 验证

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run verify:electron-smoke
npm.cmd run verify:e2e
npm.cmd run verify:packaged-smoke
npm.cmd run verify:release
npm.cmd run verify:update-feed
```

`test` 会执行基础 smoke test、Phase 3 静态验证和数据安全验证。数据安全验证覆盖 schema 版本、迁移入口、数据库表结构、备份、清理和恢复的基础闭环。

`build` 会执行 ESLint、Prettier 检查、TypeScript 检查、Electron/Vite 构建和构建产物校验。
`verify:electron-smoke` 会在构建后使用隔离数据目录启动 Electron 应用，检查核心页面路由、导航和 preload API，页面加载完成后自动退出。
`verify:e2e` 会通过 Playwright Electron 启动构建后的应用，执行首次启动引导、真实侧边栏点击、路由跳转、preload API、AI 无 Key 状态、设置页数据维护入口、JSON 表单、临时本地 API 请求、临时 Git 仓库操作和截图产物断言。
`verify:packaged-smoke` 会启动 `release/win-unpacked/AI 开发工具箱.exe`，使用隔离数据目录验证打包产物可以自动启动并正常退出。
`verify:release` 会检查安装版、便携版、blockmap 和未压缩目录版，并生成 `release/release-manifest.json`，其中包含文件大小和 SHA256。
`verify:update-feed` 会检查 Cloudflare R2 generic 更新源配置，并在 `release/latest.yml` 已生成时校验安装包、blockmap 和更新元数据。

### 站点构建

```powershell
npm.cmd run build:site
```

输出目录为：

```text
site/dist
```

Cloudflare Pages 可使用 `npm run build:site` 作为构建命令，`site/dist` 作为输出目录。

### 打包

```powershell
npm.cmd run pack
npm.cmd run dist
npm.cmd run release:check
```

- `pack`：生成 `release/win-unpacked`。
- `dist`：生成安装包、便携包和 blockmap。
- `release:check`：执行正式打包，并校验发布产物和更新 feed 元数据。

正式发包建议在干净依赖环境中执行：

```powershell
npm.cmd ci
npm.cmd run release:check
```

## 发布前检查清单

发布前至少确认：

- [ ] Node.js 版本满足依赖要求，建议 `22.13+`。
- [ ] 使用干净依赖环境执行过 `npm.cmd ci`。
- [ ] `npm.cmd run typecheck` 通过。
- [ ] `npm.cmd run lint` 通过。
- [ ] `npm.cmd test` 通过。
- [ ] `npm.cmd run build` 通过。
- [ ] `npm.cmd run verify:electron-smoke` 通过。
- [ ] `npm.cmd run verify:e2e` 通过。
- [ ] `npm.cmd run verify:packaged-smoke` 通过。
- [ ] `npm.cmd run build:site` 通过。
- [ ] `npm.cmd run release:check` 通过。
- [ ] `release/release-manifest.json` 已生成并记录 SHA256。
- [ ] 安装版可以安装、启动、关闭和卸载。
- [ ] 便携版可以启动并正常读写用户数据。
- [ ] 首次启动会自动创建数据库。
- [ ] 无 API Key 时页面提示清晰。
- [ ] 错误 API Key、断网和超时场景有明确错误信息。
- [ ] R2 下载链接返回 200，文件大小与本地产物一致。
- [ ] `.env` 未提交到仓库。
- [ ] 发布说明明确当前版本为 beta，暂不承诺自动更新。

## 常见问题

### AI 功能提示未配置 API Key

检查 `.env` 或设置页是否填写了当前平台的 API Key。切换平台后，需要确认对应平台的 Base URL 和 Key 都已保存。

### 模型连接失败

检查：

- Base URL 是否以 `/v1` 结尾。
- API Key 是否正确。
- 模型名称是否被当前平台支持。
- 网络是否能访问对应平台。
- 请求超时是否过短。

### API 自动发现结果不完整

自动发现基于静态扫描。以下情况可能需要手动补全：

- URL 运行时拼接。
- Controller 注解经过自定义封装。
- fetch / axios 调用被二次封装。
- 路由由框架插件动态生成。

### Git 助手没有输出

确认工作目录是 Git 仓库，且本机已安装 Git。项目工作区路径不一定等于 Git 仓库根目录，必要时手动填写仓库目录。

### 打包时出现 `spawn EPERM`

这通常是安全策略、文件锁或沙箱限制导致 esbuild 子进程无法启动。请在允许子进程执行的 PowerShell 环境中运行：

```powershell
npm.cmd run dist
```

### PowerShell 显示中文乱码

文件本身使用 UTF-8。若 PowerShell 输出乱码，可使用支持 UTF-8 的终端，或通过编辑器查看 Markdown 文件。
