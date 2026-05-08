<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { Bot, Braces, FolderKanban, GitBranch, Hammer, History, Map, Send, Settings, Sparkles } from 'lucide-vue-next'
import type { WorkspaceProject } from '../shared/ipc'
import { devtoolsApi } from './devtoolsApi'
import { routes } from './routes'
import { showToast } from './toast'
import { toasts } from './toast'

const route = useRoute()
const router = useRouter()
const recentProjects = ref<WorkspaceProject[]>([])
const selectedRecentProjectId = ref('')
const navItems = [
  { path: '/projects', label: '项目工作区', description: '项目目录与标签', icon: FolderKanban },
  { path: '/json', label: 'JSON工具', description: '格式化、压缩、校验', icon: Braces },
  { path: '/api', label: 'API测试', description: '请求调试与响应检查', icon: Send },
  { path: '/git', label: 'Git助手', description: '状态、日志、差异', icon: GitBranch },
  { path: '/geo', label: '电力地理', description: 'GeoJSON体检与台账校验', icon: Map },
  { path: '/ai-explain', label: 'AI解释代码', description: '代码理解与风险分析', icon: Bot },
  { path: '/ai-generate', label: 'AI生成代码', description: '需求转实现草稿', icon: Sparkles },
  { path: '/ai-history', label: 'AI历史中心', description: '检索、复用、导出记录', icon: History },
  { path: '/settings', label: '设置', description: '模型、目录、超时', icon: Settings }
]

const currentTitle = computed(() => {
  return routes.find((item) => item.path === route.path)?.meta?.label ?? 'AI 开发工具箱'
})

async function loadRecentProjects(): Promise<void> {
  try {
    recentProjects.value = await devtoolsApi.projects.list()
    selectedRecentProjectId.value = recentProjects.value[0]?.id ?? ''
  } catch (error) {
    recentProjects.value = []
    selectedRecentProjectId.value = ''
    showToast(error instanceof Error ? error.message : '最近项目读取失败', 'error')
  }
}

async function openRecentProject(): Promise<void> {
  if (!selectedRecentProjectId.value) return
  try {
    recentProjects.value = await devtoolsApi.projects.markOpened(selectedRecentProjectId.value)
    const project = recentProjects.value.find((item) => item.id === selectedRecentProjectId.value)
    showToast(project ? `已切换最近项目：${project.name}` : '已切换最近项目', 'success')
    await router.push('/projects')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '打开最近项目失败', 'error')
  }
}

onMounted(() => {
  void loadRecentProjects()
})
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">
          <Hammer :size="22" />
        </div>
        <div>
          <strong>DevTools</strong>
          <span>Codex Toolbox</span>
        </div>
      </div>

      <nav class="module-nav" aria-label="工具模块">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" class="nav-link">
          <component :is="item.icon" :size="18" />
          <span>
            <strong>{{ item.label }}</strong>
            <small>{{ item.description }}</small>
          </span>
        </RouterLink>
      </nav>
    </aside>

    <main class="workspace">
      <header class="workspace-header">
        <div>
          <p class="eyebrow">本地开发者工作台</p>
          <h1>{{ currentTitle }}</h1>
        </div>
        <div class="workspace-actions">
          <select v-model="selectedRecentProjectId" class="select select-compact recent-project-select" :disabled="!recentProjects.length">
            <option value="">暂无项目</option>
            <option v-for="project in recentProjects" :key="project.id" :value="project.id">{{ project.name }}</option>
          </select>
          <button class="button secondary compact-button" type="button" :disabled="!selectedRecentProjectId" @click="openRecentProject">
            最近项目
          </button>
          <div class="runtime-pill">SiliconFlow + Electron + Vue</div>
        </div>
      </header>

      <RouterView />
    </main>

    <div class="toast-stack" aria-live="polite">
      <div v-for="toast in toasts" :key="toast.id" class="toast" :class="toast.type">
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>
