<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Bot, Clipboard, RefreshCw, Search, Square, Trash2 } from 'lucide-vue-next'
import type { AiHistoryItem, AiTaskType } from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'
import { renderMarkdown } from '../markdown'
import { safeLoad } from '../safeLoad'
import { showToast } from '../toast'

const taskOptions: Array<{ value: AiTaskType | 'all'; label: string }> = [
  { value: 'all', label: '全部任务' },
  { value: 'explain-code', label: '代码解释' },
  { value: 'generate-code', label: '代码生成' },
  { value: 'api-debug', label: 'API 分析' },
  { value: 'git-summary', label: 'Git 变更说明' },
  { value: 'commit-message', label: 'Commit Message' }
]

const histories = ref<AiHistoryItem[]>([])
const selectedTaskType = ref<AiTaskType | 'all'>('all')
const keyword = ref('')
const selectedItem = ref<AiHistoryItem | null>(null)
const output = ref('')
const activeRequestId = ref('')
const loading = ref(false)
const status = ref('正在读取 AI 历史')
const statusType = ref<'idle' | 'success' | 'error'>('idle')

const filteredHistories = computed(() => {
  const lowerKeyword = keyword.value.trim().toLowerCase()
  return histories.value.filter((item) => {
    const taskMatched = selectedTaskType.value === 'all' || item.taskType === selectedTaskType.value
    if (!taskMatched) return false
    if (!lowerKeyword) return true
    return [item.title, item.prompt, item.output, item.model, item.taskType].some((value) => value.toLowerCase().includes(lowerKeyword))
  })
})
const renderedSelectedOutput = computed(() => renderMarkdown(selectedItem.value?.output ?? ''))
const renderedOutput = computed(() => renderMarkdown(output.value))
const selectedTaskLabel = computed(() => taskOptions.find((item) => item.value === selectedTaskType.value)?.label ?? '全部任务')

async function loadHistories(): Promise<void> {
  histories.value = await devtoolsApi.ai.getHistory()
  selectedItem.value = histories.value[0] ?? null
  status.value = `已读取 ${histories.value.length} 条 AI 历史`
  statusType.value = 'success'
}

function selectHistory(item: AiHistoryItem): void {
  selectedItem.value = item
  output.value = ''
  status.value = `已选中 ${item.title}`
  statusType.value = 'idle'
}

async function copySelectedPrompt(): Promise<void> {
  if (!selectedItem.value) return
  await navigator.clipboard.writeText(selectedItem.value.prompt)
  showToast('Prompt 已复制', 'success')
}

async function copySelectedOutput(): Promise<void> {
  if (!selectedItem.value) return
  await navigator.clipboard.writeText(selectedItem.value.output)
  showToast('输出已复制', 'success')
}

async function copyRerunOutput(): Promise<void> {
  if (!output.value) return
  await navigator.clipboard.writeText(output.value)
  showToast('重新执行输出已复制', 'success')
}

async function deleteSelected(): Promise<void> {
  if (!selectedItem.value) return
  histories.value = await devtoolsApi.ai.deleteHistory(selectedItem.value.id)
  selectedItem.value = filteredHistories.value[0] ?? histories.value[0] ?? null
  status.value = '历史记录已删除'
  statusType.value = 'success'
  showToast(status.value, 'success')
}

async function clearFiltered(): Promise<void> {
  if (!filteredHistories.value.length) return
  if (!window.confirm(`确认清空当前筛选结果中的 ${filteredHistories.value.length} 条 AI 历史？`)) return
  if (selectedTaskType.value === 'all' && !keyword.value.trim()) {
    histories.value = await devtoolsApi.ai.clearHistory()
  } else if (selectedTaskType.value !== 'all' && !keyword.value.trim()) {
    await devtoolsApi.ai.clearHistory(selectedTaskType.value)
    histories.value = await devtoolsApi.ai.getHistory()
  } else {
    await Promise.all(filteredHistories.value.map((item) => devtoolsApi.ai.deleteHistory(item.id)))
    histories.value = await devtoolsApi.ai.getHistory()
  }
  selectedItem.value = filteredHistories.value[0] ?? histories.value[0] ?? null
  status.value = '筛选范围内的历史已清空'
  statusType.value = 'success'
  showToast(status.value, 'success')
}

async function rerunSelected(): Promise<void> {
  if (!selectedItem.value) return
  loading.value = true
  output.value = ''
  status.value = '重新执行中'
  statusType.value = 'idle'

  const source = selectedItem.value
  const stream = await devtoolsApi.ai.generateTextStream({
    taskType: source.taskType,
    prompt: source.prompt
  }, (event) => {
    if (event.type === 'chunk') {
      output.value += event.text
      return
    }

    if (event.type === 'done') {
      loading.value = false
      activeRequestId.value = ''
      status.value = `重新执行完成 · ${event.model}`
      statusType.value = 'success'
      showToast(status.value, 'success')
      void saveRerunHistory(source, event.model)
      return
    }

    if (event.type === 'canceled') {
      loading.value = false
      activeRequestId.value = ''
      status.value = '已停止重新执行'
      statusType.value = 'idle'
      showToast(status.value, 'info')
      return
    }

    loading.value = false
    activeRequestId.value = ''
    output.value = event.error
    status.value = event.error
    statusType.value = 'error'
    showToast(status.value, 'error')
  })

  activeRequestId.value = stream.requestId
}

