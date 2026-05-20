<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { BookOpen, Eye, Plus, Save, Search, Star, Trash2 } from 'lucide-vue-next'
import type { AiHistorySourceType, ProjectKnowledgeItem, ProjectSearchResult } from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'
import { renderMarkdown } from '../markdown'
import { safeLoad } from '../safeLoad'
import { currentProjectId, loadProjectContext, projects } from '../stores/projectContext'
import { showToast } from '../toast'

const knowledge = ref<ProjectKnowledgeItem[]>([])
const searchResults = ref<ProjectSearchResult[]>([])
const selectedKnowledgeId = ref('')
const keyword = ref('')
const favoriteOnly = ref(false)
const status = ref('正在读取项目知识库')
const statusType = ref<'idle' | 'success' | 'error'>('idle')
const form = ref({
  title: '',
  content: '',
  sourceType: 'project' as AiHistorySourceType,
  sourceId: '',
  isFavorite: false
})

const selectedProjectId = currentProjectId
const selectedProject = computed(() => projects.value.find((project) => project.id === selectedProjectId.value) ?? null)
const selectedKnowledge = computed(() => knowledge.value.find((item) => item.id === selectedKnowledgeId.value) ?? null)
const renderedContent = computed(() => renderMarkdown(form.value.content || '知识条目内容会以 Markdown 形式预览。'))
const searchResultTypeLabels: Record<ProjectSearchResult['type'], string> = {
  project: '项目资料',
  task: '项目任务',
  ai_history: 'AI 历史',
  api_request: 'API 请求',
  knowledge: '知识条目'
}

async function loadKnowledge(): Promise<void> {
  if (!selectedProjectId.value) {
    knowledge.value = []
    selectedKnowledgeId.value = ''
    status.value = '请先创建或选择项目'
    statusType.value = 'idle'
    return
  }
  knowledge.value = await devtoolsApi.projects.listKnowledge({
    projectId: selectedProjectId.value,
    keyword: keyword.value,
    favoriteOnly: favoriteOnly.value
  })
  if (selectedKnowledgeId.value && !knowledge.value.some((item) => item.id === selectedKnowledgeId.value)) {
    selectedKnowledgeId.value = ''
  }
  if (!selectedKnowledgeId.value && knowledge.value[0]) applyKnowledge(knowledge.value[0])
  status.value = `已读取 ${knowledge.value.length} 条项目知识`
  statusType.value = 'success'
  await loadSearchResults()
}

async function loadSearchResults(): Promise<void> {
  if (!selectedProjectId.value) {
    searchResults.value = []
    return
  }
  searchResults.value = await devtoolsApi.projects.search({
    projectId: selectedProjectId.value,
    keyword: keyword.value
  })
}

function createKnowledge(): void {
  selectedKnowledgeId.value = ''
  form.value = {
    title: '',
    content: '',
    sourceType: 'project',
    sourceId: '',
    isFavorite: false
  }
  status.value = '正在创建新知识条目'
  statusType.value = 'idle'
}

function applyKnowledge(item: ProjectKnowledgeItem): void {
  selectedKnowledgeId.value = item.id
  form.value = {
    title: item.title,
    content: item.content,
    sourceType: item.sourceType,
    sourceId: item.sourceId ?? '',
    isFavorite: item.isFavorite
  }
  status.value = `已选择知识条目：${item.title}`
  statusType.value = 'idle'
}

async function saveKnowledge(): Promise<void> {
  if (!selectedProjectId.value) {
    handleError(new Error('请先选择项目'), '保存项目知识失败')
    return
  }
  try {
    knowledge.value = await devtoolsApi.projects.saveKnowledge({
      id: selectedKnowledgeId.value || undefined,
      projectId: selectedProjectId.value,
      title: form.value.title,
      content: form.value.content,
      sourceType: form.value.sourceType,
      sourceId: form.value.sourceId || undefined,
      isFavorite: form.value.isFavorite
    })
    selectedKnowledgeId.value =
      knowledge.value.find((item) => item.title === form.value.title && item.content === form.value.content)?.id ??
      knowledge.value[0]?.id ??
      ''
    if (selectedKnowledge.value) applyKnowledge(selectedKnowledge.value)
    await loadSearchResults()
    status.value = '项目知识条目已保存'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '保存项目知识失败')
  }
}

