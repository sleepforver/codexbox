# 官网部署说明

本目录是 `AI 开发工具箱` 的静态官网首页，可部署到 Cloudflare Pages。

线上地址：

```text
https://codexbox.pages.dev
```

## 本地构建

在仓库根目录执行：

```powershell
npm.cmd run build:site
```

构建产物输出到：

```text
site/dist
```

## Cloudflare Pages 配置

在 Cloudflare Pages 连接 GitHub 仓库后，使用以下配置：

```text
Framework preset: None
Build command: npm run build:site
Build output directory: site/dist
Root directory: /
```

部署后可在 Pages 项目中绑定自定义域名。

## 下载链接

首页当前把下载入口指向 Cloudflare R2 公网直链：

```text
https://pub-bade506d946641b0b4cbb6b345690acc.r2.dev/AI%20%E5%BC%80%E5%8F%91%E5%B7%A5%E5%85%B7%E7%AE%B1%20Setup%200.1.0.exe
https://pub-bade506d946641b0b4cbb6b345690acc.r2.dev/AI%20%E5%BC%80%E5%8F%91%E5%B7%A5%E5%85%B7%E7%AE%B1%200.1.0.exe
```

用户点击首页下载按钮会直接开始下载对应 exe。

## 操作手册页面

构建脚本会读取仓库根目录 `README.md`，生成渲染后的 HTML 页面：

```text
site/dist/manual.html
```

同时保留 Markdown 原文：

```text
site/dist/README.md
```
