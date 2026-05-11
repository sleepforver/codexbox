import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import process from 'node:process'

const releaseDir = join(process.cwd(), 'release')
const manifestPath = join(releaseDir, 'release-manifest.json')
const version = process.env.npm_package_version || readPackageVersion()

const expectedArtifacts = [
  {
    role: 'installer',
    path: join(releaseDir, `AI 开发工具箱 Setup ${version}.exe`),
    minBytes: 50 * 1024 * 1024
  },
  {
    role: 'portable',
    path: join(releaseDir, `AI 开发工具箱 ${version}.exe`),
    minBytes: 50 * 1024 * 1024
  },
  {
    role: 'blockmap',
    path: join(releaseDir, `AI 开发工具箱 Setup ${version}.exe.blockmap`),
    minBytes: 1024
  },
  {
    role: 'unpacked',
    path: join(releaseDir, 'win-unpacked', 'AI 开发工具箱.exe'),
    minBytes: 100 * 1024 * 1024
  }
]

function readPackageVersion() {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
  return packageJson.version
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function readArtifact(item) {
  if (!existsSync(item.path)) {
    return { ...item, ok: false, error: 'missing' }
  }

  const stat = statSync(item.path)
  const ok = stat.size >= item.minBytes
  return {
    role: item.role,
    file: basename(item.path),
    path: item.path,
    sizeBytes: stat.size,
    sha256: sha256(item.path),
    ok,
    error: ok ? undefined : `size below minimum ${item.minBytes}`
  }
}

function formatSize(sizeBytes) {
  return `${(sizeBytes / 1024 / 1024).toFixed(2)} MB`
}

const artifacts = expectedArtifacts.map(readArtifact)
const failed = artifacts.filter((item) => !item.ok)
const manifest = {
  version,
  generatedAt: new Date().toISOString(),
  releaseDir,
  artifacts
}

mkdirSync(releaseDir, { recursive: true })
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

for (const item of artifacts) {
  if (!item.ok) {
    console.error(`release artifact check failed: ${item.role} ${item.error}`)
    continue
  }

  console.log(`${item.role}: ${item.file} ${formatSize(item.sizeBytes)} sha256=${item.sha256}`)
}

console.log(`release manifest written: ${manifestPath}`)

if (failed.length) {
  process.exit(1)
}
