import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'
import { _electron as electron } from 'playwright-core'

const requiredOutputs = ['out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html']
const routes = ['/projects', '/json', '/api', '/git', '/ai-explain', '/ai-generate', '/ai-history', '/settings']
const expectedApiKeys = ['json', 'api', 'git', 'ai', 'settings', 'projects', 'updates']
const userDataDir = mkdtempSync(join(tmpdir(), 'codexbox-playwright-e2e-'))
const gitRepoDir = mkdtempSync(join(tmpdir(), 'codexbox-git-e2e-'))
const screenshotDir = join(process.cwd(), 'out', 'e2e-screenshots')

for (const item of requiredOutputs) {
  assert.ok(existsSync(item), `missing build output: ${item}; run npm.cmd run build first`)
  assert.ok(statSync(item).size > 0, `empty build output: ${item}`)
}

let electronApp
let apiServer

try {
  rmSync(screenshotDir, { recursive: true, force: true })
  mkdirSync(screenshotDir, { recursive: true })
  prepareGitFixture(gitRepoDir)
  apiServer = await startApiFixtureServer()

  const env = {
    ...process.env,
    CODEXBOX_E2E_USER_DATA: userDataDir,
    ELECTRON_ENABLE_LOGGING: '1'
  }
  delete env.ELECTRON_RUN_AS_NODE

  electronApp = await electron.launch({
    executablePath: electronPath,
    args: ['.'],
    cwd: process.cwd(),
    env
  })

  electronApp.on('console', async (message) => {
    const text = message.text()
    if (message.type() === 'error') console.error(`[electron:${message.type()}] ${text}`)
  })

  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('.nav-link')

  await assertPreloadApi(window)
  await assertOnboardingWorkflow(window)
  await assertRouteNavigation(window)
  await assertNoApiKeyState(window)
  await assertSettingsDatabasePanel(window)
  await assertJsonFormWorkflow(window)
  await assertApiWorkflow(window, apiServer.baseUrl)
  await assertGitWorkflow(window, gitRepoDir)

  console.log('playwright electron e2e checks passed')
} finally {
  if (electronApp) await electronApp.close()
  if (apiServer) await new Promise((resolve) => apiServer.server.close(resolve))
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(gitRepoDir, { recursive: true, force: true })
}

async function assertPreloadApi(window) {
  const apiKeys = await window.evaluate(() => Object.keys(window.devtoolsApi ?? {}).sort())
  for (const key of expectedApiKeys) {
    assert.ok(apiKeys.includes(key), `preload API missing: ${key}`)
  }
  assert.ok(!apiKeys.includes('geo'), 'removed Geo API should not be exposed')
}

async function assertOnboardingWorkflow(window) {
  await window.waitForSelector('.onboarding-panel')

  const panelText = await window.locator('.onboarding-panel').innerText()
  assert.match(panelText, /首次启动引导/, 'onboarding panel should expose first-run title')
  assert.match(panelText, /AI 配置缺失不会阻塞/, 'onboarding panel should explain non-blocking AI setup')
  assert.equal(await window.locator('.onboarding-step').count(), 4, 'onboarding should expose four steps')

  await window.getByRole('button', { name: /配置模型平台/ }).click()
  await window.waitForURL((url) => url.hash === '#/settings')
  await window.getByRole('button', { name: '跳过引导' }).click()
  await window.waitForFunction(() => localStorage.getItem('codexbox:onboarding-dismissed') === '1')
  assert.equal(await window.locator('.onboarding-panel').count(), 0, 'onboarding should hide after skip')

  await window.getByRole('button', { name: '重新显示首次引导' }).click()
  await window.waitForFunction(() => localStorage.getItem('codexbox:onboarding-dismissed') === null)
  await window.waitForSelector('.onboarding-panel')

  await takeScreenshot(window, 'onboarding.png')
}

async function assertRouteNavigation(window) {
  const links = await window.locator('.nav-link').evaluateAll((items) => items.map((item) => item.getAttribute('href')))
  assert.equal(links.length, routes.length, 'unexpected navigation item count')

  for (const route of routes) {
    assert.ok(
      links.some((href) => href?.endsWith(`#${route}`)),
      `navigation missing route: ${route}`
    )
    await window.locator(`.nav-link[href="#${route}"]`).click()
    await window.waitForURL((url) => url.hash === `#${route}`)
    await window.waitForSelector('.tool-panel h2')
    const panelTitle = await window.locator('.tool-panel h2').first().innerText()
    assert.ok(panelTitle.trim().length > 0, `empty tool panel title for route: ${route}`)
  }

  await takeScreenshot(window, 'routes-settings.png')
}

async function assertNoApiKeyState(window) {
  await window.locator('.nav-link[href="#/ai-generate"]').click()
  await window.waitForURL((url) => url.hash === '#/ai-generate')
  await window.waitForSelector('.status-bar')
  const status = await window.locator('.status-bar').innerText()
  assert.match(status, /API Key|模型|配置|妯″瀷|閰嶇疆/, 'AI page should expose no-key or model configuration status')
}

