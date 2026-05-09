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

首页当前把下载入口指向 `v0.1.0` GitHub Release Asset 直链：

```text
https://github.com/sleepforver/codexbox/releases/download/v0.1.0/AI.0.1.0.exe
```

用户点击首页下载按钮会直接开始下载 `AI.0.1.0.exe`。

## 操作手册页面

构建脚本会读取仓库根目录 `README.md`，生成渲染后的 HTML 页面：

```text
site/dist/manual.html
```

同时保留 Markdown 原文：

```text
site/dist/README.md
```
