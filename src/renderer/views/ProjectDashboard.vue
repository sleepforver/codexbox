<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { BookOpen, Bot, ClipboardList, FolderKanban, GitBranch, RefreshCw, Send, Settings } from 'lucide-vue-next'
import type { ProjectDashboardSummary } from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'
import { safeLoad } from '../safeLoad'
import { currentProjectId, loadProjectContext, projects as contextProjects } from '../stores/projectContext'
import { showToast } from '../toast'

const projects = contextProjects
const selectedProjectId = currentProjectId
const dashboard = ref<ProjectDashboardSummary | null>(null)
const status = ref('正在读取项目总览')
const statusType = ref<'idle' | 'success' | 'error'>('idle')

const project = computed(() => dashboard.value?.project ?? null)
const totalTasks = computed(() => {
  const stats = dashboard.value?.taskStats
  if (!stats) return 0
  return Object.values(stats).reduce((sum, value) => sum + value, 0)
})

async function loadProjects(): Promise<void> {
  await loadProjectContext()
}

async function loadDashboard(): Promise<void> {
  dashboard.value = await devtoolsApi.projects.getDashboard(selectedProjectId.value || undefined)
  selectedProjectId.value = dashboard.value.project?.id ?? selectedProjectId.value
  status.value = dashboard.value.project ? `已读取项目总览：${dashboard.value.project.name}` : '请先创建或选择项目'
  statusType.value = dashboard.value.project ? 'success' : 'idle'
}

async function refresh(): Promise<void> {
  try {
    await loadDashboard()
    showToast(status.value, statusType.value === 'success' ? 'success' : 'error')
  } catch (error) {
    handleError(error, '项目总览刷新失败')
  }
}

async function changeProject(): Promise<void> {
  await refresh()
}

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : '暂无'
}

function handleError(error: unknown, fallback: string): void {
  status.value = error instanceof Error ? error.message : fallback
  statusType.value = 'error'
  showToast(status.value, 'error')
}

onMounted(() => {
  void safeLoad('读取项目总览', async () => {
    await loadProjects()
    await loadDashboard()
  })
})
</script>

