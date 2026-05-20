import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(path, 'utf8')
}

function assertIncludes(path, text, label = text) {
  assert.ok(read(path).includes(text), `${path} missing ${label}`)
}

function assertNotIncludes(path, text, label = text) {
  assert.ok(!read(path).includes(text), `${path} still contains ${label}`)
}

const expectedRoutes = [
  '/projects',
  '/project-agents',
  '/project-knowledge',
  '/json',
  '/api',
  '/git',
  '/ai-explain',
  '/ai-generate',
  '/ai-history',
  '/settings'
]
const routesSource = read('src/renderer/routes.ts')
const appSource = read('src/renderer/App.vue')

for (const route of expectedRoutes) {
  assert.ok(routesSource.includes(`path: '${route}'`), `route ${route} missing`)
  assert.ok(appSource.includes(`path: '${route}'`), `nav ${route} missing`)
}

assertNotIncludes('src/renderer/routes.ts', "'/geo'", 'Geo route')
assertNotIncludes('src/renderer/App.vue', "'/geo'", 'Geo nav item')
assertNotIncludes('electron/preload/index.ts', 'geo:', 'Geo preload API')
assertNotIncludes('electron/main/ipc/registerIpcHandlers.ts', 'registerGeoIpc', 'Geo IPC registration')
assertNotIncludes('src/shared/ipc.ts', 'GeoAnalyze', 'Geo shared IPC types')

assert.ok(!existsSync('src/renderer/views/GeoPowerTool.vue'), 'GeoPowerTool.vue should be removed')
assert.ok(!existsSync('electron/main/ipc/registerGeoIpc.ts'), 'registerGeoIpc.ts should be removed')
assert.ok(!existsSync('electron/main/services/geo.ts'), 'geo service should be removed')
assert.ok(!existsSync('electron/main/db/repositories/geoRepository.ts'), 'geo repository should be removed')

assertIncludes('src/renderer/views/SettingsView.vue', 'getDatabaseInfo', 'settings database read path')
assertIncludes('src/renderer/views/SettingsView.vue', 'loadUpdateInfo', 'settings update info path')
assertIncludes('src/renderer/App.vue', 'codexbox:onboarding-dismissed', 'first-run onboarding persistence')
assertIncludes('src/renderer/App.vue', 'onboardingSteps', 'first-run onboarding steps')
assertIncludes('src/renderer/App.vue', 'showOnboarding', 'first-run onboarding visibility')
assertIncludes('src/renderer/App.vue', '跳过引导', 'first-run onboarding skip action')
assertIncludes('src/renderer/App.vue', 'codexbox:onboarding-reset', 'first-run onboarding reset event')
assertIncludes('src/renderer/views/SettingsView.vue', '重新显示首次引导', 'settings onboarding reset action')
assertIncludes('electron/main/ipc/registerIpcHandlers.ts', 'registerUpdateIpc', 'update IPC registration')
assertIncludes('electron/preload/index.ts', 'updates:', 'update preload API')
assertIncludes('src/shared/ipc.ts', 'UpdateCheckResponse', 'update shared IPC types')
assertIncludes('src/renderer/views/ProjectWorkspace.vue', 'previewProjectPackageImport', 'project package preview path')
assertIncludes('src/renderer/views/ApiTester.vue', 'discoverRequests', 'API discovery path')
assertIncludes('src/renderer/views/GitAssistant.vue', 'reviewBeforeCommit', 'Git review path')
assertIncludes('src/renderer/views/AiExplain.vue', 'loadContextFile', 'AI explain context path')
assertIncludes('src/renderer/views/AiGenerate.vue', 'loadContextFile', 'AI generate context path')
assertIncludes('src/renderer/views/AiExplain.vue', '尚未配置模型平台 API Key', 'AI explain no-key guidance')
assertIncludes('src/renderer/views/AiGenerate.vue', '尚未配置模型平台 API Key', 'AI generate no-key guidance')
assertIncludes('src/renderer/views/AiExplain.vue', 'openSettings', 'AI explain settings shortcut')
assertIncludes('src/renderer/views/AiGenerate.vue', 'openSettings', 'AI generate settings shortcut')
assertIncludes('package.json', '"playwright-core"', 'Playwright Electron dependency')
assertIncludes('package.json', '"verify:e2e"', 'Playwright Electron verification command')
assertIncludes('scripts/verify-playwright-electron.mjs', '_electron', 'Playwright Electron launcher')
assertIncludes('scripts/verify-playwright-electron.mjs', 'CODEXBOX_E2E_USER_DATA', 'isolated Electron userData')
assertIncludes('scripts/verify-playwright-electron.mjs', 'assertRouteNavigation', 'route click coverage')
assertIncludes(
  'scripts/verify-playwright-electron.mjs',
  'assertOnboardingWorkflow',
  'first-run onboarding click coverage'
)
assertIncludes('scripts/verify-playwright-electron.mjs', 'onboarding.png', 'first-run onboarding screenshot')
assertIncludes('scripts/verify-playwright-electron.mjs', 'assertSettingsDatabasePanel', 'settings database coverage')
assertIncludes('scripts/verify-playwright-electron.mjs', "'updates'", 'updates preload coverage')
assertIncludes('scripts/verify-playwright-electron.mjs', 'e2e-screenshots', 'screenshot artifact path')
assertIncludes('scripts/verify-playwright-electron.mjs', 'assertJsonFormWorkflow', 'complex JSON form coverage')
assertIncludes('scripts/verify-playwright-electron.mjs', 'startApiFixtureServer', 'local API fixture coverage')
assertIncludes('scripts/verify-playwright-electron.mjs', 'assertGitWorkflow', 'Git fixture coverage')
assertIncludes('scripts/verify-playwright-electron.mjs', 'prepareGitFixture', 'temporary Git repository fixture')
assertIncludes('package.json', '"verify:packaged-smoke"', 'packaged smoke verification command')
assertIncludes('scripts/verify-packaged-smoke.mjs', 'release', 'packaged release path')
assertIncludes('scripts/verify-packaged-smoke.mjs', 'win-unpacked', 'unpacked release path')
assertIncludes('scripts/verify-packaged-smoke.mjs', 'CODEXBOX_E2E_SMOKE', 'packaged smoke mode')
assertIncludes('scripts/verify-packaged-smoke.mjs', 'CODEXBOX_E2E_USER_DATA', 'packaged isolated userData')

console.log('e2e readiness verification checks passed')