async function saveRerunHistory(source: AiHistoryItem, model: string): Promise<void> {
  if (!output.value.trim()) return
  histories.value = await devtoolsApi.ai.saveHistory({
    taskType: source.taskType,
    title: `${source.title}（重新执行）`.slice(0, 60),
    prompt: source.prompt,
    output: output.value,
    model
  })
  selectedItem.value = histories.value[0] ?? selectedItem.value
}

async function stopRerun(): Promise<void> {
  if (!activeRequestId.value) return
  await devtoolsApi.ai.cancelStream(activeRequestId.value)
}

onMounted(() => {
  void safeLoad('读取 AI 历史中心', loadHistories)
})
</script>

<template>
  <section class="tool-panel">
    <header class="tool-header">
      <div class="tool-title">
        <h2>AI 历史中心</h2>
        <p>统一检索、查看、复制、删除和重新执行 AI 历史记录。</p>
      </div>
      <div class="toolbar">
        <span class="pill">{{ selectedTaskLabel }} · {{ filteredHistories.length }}</span>
        <button class="button secondary" type="button" @click="loadHistories">
          <RefreshCw :size="16" />
          刷新
        </button>
        <button class="button secondary" type="button" :disabled="!filteredHistories.length" @click="clearFiltered">
          <Trash2 :size="16" />
          清空筛选
        </button>
      </div>
    </header>

    <div class="tool-body">
      <div class="split-grid">
        <div class="section">
          <div class="request-row">
            <label class="select-field">
              <span>任务类型</span>
              <select v-model="selectedTaskType" class="select">
                <option v-for="item in taskOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
            <div class="field">
              <label for="history-keyword">搜索</label>
              <input id="history-keyword" v-model="keyword" class="input" placeholder="标题、Prompt、输出、模型" />
            </div>
            <button class="button secondary" type="button" @click="keyword = ''">
              <Search :size="16" />
              重置
            </button>
          </div>

          <div class="history-list ai-history-center-list">
            <button
              v-for="item in filteredHistories"
              :key="item.id"
              class="list-item history-center-item"
              :class="{ active: selectedItem?.id === item.id }"
              type="button"
              @click="selectHistory(item)"
            >
              <span class="badge">{{ taskOptions.find((option) => option.value === item.taskType)?.label ?? item.taskType }}</span>
              <strong>{{ item.title }}</strong>
              <small>{{ item.model }} · {{ new Date(item.createdAt).toLocaleString() }}</small>
            </button>
            <div v-if="!filteredHistories.length" class="empty-state compact-empty">暂无匹配历史</div>
          </div>
        </div>

        <div class="section">
          <template v-if="selectedItem">
            <div class="meta-row">
              <Bot :size="16" />
              <strong>{{ selectedItem.title }}</strong>
              <span class="badge">{{ selectedItem.taskType }}</span>
            </div>

            <div class="toolbar">
              <button class="button secondary" type="button" @click="copySelectedPrompt">
                <Clipboard :size="16" />
                复制 Prompt
              </button>
              <button class="button secondary" type="button" @click="copySelectedOutput">
                <Clipboard :size="16" />
                复制输出
              </button>
              <button class="button" type="button" :disabled="loading" @click="rerunSelected">
                <Bot :size="16" />
                {{ loading ? '执行中' : '重新执行' }}
              </button>
              <button v-if="loading" class="button secondary" type="button" @click="stopRerun">
                <Square :size="16" />
                停止
              </button>
              <button class="button secondary" type="button" @click="deleteSelected">
                <Trash2 :size="16" />
                删除
              </button>
            </div>

            <div class="history-detail-grid inline-history-detail">
              <div class="section">
                <div class="meta-row">
                  <strong>Prompt</strong>
                </div>
                <pre class="output-box history-center-box">{{ selectedItem.prompt }}</pre>
              </div>
              <div class="section">
                <div class="meta-row">
                  <strong>历史输出</strong>
                </div>
                <div class="output-box markdown-output history-center-box" v-html="renderedSelectedOutput"></div>
              </div>
            </div>

            <div v-if="output" class="section">
              <div class="meta-row">
                <strong>重新执行输出</strong>
                <button class="button secondary compact-button" type="button" @click="copyRerunOutput">复制</button>
              </div>
              <div class="output-box markdown-output ai-output-scroll git-ai-output" v-html="renderedOutput"></div>
            </div>
          </template>

          <div v-else class="empty-state">选择一条历史查看详情</div>
        </div>
      </div>
    </div>

    <footer class="status-bar" :class="statusType">{{ status }}</footer>
  </section>
</template>