async function assertSettingsDatabasePanel(window) {
  await window.locator('.nav-link[href="#/settings"]').click()
  await window.waitForURL((url) => url.hash === '#/settings')
  await window.getByRole('button', { name: /数据维护|鏁版嵁缁存姢/ }).click()
  await window.waitForSelector('.database-path')

  const databasePath = await window.locator('.database-path').innerText()
  assert.match(databasePath, /Path:/, 'database panel should show database path')
  assert.match(databasePath, /Version:/, 'database panel should show schema version')
  const databaseButtons = window.locator('.database-path + .toolbar button')
  assert.equal(await databaseButtons.count(), 4, 'database panel should expose four maintenance buttons')
  for (let index = 0; index < 4; index += 1) {
    assert.equal(await databaseButtons.nth(index).isEnabled(), true, `database maintenance button ${index} disabled`)
  }
}

async function assertJsonFormWorkflow(window) {
  await window.locator('.nav-link[href="#/json"]').click()
  await window.waitForURL((url) => url.hash === '#/json')

  const source = window.locator('.tool-panel textarea').first()
  await source.fill('{"profile":{"industry":"e2e"},"items":[{"id":7}]}')
  await window.locator('.tool-header .toolbar .button').first().click()
  await window.waitForSelector('.meta-grid')

  const output = await window.locator('.output-box').first().innerText()
  assert.match(output, /"industry": "e2e"/, 'JSON formatter should render edited form data')

  await window.locator('#json-path').fill('items[0].id')
  await window.locator('#json-path').locator('xpath=following-sibling::button').click()
  const queryOutput = await window.locator('.code-box').last().innerText()
  assert.equal(queryOutput.trim(), '7', 'JSON path query should read nested array values')

  await takeScreenshot(window, 'json-form.png')
}

async function assertApiWorkflow(window, baseUrl) {
  await window.locator('.nav-link[href="#/api"]').click()
  await window.waitForURL((url) => url.hash === '#/api')
  await window.waitForSelector('.request-row')

  await window.locator('.request-row select').selectOption('GET')
  await window.locator('.request-row input').fill('{{baseUrl}}/e2e')
  await window.locator('.header-row').first().locator('input').nth(1).fill(baseUrl)
  await window.locator('.request-row button').click()
  await window.waitForSelector('.badge.success')

  await window.getByRole('button', { name: 'Body' }).click()
  const responseBody = await window.locator('.output-box').first().innerText()
  assert.match(responseBody, /"ok":\s*true/, 'API response should come from local fixture server')
  assert.match(responseBody, /"source":\s*"playwright"/, 'API response should include fixture payload')

  await takeScreenshot(window, 'api-local-request.png')
}

async function assertGitWorkflow(window, repoDir) {
  await window.locator('.nav-link[href="#/git"]').click()
  await window.waitForURL((url) => url.hash === '#/git')
  await window.locator('#git-cwd').fill(repoDir)
  await window.locator('.tool-header button.button').click()
  await window.waitForSelector('.git-change-item')

  const statusText = await window.locator('.git-change-item').first().innerText()
  assert.match(statusText, /README\.md/, 'Git status should include modified fixture file')

  await window.locator('.git-change-item .plain-list-button').first().click()
  await window.waitForSelector('.output-box')
  const diffText = await window.locator('.output-box').first().innerText()
  assert.match(diffText, /changed by playwright/, 'Git file diff should show fixture change')

  await window.locator('.tabs .tab-button').first().click()
  await window.waitForSelector('.git-change-item')
  await window.locator('.git-change-item .check-input').first().check()
  window.once('dialog', (dialog) => dialog.accept())
  await window.locator('.tool-body > .split-grid > .section').nth(1).locator('.toolbar button').nth(2).click()
  await window.waitForSelector('.git-change-item')
  const stagedText = await window.locator('.git-change-item').first().innerText()
  assert.match(stagedText, /README\.md/, 'Git staged status should still include fixture file')

  await takeScreenshot(window, 'git-fixture.png')
}

async function takeScreenshot(window, name) {
  const target = join(screenshotDir, name)
  await window.screenshot({ path: target, fullPage: true })
  assert.ok(existsSync(target), `screenshot not written: ${target}`)
  assert.ok(statSync(target).size > 0, `empty screenshot: ${target}`)
}

function prepareGitFixture(repoDir) {
  execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'e2e@example.com'], { cwd: repoDir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'Codex E2E'], { cwd: repoDir, stdio: 'ignore' })
  writeFileSync(join(repoDir, 'README.md'), 'initial\n', 'utf8')
  execFileSync('git', ['add', 'README.md'], { cwd: repoDir, stdio: 'ignore' })
  execFileSync('git', ['commit', '-m', 'test: initial fixture'], { cwd: repoDir, stdio: 'ignore' })
  writeFileSync(join(repoDir, 'README.md'), 'initial\nchanged by playwright\n', 'utf8')
}

function startApiFixtureServer() {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true, source: 'playwright', path: request.url }))
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      assert.ok(address && typeof address === 'object', 'fixture server address missing')
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` })
    })
  })
}
