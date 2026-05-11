import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const packagedExe = join(process.cwd(), 'release', 'win-unpacked', 'AI 开发工具箱.exe')
const appAsar = join(process.cwd(), 'release', 'win-unpacked', 'resources', 'app.asar')
const userDataDir = mkdtempSync(join(tmpdir(), 'codexbox-packaged-smoke-'))

assert.ok(existsSync(packagedExe), `missing packaged executable: ${packagedExe}; run npm.cmd run pack first`)
assert.ok(statSync(packagedExe).size > 0, `empty packaged executable: ${packagedExe}`)
assert.ok(existsSync(appAsar), `missing packaged app archive: ${appAsar}; run npm.cmd run pack first`)
assert.ok(statSync(appAsar).size > 0, `empty packaged app archive: ${appAsar}`)

try {
  const exitCode = await runPackagedSmoke()
  assert.equal(exitCode, 0, `packaged smoke exited with code ${exitCode}`)
} finally {
  rmSync(userDataDir, { recursive: true, force: true })
}

console.log('packaged electron smoke checks passed')

function runPackagedSmoke() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      CODEXBOX_E2E_SMOKE: '1',
      CODEXBOX_E2E_USER_DATA: userDataDir,
      CODEXBOX_E2E_TIMEOUT_MS: '20000',
      ELECTRON_ENABLE_LOGGING: '1'
    }
    delete env.ELECTRON_RUN_AS_NODE

    const child = spawn(packagedExe, [], {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    let output = ''

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(code)
        return
      }

      reject(new Error(`Packaged Electron smoke failed with code ${code}\n${output.trim()}`))
    })
  })
}
