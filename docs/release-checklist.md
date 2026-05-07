# 发布检查清单

## 配置

- `.env.example` 包含 `SILICONFLOW_API_KEY`、`SILICONFLOW_BASE_URL`、`SILICONFLOW_MODEL`。
- `.env` 未提交到仓库。
- 设置页能显示 API Key 来源、Base URL、模型和超时。
- 测试模型连接能给出成功耗时或明确错误原因。

## 数据

- `data/devtools-codex.db` 能自动生成。
- 设置页能显示数据库路径、大小、更新时间和表统计。
- 数据库备份能生成到 `data/backups/`。
- 数据库恢复后提示重启应用。
- 清理 AI 历史、API 历史、请求集合、自定义模板前有确认提示。

## 工具页

- 左侧目录固定，右侧工作区独立滚动。
- 有模板的页面只保留模板选择和应用，模板编辑集中在设置页。
- AI 输出支持 Markdown 渲染和滚动查看。
- AI 解释 / 生成 / API / Git 的历史详情能查看完整 Prompt 和输出。
- AI 生成支持复制首个代码块。
- Git Commit Message 能从 AI 输出一键填入。

## 导入导出

- AI 历史可导出 JSON。
- AI 历史可导出 Markdown。
- Prompt 模板可导出 / 导入 JSON。
- API 请求集合可导出 / 导入 JSON。
- 导入错误能显示可理解的错误提示。

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
