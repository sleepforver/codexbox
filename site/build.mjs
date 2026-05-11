import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'
import prettier from 'prettier'

const siteDir = dirname(fileURLToPath(import.meta.url))
const repoDir = dirname(siteDir)
const distDir = join(siteDir, 'dist')
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true
})
const releaseManifestPath = join(repoDir, 'release', 'release-manifest.json')

function stripMarkdownToc(content) {
  return content.replace(/^## 目录\s*\n[\s\S]*?(?=^##\s+)/m, '')
}

function plainTextFromToken(token) {
  return (
    token.children
      ?.map((child) => child.content || '')
      .join('')
      .trim() ?? ''
  )
}

function createManualSlugFactory() {
  const used = new Map()
  return (title) => {
    const normalized = title
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
    const base = normalized || 'section'
    const next = (used.get(base) ?? 0) + 1
    used.set(base, next)
    return next === 1 ? base : `${base}-${next}`
  }
}

function renderManualContent(content) {
  const source = stripMarkdownToc(content)
  const env = {}
  const tokens = markdown.parse(source, env)
  const slug = createManualSlugFactory()
  const toc = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.type !== 'heading_open') continue

    const level = Number.parseInt(token.tag.slice(1), 10)
    if (level < 2 || level > 3) continue

    const title = plainTextFromToken(tokens[index + 1])
    if (!title) continue

    const id = slug(title)
    token.attrSet('id', id)
    toc.push({ id, title, level })
  }

  return {
    html: markdown.renderer.render(tokens, markdown.options, env),
    toc
  }
}

function renderManualSidebar(toc) {
  const items = toc
    .map(
      (item) =>
        `<li class="manual-toc-item level-${item.level}"><a class="manual-toc-link" href="#${escapeHtml(item.id)}">${escapeHtml(item.title)}</a></li>`
    )
    .join('\n          ')

  return `<aside class="manual-sidebar" aria-label="操作手册目录">
        <div class="manual-sidebar-inner">
          <strong>操作手册目录</strong>
          <nav class="manual-toc" aria-label="操作手册章节">
          <ol class="manual-toc-list">
          ${items}
          </ol>
          </nav>
        </div>
      </aside>`
}

