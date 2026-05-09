import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'

const siteDir = dirname(fileURLToPath(import.meta.url))
const repoDir = dirname(siteDir)
const distDir = join(siteDir, 'dist')
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true
})

function renderManualPage(content) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="AI 开发工具箱操作手册，包含安装、配置、功能模块、数据维护和发布命令说明。" />
    <title>操作手册 | AI 开发工具箱</title>
    <link
      rel="icon"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2316845b'/%3E%3Ctext x='32' y='40' text-anchor='middle' font-family='Arial' font-size='25' font-weight='700' fill='white'%3EAI%3C/text%3E%3C/svg%3E"
    />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="./index.html" aria-label="返回 AI 开发工具箱首页">
        <span class="brand-mark">AI</span>
        <span>AI 开发工具箱</span>
      </a>
      <nav class="nav" aria-label="页面导航">
        <a href="./index.html#features">功能</a>
        <a href="./index.html#download">下载</a>
        <a href="./manual.html">操作手册</a>
      </nav>
    </header>
    <main class="manual-page">
      <article class="manual-content">
        ${markdown.render(content)}
      </article>
    </main>
    <footer class="footer">
      <span>AI 开发工具箱 0.1.0</span>
      <a href="./index.html">返回首页</a>
    </footer>
  </body>
</html>`
}

await rm(distDir, { recursive: true, force: true })
await mkdir(distDir, { recursive: true })
await cp(join(siteDir, 'index.html'), join(distDir, 'index.html'))
await cp(join(siteDir, 'styles.css'), join(distDir, 'styles.css'))
await cp(join(siteDir, '_headers'), join(distDir, '_headers'))
const manualMarkdown = await readFile(join(repoDir, 'README.md'), 'utf8')
await cp(join(repoDir, 'README.md'), join(distDir, 'README.md'))
await writeFile(join(distDir, 'manual.html'), renderManualPage(manualMarkdown))
await cp(join(siteDir, 'assets'), join(distDir, 'assets'), { recursive: true })

console.log(`site build output: ${distDir}`)
