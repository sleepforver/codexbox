<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Clipboard, Download, FileUp, MapPinned, Play, RefreshCw, Trash2 } from 'lucide-vue-next'
import type { GeoAnalyzeHistoryItem, GeoAnalyzeResponse, WorkspaceProject } from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'
import { isGeoAnalyzeError } from '../ipcGuards'
import { safeLoad } from '../safeLoad'
import { showToast } from '../toast'
import { showOperationError } from '../dbFeedback'

const sample = JSON.stringify(
  {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { featureId: 'P001', datasetName: '示例数据集', category: 'point' },
        geometry: { type: 'Point', coordinates: [120.134, 30.264] }
      },
      {
        type: 'Feature',
        properties: { featureId: 'L001', datasetName: '示例数据集', category: 'line', startRef: 'P001' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [120.134, 30.264],
            [120.141, 30.278]
          ]
        }
      }
    ]
  },
  null,
  2
)

const fieldTemplates = [
  { value: 'basic', label: '基础要素', title: 'GeoJSON 数据体检', fields: 'featureId,datasetName,geometry' },
  { value: 'point', label: '点要素', title: '点要素 GeoJSON 体检', fields: 'featureId,datasetName,category,geometry' },
  { value: 'line', label: '线要素', title: '线要素 GeoJSON 体检', fields: 'featureId,datasetName,category,geometry' },
  { value: 'ledger', label: '综合数据', title: '地理数据质量体检', fields: 'featureId,datasetName,category,geometry' }
]

const source = ref(sample)
const selectedFieldTemplate = ref('basic')
const requiredProperties = ref('featureId,datasetName,geometry')
const reportTitle = ref('示例 GeoJSON 体检')
const projects = ref<WorkspaceProject[]>([])
const selectedProjectId = ref('')
const histories = ref<GeoAnalyzeHistoryItem[]>([])
const result = ref<GeoAnalyzeResponse | null>(null)
const loading = ref(false)
const status = ref('等待分析 GeoJSON')
const statusType = ref<'idle' | 'success' | 'error'>('idle')

const requiredList = computed(() =>
  requiredProperties.value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
)
const selectedProjectLabel = computed(() => {
  if (!selectedProjectId.value) return '全部项目'
  return projects.value.find((item) => item.id === selectedProjectId.value)?.name ?? '未知项目'
})
const successfulResult = computed(() => (result.value?.ok ? result.value : null))

function getProjectName(projectId?: string): string {
  if (!projectId) return '未关联项目'
  return projects.value.find((item) => item.id === projectId)?.name ?? '未知项目'
}

async function loadProjects(): Promise<void> {
  projects.value = await devtoolsApi.projects.list()
  selectedProjectId.value = selectedProjectId.value || projects.value[0]?.id || ''
}

async function loadHistories(): Promise<void> {
  histories.value = await devtoolsApi.geo.getHistory(selectedProjectId.value || undefined)
}

async function handleProjectChange(): Promise<void> {
  await loadHistories()
  status.value = `已切换到 ${selectedProjectLabel.value}`
  statusType.value = 'idle'
}

async function analyze(): Promise<void> {
  loading.value = true
  result.value = await devtoolsApi.geo.analyze({
    source: source.value,
    requiredProperties: requiredList.value,
    projectId: selectedProjectId.value || undefined,
    title: reportTitle.value
  })
  loading.value = false

  if (isGeoAnalyzeError(result.value)) {
    status.value = result.value.error
    statusType.value = 'error'
    showToast(status.value, 'error')
    return
  }

  await loadHistories()
  status.value = `分析完成，发现 ${result.value.issues.length} 个问题`
  statusType.value = 'success'
  showToast(status.value, 'success')
}

function loadSample(): void {
  source.value = sample
  selectedFieldTemplate.value = 'basic'
  requiredProperties.value = 'featureId,datasetName,geometry'
  reportTitle.value = '示例 GeoJSON 体检'
  status.value = '已载入示例 GeoJSON'
  statusType.value = 'idle'
}

