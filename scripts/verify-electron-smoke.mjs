import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import electronPath from 'electron'

const requiredOutputs = ['out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html']

for (const item of requiredOutputs) {
  assert.ok(existsSync(item), `missing build output: ${item}`)
  assert.ok(statSync(item).size > 0, `empty build output: ${item}`)
}

const userDataDir = mkdtempSync(join(tmpdir(), 'codexbox-electron-smoke-'))

try {
  const exitCode = await runElectronSmoke(userDataDir)
  assert.equal(exitCode, 0, `electron smoke exited with code ${exitCode}`)
} finally {
  rmSync(userDataDir, { recursive: true, force: true })
}

console.log('electron page smoke checks passed')

function runElectronSmoke(userDataDir) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      CODEXBOX_E2E_SMOKE: '1',
      CODEXBOX_E2E_USER_DATA: userDataDir,
      CODEXBOX_E2E_TIMEOUT_MS: '15000',
      ELECTRON_ENABLE_LOGGING: '1'
    }
    delete env.ELECTRON_RUN_AS_NODE

    const child = spawn(electronPath, ['.'], {
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

      reject(new Error(`Electron smoke failed with code ${code}\n${output.trim()}`))
    })
  })
}
