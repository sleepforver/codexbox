# 发布说明

## 0.1.0 三期收口

本期完成项目化工作流、API 自动发现、AI 历史与模板管理、地理体检增强、Git 助手增强以及发布验证链路。

### 主要变化

- 设置页支持 SiliconFlow、OpenAI、DeepSeek 和 OpenAI 兼容平台。
- API Key 保存到项目根目录 `.env`，不写入 SQLite；模型配置由设置页保存值或平台默认值决定。
- API 测试支持 Spring Controller、前端 fetch / axios 和 OpenAPI / Swagger JSON 导入。
- API 扫描结果和导入后的请求集合均按分组折叠展示，大量接口不会撑长页面。
- 相对路径接口保存和回显时保留 `{{baseUrl}}`，发送请求时再解析环境变量。
- AI 解释、生成、API 分析和 Git 助手支持项目隔离、历史记录、Markdown 输出和模板选择。
- 项目包支持导入前预览、冲突策略和导入明细。
- 发布验证链路接入 ESLint、Prettier、TypeScript、smoke test、三期静态验证和 build 输出检查。

### 验证结果

- `npm.cmd run lint` 通过。
- `npm.cmd test` 通过。
- `npm.cmd run pack` 通过，并生成 `release/win-unpacked`。
- `release/win-unpacked/AI 开发工具箱.exe` 短时启动验证返回退出码 0。

### 已知限制

- 当前 AI 平台调用使用 OpenAI 兼容 Chat Completions 协议；非兼容平台需要后续新增适配器。
- API 自动发现以静态扫描为主，复杂动态路由、运行时拼接 URL 和深度框架约定仍需要人工确认。
- 打包验证在当前沙箱内会因 esbuild 子进程触发 `spawn EPERM`，需要在非沙箱环境运行。
- 尚未接入 Playwright/Electron E2E，真实 UI 操作回归仍以手动验证为主。
