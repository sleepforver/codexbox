# AI 开发工具箱

面向电力地理行业开发工作的本地桌面工具箱，基于 Electron、Vue、TypeScript、SiliconFlow 和 SQLite。

## 功能概览

- JSON 工具：格式化、压缩、校验和路径查询。
- API 测试：环境变量、请求集合、请求历史、cURL 复制和 AI 分析。
- Git 助手：状态、日志、diff、文件级暂存、AI 变更说明和 Commit Message。
- 电力地理：GeoJSON 体检、几何类型统计、坐标范围和必填属性检查。
- AI 解释代码：模板化 Prompt、流式输出、Markdown 渲染、历史详情。
- AI 生成代码：模板化需求、流式输出、复制首个代码块、历史详情。
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

安装依赖：

```powershell
npm.cmd install
```

开发启动：

```powershell
npm.cmd run dev
```

类型检查：

```powershell
npm.cmd run typecheck
```

轻量测试：

```powershell
npm.cmd test
```

生产构建：

```powershell
npm.cmd run build
```

打包：

```powershell
npm.cmd run pack
```

## VS Code 任务

`.vscode/tasks.json` 已提供：

- `DevTools: Start`
- `DevTools: Stop`
- `DevTools: Typecheck`
- `DevTools: Build`
- `DevTools: Package`

启动任务会清空 `ELECTRON_RUN_AS_NODE`，避免 Electron 启动异常。

## 数据存储

SQLite 数据库位于项目内：

```text
data/devtools-codex.db
```

该目录已被 `.gitignore` 忽略。设置页的数据维护支持：

- 查看数据库路径、大小、更新时间和表统计。
- 备份数据库到 `data/backups/`。
- 从 `.db/.sqlite/.sqlite3` 文件恢复数据库。
- 清理 AI 历史、API 请求历史、API 请求集合、自定义 Prompt 模板。

## 导入导出

设置页的数据维护支持：

- 导出 AI 历史为 JSON。
- 导出 AI 历史为 Markdown。
- 导出 / 导入 Prompt 模板 JSON。
- 导出 / 导入 API 请求集合 JSON。

JSON 导出使用统一结构：

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

如需生成安装包，继续执行：

```powershell
npm.cmd run dist
```
