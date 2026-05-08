# AI 开发工具箱

面向电力地理行业开发工作的本地桌面工具箱，基于 Electron、Vue、TypeScript、SiliconFlow 和 SQLite。

## 功能概览

- JSON 工具：格式化、压缩、校验和路径查询。
- API 测试：环境变量、请求集合、请求历史、cURL 复制和 AI 分析。
- Git 助手：状态、日志、diff、文件级暂存、AI 变更说明和 Commit Message。
- 电力地理：GeoJSON 体检、几何类型统计、坐标范围和必填属性检查。
- AI 解释代码：模板化 Prompt、流式输出、Markdown 渲染、历史详情。
- AI 生成代码：模板化需求、流式输出、复制首个代码块、历史详情。
- AI 历史中心：统一检索、查看、复制、删除和重新执行 AI 历史。
- 设置中心：模型连接诊断、Prompt 模板统一管理、SQLite 维护、导入导出。

## 环境准备

需要 Node.js 和 npm。Windows PowerShell 下建议使用 `npm.cmd`。

复制 `.env.example` 为 `.env`，填写硅基流动配置：

```env
SILICONFLOW_API_KEY=
SILICONFLOW_BASE_URL=https://api.siliconflow.com/v1
SILICONFLOW_MODEL=Qwen/Qwen2.5-7B-Instruct
```

也可以在应用设置页保存 API Key。环境变量优先级高于设置页 SQLite 存储。

## 启动与验证

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

打包：

```powershell
npm.cmd run pack
npm.cmd run dist
```

## 架构说明

主进程负责本地能力、文件系统、SQLite、Git 和 AI 请求；渲染进程只负责界面和调用 `devtoolsApi`。

关键目录：

```text
electron/main/db/             SQLite 连接、schema、迁移和仓储
electron/main/ipc/            IPC 模块化注册
electron/main/services/       业务服务门面
electron/main/validation/     zod 运行时校验
src/shared/ipc.ts             主进程和渲染进程共享类型契约
src/renderer/safeLoad.ts      页面初始化兜底加载工具
```

## 数据存储

开发环境 SQLite 数据库位于项目内：

```text
data/devtools-codex.db
```

打包环境会自动使用 Electron `userData/data` 目录，避免安装目录不可写。设置页会显示真实数据库路径、schema 版本、大小、更新时间和表统计。

数据库维护支持：

- 备份数据库到 `backups/`。
- 从 `.db/.sqlite/.sqlite3` 文件恢复数据库。
- 清理 AI 历史、API 请求历史、API 请求集合、自定义 Prompt 模板。
- 使用 `schema_version` 支持后续版本迁移。

## 导入导出

设置页支持：

- 导出 AI 历史为 JSON。
- 导出 AI 历史为 Markdown。
- 导出 / 导入 Prompt 模板 JSON。
- 导出 / 导入 API 请求集合 JSON。

JSON 导出使用统一结构，导入时会进行运行时格式校验：

```json
{
  "version": 1,
  "type": "prompt-templates",
  "exportedAt": "2026-05-07T00:00:00.000Z",
  "items": []
}
```

## 发布前检查

发布前至少执行：

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```