async function deleteKnowledge(item: ProjectKnowledgeItem): Promise<void> {
  if (!window.confirm(`确认删除知识条目“${item.title}”？`)) return
  try {
    knowledge.value = await devtoolsApi.projects.deleteKnowledge(item.id, item.projectId)
    createKnowledge()
    await loadSearchResults()
    status.value = '项目知识条目已删除'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '删除项目知识失败')
  }
}

async function toggleFavorite(item: ProjectKnowledgeItem): Promise<void> {
  try {
    knowledge.value = await devtoolsApi.projects.toggleKnowledgeFavorite(item.id, item.projectId, !item.isFavorite)
    const updated = knowledge.value.find((entry) => entry.id === item.id)
    if (updated) applyKnowledge(updated)
    status.value = updated?.isFavorite ? '已收藏项目知识' : '已取消收藏项目知识'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '更新收藏状态失败')
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

function formatSummary(value: string): string {
  const summary = value.replace(/\s+/g, ' ').trim()
  return summary.length > 140 ? `${summary.slice(0, 140)}...` : summary || '暂无摘要'
}

function applySearchResult(result: ProjectSearchResult): void {
  if (result.type !== 'knowledge') {
    status.value = `已定位搜索结果：${searchResultTypeLabels[result.type]} / ${result.title}`
    statusType.value = 'idle'
    return
  }
  const item = knowledge.value.find((entry) => entry.id === result.id)
  if (item) {
    applyKnowledge(item)
    return
  }
  keyword.value = result.title
  void loadKnowledge()
}

function handleError(error: unknown, fallback: string): void {
  status.value = error instanceof Error ? error.message : fallback
  statusType.value = 'error'
  showToast(status.value, 'error')
}

onMounted(() => {
  void safeLoad('读取项目知识库', async () => {
    await loadProjectContext()
    await loadKnowledge()
  })
})

watch(selectedProjectId, async () => {
  createKnowledge()
  await loadKnowledge()
})
</script>

<template>
  <section class="tool-panel">
    <header class="tool-header">
      <div class="tool-title">
        <h2>项目知识库</h2>
        <p>沉淀当前项目的资料、AI 结论、接口说明、任务记录和重要文档摘要。</p>
      </div>
      <div class="toolbar">
        <select v-model="selectedProjectId" class="select select-compact project-switcher">
          <option value="">选择项目</option>
          <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
        </select>
        <button class="button secondary" type="button" @click="loadKnowledge">
          <Search :size="16" />
          刷新
        </button>
        <button class="button" type="button" :disabled="!selectedProjectId" @click="saveKnowledge">
          <Save :size="16" />
          保存
        </button>
      </div>
    </header>

    <div class="tool-body">
      <div v-if="!selectedProject" class="empty-state">
        <div class="empty-action">
          <BookOpen :size="28" />
          <strong>请选择项目后维护知识库</strong>
          <span>知识条目按项目隔离，后续可从 AI 历史、任务和 API 分析中继续沉淀。</span>
        </div>
      </div>

      <div v-else class="split-grid">
        <aside class="section">
          <div class="request-row">
            <input v-model="keyword" class="input" placeholder="搜索标题或内容" @keyup.enter="loadKnowledge" />
            <button class="button secondary icon-only-button" type="button" aria-label="搜索" @click="loadKnowledge">
              <Search :size="16" />
            </button>
          </div>
          <label class="toggle-row">
            <input v-model="favoriteOnly" type="checkbox" @change="loadKnowledge" />
            只看收藏
          </label>
          <button class="button secondary full-width-button" type="button" @click="createKnowledge">
            <Plus :size="16" />
            新建知识
          </button>

          <div class="history-list">
            <button
              v-for="item in knowledge"
              :key="item.id"
              class="list-item action-item"
              :class="{ active: selectedKnowledgeId === item.id }"
              type="button"
              @click="applyKnowledge(item)"
            >
              <strong>{{ item.title }}</strong>
              <small>{{ item.sourceType }} / {{ formatDate(item.updatedAt) }}</small>
              <span v-if="item.isFavorite" class="badge">收藏</span>
            </button>
            <div v-if="!knowledge.length" class="empty-state compact-empty">暂无项目知识</div>
          </div>

          <div class="unified-search-panel">
            <div class="meta-row">
              <Search :size="16" />
              <strong>项目内统一搜索</strong>
              <span class="badge">{{ searchResults.length }}</span>
            </div>
            <div class="history-list compact-history">
              <button
                v-for="result in searchResults"
                :key="`${result.type}:${result.id}`"
                class="list-item action-item"
                type="button"
                @click="applySearchResult(result)"
              >
                <span class="badge">{{ searchResultTypeLabels[result.type] }}</span>
                <strong>{{ result.title }}</strong>
                <small>{{ formatSummary(result.summary) }}</small>
                <small>{{ formatDate(result.updatedAt) }}</small>
              </button>
              <div v-if="!searchResults.length" class="empty-state compact-empty">
                当前项目暂无匹配的项目资料、任务、AI 历史、API 或知识条目
              </div>
            </div>
          </div>
        </aside>

        <section class="section">
          <div class="field">
            <label for="knowledge-title">标题</label>
            <input id="knowledge-title" v-model="form.title" class="input" placeholder="例如：本地启动注意事项" />
          </div>

          <div class="request-row">
            <label class="select-field">
              <span>来源类型</span>
              <select v-model="form.sourceType" class="select">
                <option value="project">项目资料</option>
                <option value="task">项目任务</option>
                <option value="api_response">API 分析</option>
                <option value="git_diff">Git 变更</option>
                <option value="code_review">代码审查</option>
                <option value="manual">手动记录</option>
              </select>
            </label>
            <div class="field">
              <label for="knowledge-source-id">来源 ID</label>
              <input id="knowledge-source-id" v-model="form.sourceId" class="input" placeholder="可选" />
            </div>
          </div>

          <div class="field">
            <label for="knowledge-content">内容</label>
            <textarea
              id="knowledge-content"
              v-model="form.content"
              class="textarea ai-pane-fixed"
              placeholder="使用 Markdown 记录项目知识、决策、风险点或文档摘要"
            />
          </div>

          <label class="toggle-row">
            <input v-model="form.isFavorite" type="checkbox" />
            收藏该知识条目
          </label>

          <div class="toolbar">
            <button class="button" type="button" :disabled="!selectedProjectId" @click="saveKnowledge">
              <Save :size="16" />
              保存知识
            </button>
            <button
              class="button secondary"
              type="button"
              :disabled="!selectedKnowledge"
              @click="selectedKnowledge && toggleFavorite(selectedKnowledge)"
            >
              <Star :size="16" />
              {{ selectedKnowledge?.isFavorite ? '取消收藏' : '收藏' }}
            </button>
            <button
              class="button danger"
              type="button"
              :disabled="!selectedKnowledge"
              @click="selectedKnowledge && deleteKnowledge(selectedKnowledge)"
            >
              <Trash2 :size="16" />
              删除
            </button>
          </div>
        </section>

        <section class="section">
          <div class="meta-row">
            <Eye :size="16" />
            <strong>Markdown 预览</strong>
          </div>
          <article class="markdown-body ai-pane-fixed" v-html="renderedContent" />
        </section>
      </div>
    </div>

    <footer class="status-bar" :class="statusType" role="status" aria-live="polite">{{ status }}</footer>
  </section>
</template>
