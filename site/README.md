# 官网部署说明

本目录是 `AI 开发工具箱` 的静态官网首页，可部署到 Cloudflare Pages。

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

首页当前保留了安装版和便携版下载入口占位。正式公开分发时，建议把安装包上传到 GitHub Release 或 Cloudflare R2，然后把 `site/index.html` 中 `#download` 区域的链接替换为真实地址。