function renderManualPage(content) {
  const manual = renderManualContent(content)
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
      ${renderManualSidebar(manual.toc)}
      <article class="manual-content">
        ${manual.html}
      </article>
    </main>
    <footer class="footer">
      <span>AI 开发工具箱 0.1.0</span>
      <a href="./index.html">返回首页</a>
    </footer>
    <script>
      ${manualTocScript()}
    </script>
  </body>
</html>`
}

function manualTocScript() {
  return `(() => {
        const page = document.querySelector('.manual-page')
        const content = document.querySelector('.manual-content')
        if (!page || !content) return

        const inlineTocHeading = [...content.querySelectorAll('h2')].find((heading) => heading.textContent?.trim() === '目录')
        if (inlineTocHeading) {
          let cursor = inlineTocHeading.nextElementSibling
          inlineTocHeading.remove()
          while (cursor && cursor.tagName !== 'H2') {
            const next = cursor.nextElementSibling
            cursor.remove()
            cursor = next
          }
        }

        const used = new Map()
        const slug = (title) => {
          const normalized = title
            .toLowerCase()
            .trim()
            .replace(/[^\\p{L}\\p{N}]+/gu, '-')
            .replace(/^-+|-+$/g, '')
          const base = normalized || 'section'
          const next = (used.get(base) || 0) + 1
          used.set(base, next)
          return next === 1 ? base : base + '-' + next
        }

        const headings = [...content.querySelectorAll('h2, h3')].filter((heading) => heading.textContent?.trim())
        const items = headings.map((heading) => {
          if (!heading.id) heading.id = slug(heading.textContent || '')
          return { id: heading.id, title: heading.textContent || '', level: heading.tagName === 'H3' ? 3 : 2 }
        })

        let sidebar = page.querySelector('.manual-sidebar')
        if (!sidebar) {
          sidebar = document.createElement('aside')
          sidebar.className = 'manual-sidebar'
          sidebar.setAttribute('aria-label', '操作手册目录')
          page.insertBefore(sidebar, content)
        }

        sidebar.innerHTML =
          '<div class="manual-sidebar-inner"><strong>操作手册目录</strong><nav class="manual-toc" aria-label="操作手册章节"><ol class="manual-toc-list">' +
          items
            .map(
              (item) =>
                '<li class="manual-toc-item level-' +
                item.level +
                '"><a class="manual-toc-link" href="#' +
                encodeURIComponent(item.id) +
                '">' +
                item.title +
                '</a></li>'
            )
            .join('') +
          '</ol></nav></div>'
      })()`
}

function formatBytes(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '待发布'
  return `${(sizeBytes / 1024 / 1024).toFixed(2)} MB`
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function readReleaseManifest() {
  try {
    return JSON.parse(await readFile(releaseManifestPath, 'utf8'))
  } catch {
    return null
  }
}

function artifactByRole(manifest, role) {
  return manifest?.artifacts?.find((item) => item.role === role && item.ok)
}

function renderArtifactMeta(artifact) {
  if (!artifact) {
    return '<small class="artifact-meta">文件大小和 SHA256 将在发布构建后生成。</small>'
  }

  return `<small class="artifact-meta">大小：${escapeHtml(formatBytes(artifact.sizeBytes))}</small>
            <code class="sha-code">SHA256 ${escapeHtml(artifact.sha256)}</code>`
}

function renderReleaseCards(manifest) {
  const installer = artifactByRole(manifest, 'installer')
  const portable = artifactByRole(manifest, 'portable')
  const version = manifest?.version ?? '0.1.0'
  return [
    {
      role: 'installer',
      title: '下载安装版',
      href: 'https://pub-bade506d946641b0b4cbb6b345690acc.r2.dev/AI%20%E5%BC%80%E5%8F%91%E5%B7%A5%E5%85%B7%E7%AE%B1%20Setup%200.1.0.exe',
      file: installer?.file ?? `AI 开发工具箱 Setup ${version}.exe`,
      artifact: installer
    },
    {
      role: 'portable',
      title: '下载便携版',
      href: 'https://pub-bade506d946641b0b4cbb6b345690acc.r2.dev/AI%20%E5%BC%80%E5%8F%91%E5%B7%A5%E5%85%B7%E7%AE%B1%200.1.0.exe',
      file: portable?.file ?? `AI 开发工具箱 ${version}.exe`,
      artifact: portable
    }
  ]
    .map(
      (item) => `<a href="${item.href}" data-release-role="${item.role}">
            <strong>${item.title}</strong>
            <span>${escapeHtml(item.file)}</span>
            ${renderArtifactMeta(item.artifact)}
          </a>`
    )
    .join('\n          ')
}

function renderReleaseSummary(manifest) {
  const generatedAt = manifest?.generatedAt ? new Date(manifest.generatedAt).toLocaleString('zh-CN') : '等待发布构建'
  return `<dl class="download-meta" aria-label="发布校验信息">
            <div>
              <dt>发布状态</dt>
              <dd>Beta / 可手动下载</dd>
            </div>
            <div>
              <dt>系统要求</dt>
              <dd>Windows x64，建议 Windows 10 或更高版本</dd>
            </div>
            <div>
              <dt>更新策略</dt>
              <dd>应用内检查 Cloudflare R2 feed，失败后回到官网手动下载</dd>
            </div>
            <div>
              <dt>清单时间</dt>
              <dd>${escapeHtml(generatedAt)}</dd>
            </div>
          </dl>`
}

function renderHomePage(template, manifest) {
  return template
    .replace('<main id="top">', '<main id="top" data-release-rendered="true">')
    .replace(
      /<!-- RELEASE_DOWNLOADS_START -->[\s\S]*?<!-- RELEASE_DOWNLOADS_END -->/,
      `<!-- RELEASE_DOWNLOADS_START -->\n          ${renderReleaseCards(manifest)}\n          <!-- RELEASE_DOWNLOADS_END -->`
    )
    .replace(
      /<!-- RELEASE_SUMMARY_START -->[\s\S]*?<!-- RELEASE_SUMMARY_END -->/,
      `<!-- RELEASE_SUMMARY_START -->\n          ${renderReleaseSummary(manifest)}\n          <!-- RELEASE_SUMMARY_END -->`
    )
}

await rm(distDir, { recursive: true, force: true })
await mkdir(distDir, { recursive: true })
const releaseManifest = await readReleaseManifest()
const homeTemplate = await readFile(join(siteDir, 'index.html'), 'utf8')
await writeFile(join(distDir, 'index.html'), renderHomePage(homeTemplate, releaseManifest), 'utf8')
await cp(join(siteDir, 'styles.css'), join(distDir, 'styles.css'))
await cp(join(siteDir, '_headers'), join(distDir, '_headers'))
const manualMarkdown = await readFile(join(repoDir, 'README.md'), 'utf8')
const prettierConfig = (await prettier.resolveConfig(join(siteDir, 'manual.html'))) ?? {}
const manualHtml = await prettier.format(renderManualPage(manualMarkdown), { ...prettierConfig, parser: 'html' })
await cp(join(repoDir, 'README.md'), join(distDir, 'README.md'))
await writeFile(join(siteDir, 'manual.html'), manualHtml)
await writeFile(join(distDir, 'manual.html'), manualHtml)
await cp(join(siteDir, 'assets'), join(distDir, 'assets'), { recursive: true })

console.log(`site build output: ${distDir}`)