async function loadGeoJsonFile(): Promise<void> {
  const file = await devtoolsApi.geo.loadSourceFile()
  if (!file) return
  source.value = file.source
  reportTitle.value =
    file.path
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.(geo)?json$/i, '') || 'GeoJSON 体检'
  status.value = `已载入文件：${file.path}`
  statusType.value = 'idle'
}

function applyFieldTemplate(): void {
  const template = fieldTemplates.find((item) => item.value === selectedFieldTemplate.value)
  if (!template) return
  requiredProperties.value = template.fields
  reportTitle.value = template.title
  status.value = `已应用${template.label}字段模板`
  statusType.value = 'idle'
}

async function copyReport(): Promise<void> {
  if (!result.value) return
  await navigator.clipboard.writeText(JSON.stringify(result.value, null, 2))
  showToast('分析报告已复制', 'success')
}

async function exportReport(format: 'json' | 'markdown'): Promise<void> {
  if (!successfulResult.value) return
  status.value = '正在导出地理数据体检报告'
  statusType.value = 'idle'
  try {
    const exportResult = await devtoolsApi.geo.exportReport(
      {
        title: reportTitle.value || 'GeoJSON 体检报告',
        projectName: selectedProjectLabel.value,
        result: successfulResult.value
      },
      format
    )
    if (!exportResult) {
      status.value = '已取消导出地理数据体检报告'
      statusType.value = 'idle'
      return
    }
    status.value = exportResult.message
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = showOperationError(error, '导出地理数据体检报告失败')
    statusType.value = 'error'
  }
}

function selectHistory(item: GeoAnalyzeHistoryItem): void {
  source.value = item.source
  requiredProperties.value = item.requiredProperties.join(',')
  reportTitle.value = item.title
  result.value = item.result
  status.value = `已载入历史报告：${item.title}`
  statusType.value = 'idle'
}

async function deleteHistory(item: GeoAnalyzeHistoryItem): Promise<void> {
  try {
    await devtoolsApi.geo.deleteHistory(item.id)
    await loadHistories()
    status.value = '地理体检历史已删除'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = showOperationError(error, '删除地理体检历史失败')
    statusType.value = 'error'
  }
}

async function clearHistory(): Promise<void> {
  if (!histories.value.length) return
  if (!window.confirm(`确认清空 ${selectedProjectLabel.value} 的 ${histories.value.length} 条地理体检历史？`)) return
  try {
    histories.value = await devtoolsApi.geo.clearHistory(selectedProjectId.value || undefined)
    status.value = '地理体检历史已清空'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    status.value = showOperationError(error, '清空地理体检历史失败')
    statusType.value = 'error'
  }
}

onMounted(() => {
  void safeLoad('读取地理数据体检历史', async () => {
    await loadProjects()
    await loadHistories()
  })
})
</script>

