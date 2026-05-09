import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteDir = dirname(fileURLToPath(import.meta.url))
const repoDir = dirname(siteDir)
const distDir = join(siteDir, 'dist')

await rm(distDir, { recursive: true, force: true })
await mkdir(distDir, { recursive: true })
await cp(join(siteDir, 'index.html'), join(distDir, 'index.html'))
await cp(join(siteDir, 'styles.css'), join(distDir, 'styles.css'))
await cp(join(siteDir, '_headers'), join(distDir, '_headers'))
await cp(join(repoDir, 'README.md'), join(distDir, 'README.md'))
await cp(join(siteDir, 'assets'), join(distDir, 'assets'), { recursive: true })

console.log(`site build output: ${distDir}`)