<template>
  <section class="tool-panel">
    <header class="tool-header">
      <div class="tool-title">
        <h2>项目总览</h2>
        <p>聚合当前项目资料、任务、Git、API 和 AI 活动状态。</p>
      </div>
      <div class="toolbar">
        <select v-model="selectedProjectId" class="select select-compact project-switcher" @change="changeProject">
          <option value="">自动选择最近项目</option>
          <option v-for="item in projects" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <button class="button secondary" type="button" @click="refresh">
          <RefreshCw :size="16" />
          刷新
        </button>
      </div>
    </header>

    <div class="tool-body">
      <div v-if="!project" class="empty-state">
        <div class="empty-action">
          <FolderKanban :size="28" />
          <strong>还没有可管理的项目</strong>
          <span>先在项目设置中创建项目，M1 的任务和仪表盘都会围绕当前项目聚合。</span>
          <RouterLink class="button" to="/projects">创建项目</RouterLink>
        </div>
      </div>

      <div v-else class="dashboard-layout">
        <section class="dashboard-hero">
          <div>
            <p class="eyebrow">当前项目</p>
            <h2>{{ project.name }}</h2>
            <p>{{ project.description || '暂无项目说明' }}</p>
            <div class="meta-row">
              <span v-for="tag in project.tags" :key="tag" class="badge">{{ tag }}</span>
              <span v-if="!dashboard?.pathExists" class="badge warning">路径失效</span>
              <span v-else class="badge success">路径有效</span>
            </div>
          </div>
          <div class="project-facts">
            <span>{{ project.path }}</span>
            <span>最近使用：{{ formatDate(project.lastOpenedAt) }}</span>
            <span>技术栈：{{ project.techStack || '未设置' }}</span>
          </div>
        </section>

        <section class="dashboard-metrics">
          <div class="metric">
            <span>任务总数</span>
            <strong>{{ totalTasks }}</strong>
          </div>
          <div class="metric">
            <span>进行中</span>
            <strong>{{ dashboard?.taskStats.in_progress ?? 0 }}</strong>
          </div>
          <div class="metric">
            <span>AI 历史</span>
            <strong>{{ dashboard?.aiStats.total ?? 0 }}</strong>
          </div>
          <div class="metric">
            <span>API 集合</span>
            <strong>{{ dashboard?.apiStats.savedRequests ?? 0 }}</strong>
          </div>
        </section>

        <div class="dashboard-grid">
          <section class="section dashboard-section">
            <div class="meta-row">
              <ClipboardList :size="16" />
              <strong>任务状态</strong>
            </div>
            <div class="task-stat-grid">
              <span
                >待处理 <strong>{{ dashboard?.taskStats.todo ?? 0 }}</strong></span
              >
              <span
                >进行中 <strong>{{ dashboard?.taskStats.in_progress ?? 0 }}</strong></span
              >
              <span
                >待验证 <strong>{{ dashboard?.taskStats.pending_validation ?? 0 }}</strong></span
              >
              <span
                >已完成 <strong>{{ dashboard?.taskStats.done ?? 0 }}</strong></span
              >
              <span
                >已归档 <strong>{{ dashboard?.taskStats.archived ?? 0 }}</strong></span
              >
            </div>
            <div class="history-list compact-history">
              <div v-for="task in dashboard?.recentTasks" :key="task.id" class="list-item">
                <strong>{{ task.title }}</strong>
                <small>{{ task.taskType }} / {{ task.status }} / {{ formatDate(task.updatedAt) }}</small>
              </div>
              <div v-if="!dashboard?.recentTasks.length" class="empty-state compact-empty">暂无任务</div>
            </div>
          </section>

          <section class="section dashboard-section">
            <div class="meta-row">
              <GitBranch :size="16" />
              <strong>Git 摘要</strong>
            </div>
            <div class="code-box dashboard-code-box">
              分支：{{ dashboard?.git.branch || '未知' }} 变更文件：{{ dashboard?.git.changedFiles ?? 0 }} 已暂存：{{
                dashboard?.git.stagedFiles ?? 0
              }}
              最近提交：{{ dashboard?.git.recentCommit || '暂无' }} 状态：{{ dashboard?.git.message }}
            </div>
          </section>

          <section class="section dashboard-section">
            <div class="meta-row">
              <Bot :size="16" />
              <strong>AI 活动</strong>
              <span class="badge">收藏 {{ dashboard?.aiStats.favorites ?? 0 }}</span>
            </div>
            <div class="history-list compact-history">
              <div v-for="item in dashboard?.aiStats.recent" :key="item.id" class="list-item">
                <strong>{{ item.title }}</strong>
                <small>{{ item.taskType }} / {{ item.model }} / {{ formatDate(item.createdAt) }}</small>
              </div>
              <div v-if="!dashboard?.aiStats.recent.length" class="empty-state compact-empty">暂无 AI 活动</div>
            </div>
          </section>

          <section class="section dashboard-section">
            <div class="meta-row">
              <Send :size="16" />
              <strong>API 资产</strong>
              <span class="badge">环境变量 {{ dashboard?.apiStats.envVars ?? 0 }}</span>
            </div>
            <div class="history-list compact-history">
              <div v-for="item in dashboard?.apiStats.recentHistory" :key="`${item.at}:${item.url}`" class="list-item">
                <strong>{{ item.method }} {{ item.url }}</strong>
                <small>{{ formatDate(item.at) }}</small>
              </div>
              <div v-if="!dashboard?.apiStats.recentHistory.length" class="empty-state compact-empty">
                暂无 API 历史
              </div>
            </div>
          </section>
        </div>

        <section class="dashboard-actions">
          <RouterLink class="button" to="/project-tasks">
            <ClipboardList :size="16" />
            管理任务
          </RouterLink>
          <RouterLink class="button secondary" to="/ai-generate">
            <Bot :size="16" />
            AI 开发
          </RouterLink>
          <RouterLink class="button secondary" to="/code-review">
            <GitBranch :size="16" />
            代码审查
          </RouterLink>
          <RouterLink class="button secondary" to="/api">
            <Send :size="16" />
            API 管理
          </RouterLink>
          <RouterLink class="button secondary" to="/project-knowledge">
            <BookOpen :size="16" />
            项目知识库
          </RouterLink>
          <RouterLink class="button secondary" to="/git">
            <GitBranch :size="16" />
            Git 工作流
          </RouterLink>
          <RouterLink class="button secondary" to="/projects">
            <Settings :size="16" />
            项目设置
          </RouterLink>
        </section>
      </div>
    </div>

    <footer class="status-bar" :class="statusType" role="status" aria-live="polite">{{ status }}</footer>
  </section>
</template>
