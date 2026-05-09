# 发布检查清单

## 配置

- `.env.example` 包含 SiliconFlow、OpenAI、DeepSeek 和 OpenAI 兼容平台的 API Key / Base URL 示例，不包含模型环境变量。
- `.env` 未提交到仓库。
- 设置页能选择模型平台，编辑 Base URL、模型和超时。
- 设置页保存 API Key 时写入项目根目录 `.env`，不写入 SQLite。
- 模型配置只来自设置页保存值或平台默认值，不被 `.env` 中的模型变量覆盖。
- 测试模型连接能给出成功耗时或明确错误原因。

## 架构

- IPC 注册按 JSON、API、Git、Geo、AI、Settings 模块拆分。
- SQLite 连接、schema、迁移、仓储和维护逻辑已拆分到 `electron/main/db/`。
- 数据库包含 `schema_version`，后续表结构变更必须通过迁移处理。
- 导入文件、IPC 数据和入库数据使用 zod 做运行时校验。
- 页面初始化使用 `safeLoad` / `safeLoadAll`，单个加载失败不应阻断整页可用性。

## 数据

- 开发环境 `data/devtools-codex.db` 能自动生成。
- 打包环境数据库路径落在 Electron `userData/data`。
- 设置页能显示数据库路径、schema 版本、大小、更新时间和表统计。
- 数据库备份能生成到 `backups/`。
- 数据库恢复后提示重启应用。
- 清理 AI 历史、API 历史、请求集合、自定义模板前有确认提示。
- 清理地理体检历史前有确认提示。
- AI 历史批量清理通过主进程批量接口处理，不在前端逐条循环删除。

## 工具页

- 项目工作区能新增、编辑、删除和标记最近使用项目。
- 项目工作区能导入 / 导出项目列表和项目数据包。
- 顶部最近项目入口能打开并标记最近使用项目。
- AI 解释、AI 生成、API 测试和 Git 助手能选择项目工作区。
- 新增 AI 历史和 API 请求集合时能写入项目关联。
- 左侧目录固定，右侧工作区独立滚动。
- 有模板的页面只保留模板选择和应用，模板编辑集中在设置页。
- AI 输出支持 Markdown 渲染和滚动查看。
- AI 解释 / 生成 / API / Git 的历史详情能查看完整 Prompt 和输出。
- AI 历史中心能按任务筛选、搜索、查看、复制、删除和重新执行。
- AI 历史中心能按项目筛选和清空。
- 地理数据体检支持基础要素、点要素、线要素和综合数据字段模板。
- 地理数据体检结果能按项目保存、查看、删除和清空。
- AI 生成支持复制首个代码块。
- Git Commit Message 能从 AI 输出一键填入。

## 导入导出

- AI 历史可导出 JSON。
- AI 历史可导出 Markdown。
- Prompt 模板可导出 / 导入 JSON。
- API 请求集合可导出 / 导入 JSON。
- 后端 Spring Controller 可自动扫描出 API 请求并按 Controller 分组。
- 前端项目 fetch / axios 调用可自动扫描出 API 请求并按来源文件分组。
- API 自动发现扫描过程不应阻断界面操作，扫描完成后先预览再导入。
- API 自动发现和导入后的请求集合都应按分组折叠展示，避免大量接口撑长页面。
- 保存后的相对路径接口应保留 `{{baseUrl}}` 前缀，发送时再解析环境变量。
- 项目数据包可导出 JSON。
- 项目数据包可导入 JSON。
- 项目列表可导入 / 导出 JSON。
- 项目包导入前应显示预览数量和冲突项目。
- 项目包导入冲突策略应覆盖、跳过、另存新项目三种路径。
- GeoJSON 文件导入后应能直接分析。
- 地理体检报告应能导出 Markdown / JSON。
- AI 历史中心可将历史 Prompt 转为模板。
- 导入错误能显示可理解的错误提示，格式无效时不应部分写入。
- 空导入文件应给出明确错误提示。
- 项目包重复导入时 AI 历史、API 请求和地理体检历史不应无限重复。
- GeoJSON 输入为空、超出大小或要素数量上限时应给出明确错误提示。
- 最近项目读取失败时不应阻断主界面加载。

## 验证命令

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## 打包命令

```powershell
npm.cmd run pack
npm.cmd run dist
```

## 发布说明

- 本期发布说明记录在 `docs/release-notes.md`。
