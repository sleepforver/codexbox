<script setup lang="ts">
import { computed, ref } from 'vue'
import { Clipboard, MapPinned, Play, RefreshCw } from 'lucide-vue-next'
import type { GeoAnalyzeResponse } from '../../shared/ipc'
import { isGeoAnalyzeError } from '../ipcGuards'
import { showToast } from '../toast'

const sample = JSON.stringify(
  {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { towerId: 'T001', lineName: '城南一线', voltage: '110kV' },
        geometry: { type: 'Point', coordinates: [120.134, 30.264] }
      },
      {
        type: 'Feature',
        properties: { lineName: '城南一线', voltage: '110kV' },
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

const source = ref(sample)
const requiredProperties = ref('towerId,lineName,voltage')
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

async function analyze(): Promise<void> {
  loading.value = true
  result.value = await window.devtoolsApi.geo.analyze({
    source: source.value,
    requiredProperties: requiredList.value
  })
  loading.value = false

  if (isGeoAnalyzeError(result.value)) {
    status.value = result.value.error
    statusType.value = 'error'
    showToast(status.value, 'error')
    return
  }

  status.value = `分析完成，发现 ${result.value.issues.length} 个问题`
  statusType.value = 'success'
  showToast(status.value, 'success')
}

function loadSample(): void {
  source.value = sample
  status.value = '已载入示例 GeoJSON'
  statusType.value = 'idle'
}

async function copyReport(): Promise<void> {
  if (!result.value) return
  await navigator.clipboard.writeText(JSON.stringify(result.value, null, 2))
  showToast('分析报告已复制', 'success')
}
</script>

<template>
  <section class="tool-panel">
    <header class="tool-header">
      <div class="tool-title">
        <h2>电力地理数据体检</h2>
        <p>检查 GeoJSON 要素数量、几何类型、坐标范围和杆塔/线路台账必填属性。</p>
      </div>
      <div class="toolbar">
        <button class="button secondary" type="button" @click="loadSample">
          <RefreshCw :size="16" />
          示例
        </button>
        <button class="button secondary" type="button" :disabled="!result" @click="copyReport">
          <Clipboard :size="16" />
          复制报告
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
          <div class="field">
            <label for="required-properties">必填属性</label>
            <input id="required-properties" v-model="requiredProperties" class="input" placeholder="towerId,lineName,voltage" />
          </div>
          <label class="badge" for="geo-source">GeoJSON 输入</label>
          <textarea id="geo-source" v-model="source" class="textarea" spellcheck="false" />
        </div>

        <div class="section">
          <template v-if="result?.ok">
            <div class="meta-grid">
              <div class="metric"><span>要素数</span><strong>{{ result.featureCount }}</strong></div>
              <div class="metric"><span>问题数</span><strong>{{ result.issues.length }}</strong></div>
              <div class="metric"><span>几何类型</span><strong>{{ result.geometryTypes.length }}</strong></div>
              <div class="metric"><span>坐标范围</span><strong>{{ result.bounds ? '已计算' : '无' }}</strong></div>
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
        </div>
      </div>
    </div>

    <footer class="status-bar" :class="statusType">{{ status }}</footer>
  </section>
</template>
