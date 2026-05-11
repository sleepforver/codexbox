import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import process from 'node:process'

const cwd = process.cwd()
const releaseDir = join(cwd, 'release')
const packageJson = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
const version = packageJson.version
const publish = Array.isArray(packageJson.build?.publish) ? packageJson.build.publish[0] : packageJson.build?.publish

assert.equal(publish?.provider, 'generic', 'electron-builder publish provider must be generic')
assert.ok(String(publish?.url || '').startsWith('https://'), 'publish URL must be HTTPS')
assert.ok(String(publish?.url || '').endsWith('/'), 'publish URL must end with / for latest.yml resolution')
assert.ok(packageJson.scripts?.['verify:update-feed'], 'verify:update-feed script missing')
assert.ok(
  String(packageJson.scripts?.['release:check'] || '').includes('verify:update-feed'),
  'release:check must run update feed verification'
)

const latestYmlPath = join(releaseDir, 'latest.yml')
if (!existsSync(latestYmlPath)) {
  console.log('update feed static checks passed; release/latest.yml not generated yet')
  process.exit(0)
}

const latestYml = readFileSync(latestYmlPath, 'utf8')
assertIncludes(latestYml, `version: ${version}`, 'latest.yml package version')
assertIncludes(latestYml, 'files:', 'latest.yml files list')
assertIncludes(latestYml, 'sha512:', 'latest.yml sha512')
assertIncludes(latestYml, 'releaseDate:', 'latest.yml release date')

const installerName = `AI 开发工具箱 Setup ${version}.exe`
const installerPath = join(releaseDir, installerName)
const blockmapPath = `${installerPath}.blockmap`

assert.ok(existsSync(installerPath), `${installerName} missing`)
assert.ok(existsSync(blockmapPath), `${basename(blockmapPath)} missing`)
assert.ok(statSync(installerPath).size > 50 * 1024 * 1024, `${installerName} too small`)
assert.ok(statSync(blockmapPath).size > 1024, `${basename(blockmapPath)} too small`)
assertIncludes(latestYml, installerName, 'latest.yml installer reference')

console.log('update feed verification checks passed')

function assertIncludes(source, text, label) {
  assert.ok(source.includes(text), `${label} missing`)
}
