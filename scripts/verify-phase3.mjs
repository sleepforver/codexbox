import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(path, 'utf8')
}

function assertIncludes(path, text, label = text) {
  assert.ok(read(path).includes(text), `${path} missing ${label}`)
}

assertIncludes('electron/main/db/migrations.ts', "schema_version', '7", 'schema version 7 migration')
assertIncludes('electron/main/db/schema.ts', 'is_favorite INTEGER NOT NULL DEFAULT 0')
assertIncludes('electron/main/db/schema.ts', 'PRIMARY KEY (project_id, key)')
assertIncludes('electron/main/ipc/registerSettingsIpc.ts', 'details.push')
assertIncludes('src/renderer/views/ProjectWorkspace.vue', '最近导入明细')
assertIncludes('src/renderer/views/AiExplain.vue', 'loadContextFile')
assertIncludes('src/renderer/views/AiGenerate.vue', 'loadContextFile')
assertIncludes('src/renderer/views/GitAssistant.vue', 'reviewBeforeCommit')
assertIncludes('src/renderer/views/SettingsView.vue', '保存项目默认模板')
assertIncludes('src/renderer/App.vue', 'handleShortcut')
assertIncludes('src/renderer/styles.css', '@media (max-width: 980px)')
assertIncludes('docs/phase3-plan.md', '已支持 AI 上下文文件导入')
assertIncludes('docs/phase3-plan.md', '已支持提交前 AI 审查 diff')
assertIncludes('docs/phase3-plan.md', '已支持多模型平台配置')
assertIncludes('docs/phase3-plan.md', '已支持相对路径接口统一保留 `{{baseUrl}}` 前缀')
assertIncludes('src/renderer/views/ApiTester.vue', 'withBaseUrlPlaceholder')
assertIncludes('src/renderer/views/ApiTester.vue', 'savedRequestGroups')
assertIncludes('src/renderer/views/SettingsView.vue', 'providerOptions')
assertIncludes('electron/main/services/settings.ts', 'writeEnvValues')
assert.ok(!read('.env.example').includes('_MODEL='), '.env.example should not define model env variables')

assert.ok(existsSync('scripts/verify-build.mjs'), 'build verification script missing')

console.log('phase3 verification checks passed')
