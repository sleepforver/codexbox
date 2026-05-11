import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const templatePath = join(root, 'site', 'index.html')
const buildScriptPath = join(root, 'site', 'build.mjs')
const sourceManualPath = join(root, 'site', 'manual.html')
const distIndexPath = join(root, 'site', 'dist', 'index.html')
const manifestPath = join(root, 'release', 'release-manifest.json')

const template = read(templatePath)
const buildScript = read(buildScriptPath)

assertIncludes(template, '<!-- RELEASE_DOWNLOADS_START -->', 'release downloads placeholder start')
assertIncludes(template, '<!-- RELEASE_DOWNLOADS_END -->', 'release downloads placeholder end')
assertIncludes(template, '<!-- RELEASE_SUMMARY_START -->', 'release summary placeholder start')
assertIncludes(template, '<!-- RELEASE_SUMMARY_END -->', 'release summary placeholder end')
assertIncludes(template, 'data-release-role="installer"', 'source installer download fallback')
assertIncludes(template, 'data-release-role="portable"', 'source portable download fallback')
assertIncludes(template, 'https://codexbox.xyz', 'custom domain in source site')
assertIncludes(buildScript, 'release-manifest.json', 'release manifest read path')
assertIncludes(buildScript, 'renderReleaseCards', 'release card renderer')
assertIncludes(buildScript, 'SHA256', 'SHA256 rendering')
assertIncludes(buildScript, 'Windows x64', 'system requirement rendering')
assertIncludes(buildScript, 'RELEASE_DOWNLOADS_START', 'release downloads replacement range')
assertIncludes(buildScript, 'renderManualSidebar', 'manual sidebar renderer')
assertIncludes(buildScript, 'stripMarkdownToc', 'manual markdown toc stripping')
assertIncludes(buildScript, "token.attrSet('id'", 'manual heading id generation')
assertIncludes(buildScript, 'manualTocScript', 'manual runtime toc fallback')
assertIncludes(buildScript, "writeFile(join(siteDir, 'manual.html')", 'source manual sync output')
assert.ok(existsSync(sourceManualPath), 'source manual.html missing')
validateManualHtml(read(sourceManualPath), 'source manual')

if (existsSync(distIndexPath) && existsSync(manifestPath)) {
  const distIndex = read(distIndexPath)
  if (!distIndex.includes('data-release-rendered="true"')) {
    console.log('site release static checks passed; site/dist has not been rebuilt with release metadata yet')
    process.exit(0)
  }

  const manifest = JSON.parse(read(manifestPath))
  const installer = manifest.artifacts.find((item) => item.role === 'installer')
  const portable = manifest.artifacts.find((item) => item.role === 'portable')

  assert.ok(installer?.sha256, 'release manifest missing installer sha256')
  assert.ok(portable?.sha256, 'release manifest missing portable sha256')
  assertIncludes(distIndex, installer.sha256, 'installer SHA256 in site output')
  assertIncludes(distIndex, portable.sha256, 'portable SHA256 in site output')
  assertIncludes(distIndex, 'Windows x64', 'system requirement in site output')
  assertIncludes(distIndex, 'Cloudflare R2 feed', 'update strategy in site output')
  assertIncludes(distIndex, 'https://codexbox.xyz', 'custom domain in site output')

  validateManualHtml(read(join(root, 'site', 'dist', 'manual.html')), 'site output manual')
}

console.log('site release verification checks passed')

function validateManualHtml(manual, label) {
  assertIncludes(manual, 'manual-sidebar', `${label} sidebar`)
  assertIncludes(manual, 'manual-toc-list', `${label} semantic toc list`)
  assertIncludes(manual, 'manual-toc-item', `${label} semantic toc items`)
  assertIncludes(manual, 'manual-toc-link', `${label} toc links`)
  assertIncludes(manual, 'inlineTocHeading', `${label} runtime toc fallback`)
  assertIncludes(manual, '<h2 id=', `${label} h2 anchors`)
  assert.doesNotMatch(manual, /fallback|source directory|README\.md<\/code>/, `${label} should not be fallback content`)

  const staticSidebar = manual.match(/<aside class="manual-sidebar"[\s\S]*?<\/aside>/)?.[0] ?? ''
  const tocLinks = [...staticSidebar.matchAll(/class="manual-toc-link[^"]*" href="#([^"]+)"/g)].map((match) => match[1])
  assert.ok(tocLinks.length > 8, `${label} sidebar should expose multiple toc links`)
  const missingAnchors = tocLinks.filter((id) => !manual.includes(`id="${id}"`))
  assert.deepEqual(missingAnchors, [], `${label} sidebar links should all target rendered headings`)
}

function read(path) {
  return readFileSync(path, 'utf8')
}

function assertIncludes(source, text, label) {
  assert.ok(source.includes(text), `${label} missing`)
}
