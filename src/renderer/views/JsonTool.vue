<script setup lang="ts">
import { computed, ref } from 'vue'
import { CheckCircle2, Clipboard, Eraser, FileJson2, Minimize2, Search, Wand2 } from 'lucide-vue-next'
import type { JsonIndent, JsonMetadata, JsonTransformMode } from '../../shared/ipc'
import { isJsonQueryError, isJsonTransformError } from '../ipcGuards'
import { showToast } from '../toast'

const sample =
  '{\n  "name": "devtools-codex",\n  "modules": ["json", "api", "git", "ai"],\n  "profile": {\n    "industry": "general-devtools",\n    "enabled": true\n  }\n}'
const source = ref(sample)
const output = ref('')
const queryPath = ref('profile.industry')
const queryOutput = ref('')
const indent = ref<JsonIndent>(2)
const status = ref('等待处理')
const statusType = ref<'idle' | 'success' | 'error'>('idle')
const metadata = ref<JsonMetadata | null>(null)

const rootLabel = computed(() => {
  if (!metadata.value) return '-'
  return metadata.value.rootType === 'object' ? '对象' : metadata.value.rootType === 'array' ? '数组' : '原始值'
})

async function transform(mode: JsonTransformMode): Promise<void> {
  const result = await window.devtoolsApi.json.transform({
    source: source.value,
    mode,
    indent: indent.value
  })

  if (isJsonTransformError(result)) {
    metadata.value = null
    status.value = result.error
    if (result.column) {
      status.value = `${result.error}，位置 ${result.column}`
    }
    statusType.value = 'error'
    showToast(status.value, 'error')
    return
  }

  output.value = result.output
  metadata.value = result.metadata
  status.value = mode === 'validate' ? 'JSON 校验通过' : mode === 'minify' ? '压缩完成' : '格式化完成'
  statusType.value = 'success'
  showToast(status.value, 'success')
}

async function queryJson(): Promise<void> {
  const result = await window.devtoolsApi.json.query({
    source: source.value,
    path: queryPath.value
  })

  if (isJsonQueryError(result)) {
    queryOutput.value = ''
    status.value = result.error
    statusType.value = 'error'
    showToast(status.value, 'error')
    return
  }

  queryOutput.value = result.output
  if (result.matched) {
    status.value = '路径查询完成'
    statusType.value = 'success'
    showToast(status.value, 'success')
    return
  }

  status.value = '路径未匹配'
  statusType.value = 'error'
  showToast(status.value, 'error')
}

async function copyOutput(): Promise<void> {
  const text = output.value || queryOutput.value
  if (!text) return
  await navigator.clipboard.writeText(text)
  status.value = '结果已复制到剪贴板'
  statusType.value = 'success'
  showToast(status.value, 'success')
}

function clearAll(): void {
  source.value = ''
  output.value = ''
  queryOutput.value = ''
  metadata.value = null
  status.value = '已清空'
  statusType.value = 'idle'
}

function loadSample(): void {
  source.value = sample
  queryPath.value = 'profile.industry'
  status.value = '已载入示例 JSON'
  statusType.value = 'idle'
}
</script>

<template>
  <section class="tool-panel">
    <header class="tool-header">
      <div class="tool-title">
        <h2>JSON 格式化与查询</h2>
        <p>支持格式化、压缩、校验、路径查询、复制和结构元信息查看。</p>
      </div>
      <div class="toolbar">
        <label class="select-field">
          <span>缩进</span>
          <select v-model="indent" class="select select-compact" aria-label="缩进设置">
            <option :value="2">2 空格</option>
            <option :value="4">4 空格</option>
            <option value="tab">Tab</option>
          </select>
        </label>
        <button class="button" type="button" @click="transform('format')">
          <Wand2 :size="16" />
          格式化
        </button>
        <button class="button secondary" type="button" @click="transform('minify')">
          <Minimize2 :size="16" />
          压缩
        </button>
        <button class="button secondary" type="button" @click="transform('validate')">
          <CheckCircle2 :size="16" />
          校验
        </button>
      </div>
    </header>

    <div class="tool-body">
      <div class="split-grid">
        <div class="section">
          <div class="toolbar">
            <span class="badge">输入</span>
            <button class="button secondary" type="button" @click="loadSample">示例</button>
            <button class="button secondary" type="button" @click="clearAll">
              <Eraser :size="16" />
              清空
            </button>
          </div>
          <textarea v-model="source" class="textarea" spellcheck="false" />

          <div class="field">
            <label for="json-path">路径查询</label>
            <div class="inline-row">
              <input id="json-path" v-model="queryPath" class="input" placeholder="profile.industry ? modules[0]" />
              <button class="button secondary" type="button" @click="queryJson">
                <Search :size="16" />
                查询
              </button>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="toolbar">
            <span class="badge">输出</span>
            <button class="button secondary" type="button" :disabled="!output && !queryOutput" @click="copyOutput">
              <Clipboard :size="16" />
              复制
            </button>
          </div>
          <pre v-if="output" class="output-box">{{ output }}</pre>
          <div v-else class="empty-state">
            <div>
              <FileJson2 :size="30" />
              <p>处理结果会显示在这里</p>
            </div>
          </div>

          <pre v-if="queryOutput" class="code-box">{{ queryOutput }}</pre>

          <div v-if="metadata" class="meta-grid">
            <div class="metric">
              <span>根类型</span><strong>{{ rootLabel }}</strong>
            </div>
            <div class="metric">
              <span>字符数</span><strong>{{ metadata.characters }}</strong>
            </div>
            <div class="metric">
              <span>行数</span><strong>{{ metadata.lines }}</strong>
            </div>
            <div class="metric">
              <span>顶层数量</span><strong>{{ metadata.topLevelKeys }}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="status-bar" :class="statusType" role="status" aria-live="polite">
      {{ status }}
    </footer>
  </section>
</template>