<template>
  <section class="tool-panel">
    <header class="tool-header">
      <div class="tool-title">
        <h2>地理数据体检</h2>
        <p>检查 GeoJSON 要素数量、几何类型、坐标范围、必填属性和通用数据质量问题。</p>
      </div>
      <div class="toolbar">
        <span class="pill">{{ selectedProjectLabel }} · {{ histories.length }} 条历史</span>
        <button class="button secondary" type="button" @click="loadSample">
          <RefreshCw :size="16" />
          示例
        </button>
        <button class="button secondary" type="button" @click="loadGeoJsonFile">
          <FileUp :size="16" />
          导入文件
        </button>
        <button class="button secondary" type="button" :disabled="!result" @click="copyReport">
          <Clipboard :size="16" />
          复制报告
        </button>
        <button class="button secondary" type="button" :disabled="!successfulResult" @click="exportReport('markdown')">
          <Download :size="16" />
          导出报告
        </button>
        <button class="button" type="button" :disabled="loading || !source" @click="analyze">
          <Play :size="16" />
          {{ loading ? '分析中' : '开始分析' }}
        </button>
      </div>
    </header>

    <div class="tool-body">
      <div class="split-grid">
        <div class="section">
          <div class="request-row geo-input-row">
            <label class="select-field">
              <span>项目</span>
              <select v-model="selectedProjectId" class="select" @change="handleProjectChange">
                <option value="">全部项目</option>
                <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
              </select>
            </label>
            <div class="field">
              <label for="geo-report-title">报告名称</label>
              <input id="geo-report-title" v-model="reportTitle" class="input" placeholder="例如：示例 GeoJSON 体检" />
            </div>
          </div>
          <div class="field">
            <label for="required-properties">必填属性</label>
            <div class="inline-row">
              <select v-model="selectedFieldTemplate" class="select select-compact" @change="applyFieldTemplate">
                <option v-for="template in fieldTemplates" :key="template.value" :value="template.value">
                  {{ template.label }}
                </option>
              </select>
              <input
                id="required-properties"
                v-model="requiredProperties"
                class="input"
                placeholder="featureId,datasetName,category"
              />
            </div>
          </div>
          <label class="badge" for="geo-source">GeoJSON 输入</label>
          <textarea id="geo-source" v-model="source" class="textarea" spellcheck="false" />
        </div>

        <div class="section">
          <template v-if="result?.ok">
            <div class="meta-grid">
              <div class="metric">
                <span>要素数</span><strong>{{ result.featureCount }}</strong>
              </div>
              <div class="metric">
                <span>问题数</span><strong>{{ result.issues.length }}</strong>
              </div>
              <div class="metric">
                <span>几何类型</span><strong>{{ result.geometryTypes.length }}</strong>
              </div>
              <div class="metric">
                <span>坐标范围</span><strong>{{ result.bounds ? '已计算' : '?' }}</strong>
              </div>
            </div>

            <div class="section">
              <div class="meta-row">
                <MapPinned :size="16" />
                <strong>几何类型统计</strong>
              </div>
              <div class="history-list">
                <div v-for="item in result.geometryTypes" :key="item.type" class="list-item">
                  <strong>{{ item.type }}</strong>
                  <small>{{ item.count }} 个要素</small>
                </div>
              </div>
            </div>

            <pre v-if="result.bounds" class="code-box">{{ JSON.stringify(result.bounds, null, 2) }}</pre>

            <div class="section">
              <strong>校验问题</strong>
              <div v-if="result.issues.length" class="history-list">
                <div v-for="issue in result.issues" :key="`${issue.path}:${issue.message}`" class="list-item">
                  <span class="badge" :class="issue.level === 'error' ? 'danger' : 'warning'">{{ issue.level }}</span>
                  <strong>{{ issue.path }}</strong>
                  <small>{{ issue.message }}</small>
                </div>
              </div>
              <div v-else class="empty-state">未发现问题</div>
            </div>
          </template>

          <pre v-else-if="result && !result.ok" class="output-box">{{ result.error }}</pre>
          <div v-else class="empty-state">分析结果会显示在这里</div>

          <div class="section">
            <div class="meta-row">
              <MapPinned :size="16" />
              <strong>体检历史</strong>
              <button
                class="button secondary compact-button"
                type="button"
                :disabled="!histories.length"
                @click="clearHistory"
              >
                <Trash2 :size="14" />
                清空
              </button>
            </div>
            <div v-if="histories.length" class="history-list compact-history">
              <div v-for="item in histories" :key="item.id" class="list-item action-item">
                <button class="plain-list-button" type="button" @click="selectHistory(item)">
                  <strong>{{ item.title }}</strong>
                  <small>
                    {{ getProjectName(item.projectId) }} · {{ item.featureCount }} 个要素 · {{ item.issueCount }} 个问题
                    ·
                    {{ new Date(item.createdAt).toLocaleString() }}
                  </small>
                </button>
                <button class="icon-button" type="button" title="删除历史" @click="deleteHistory(item)">
                  <Trash2 :size="16" />
                </button>
              </div>
            </div>
            <div v-else class="empty-state compact-empty">暂无地理体检历史</div>
          </div>
        </div>
      </div>
    </div>

    <footer class="status-bar" :class="statusType" role="status" aria-live="polite">{{ status }}</footer>
  </section>
</template>
