<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import {
  Bot,
  BookOpen,
  Braces,
  ClipboardList,
  FileSearch,
  FolderKanban,
  GitBranch,
  Hammer,
  History,
  LayoutDashboard,
  Send,
  Settings,
  Sparkles
} from 'lucide-vue-next'
import type { AppSettings } from '../shared/ipc'
import { devtoolsApi } from './devtoolsApi'
import { routes } from './routes'
import {
  currentProject,
  currentProjectId,
  loadProjectContext,
  markCurrentProjectOpened,
  projects as recentProjects
} from './stores/projectContext'
import { showToast } from './toast'
import { toasts } from './toast'

const route = useRoute()
const router = useRouter()
const appSettings = ref<AppSettings | null>(null)
const onboardingDismissed = ref(localStorage.getItem('codexbox:onboarding-dismissed') === '1')
const navItems = [
  { path: '/dashboard', label: '项目总览', description: '状态、任务、资产', icon: LayoutDashboard },
  { path: '/project-tasks', label: '项目任务', description: '需求、Bug、发布', icon: ClipboardList },
  { path: '/project-agents', label: 'Agent工作站', description: '分工、编排、追踪', icon: Bot },
  { path: '/project-knowledge', label: '项目知识库', description: '资料、结论、摘要', icon: BookOpen },
  { path: '/ai-generate', label: 'AI开发', description: '项目方案与实现草稿', icon: Sparkles },
  { path: '/code-review', label: '代码审查', description: 'Diff 风险与建议', icon: FileSearch },
  { path: '/api', label: 'API管理', description: '接口资产与调试', icon: Send },
  { path: '/git', label: 'Git工作流', description: '状态、日志、差异', icon: GitBranch },
  { path: '/projects', label: '项目设置', description: '资料、目录、导入导出', icon: FolderKanban },
  { path: '/ai-history', label: 'AI历史中心', description: '检索、复用、导出记录', icon: History },
  { path: '/ai-explain', label: 'AI解释代码', description: '代码理解与风险分析', icon: Bot },
  { path: '/json', label: 'JSON工具', description: '格式化、压缩、校验', icon: Braces },
  { path: '/settings', label: '设置', description: '模型、目录、超时', icon: Settings }
]

const currentTitle = computed(() => {
  return routes.find((item) => item.path === route.path)?.meta?.label ?? 'AI 开发工具箱'
})
const onboardingSteps = computed(() => [
  {
    label: '配置模型平台',
    done: Boolean(appSettings.value?.hasOpenaiApiKey),
    action: '去设置',
    route: '/settings'
  },
  {
    label: '设置默认工作目录',
    done: Boolean(appSettings.value?.defaultWorkspace),
    action: '选择目录',
    route: '/settings'
  },
  {
    label: '创建第一个项目',
    done: recentProjects.value.length > 0,
    action: '去创建',
    route: '/projects'
  },
  {
    label: '试用基础工具',
    done: false,
    action: '打开 API 测试',
    route: '/api'
  }
])
const showOnboarding = computed(() => {
  if (onboardingDismissed.value) return false
  return onboardingSteps.value.some((item) => !item.done)
})

async function loadRecentProjects(): Promise<void> {
  try {
    await loadProjectContext()
  } catch (error) {
    recentProjects.value = []
    currentProjectId.value = ''
    showToast(error instanceof Error ? error.message : '最近项目读取失败', 'error')
  }
}

async function loadAppSettings(): Promise<void> {
  try {
    appSettings.value = await devtoolsApi.settings.get()
  } catch (error) {
    appSettings.value = null
    showToast(error instanceof Error ? error.message : '设置读取失败', 'error')
  }
}

async function openRecentProject(): Promise<void> {
  if (!currentProjectId.value) return
  try {
    await markCurrentProjectOpened()
    const project = currentProject.value
    showToast(project ? `已切换最近项目：${project.name}` : '已切换最近项目', 'success')
    await router.push('/dashboard')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '打开最近项目失败', 'error')
  }
}

function handleShortcut(event: KeyboardEvent): void {
  if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return
  const index = Number(event.key)
  if (!Number.isInteger(index) || index < 1 || index > navItems.length) return
  event.preventDefault()
  void router.push(navItems[index - 1].path)
}

function dismissOnboarding(): void {
  onboardingDismissed.value = true
  localStorage.setItem('codexbox:onboarding-dismissed', '1')
}

function resetOnboarding(): void {
  onboardingDismissed.value = false
  localStorage.removeItem('codexbox:onboarding-dismissed')
}

onMounted(() => {
  void loadAppSettings()
  void loadRecentProjects()
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('codexbox:onboarding-reset', resetOnboarding)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('codexbox:onboarding-reset', resetOnboarding)
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
          <select
            v-model="currentProjectId"
            class="select select-compact recent-project-select"
            :disabled="!recentProjects.length"
          >
            <option value="">暂无项目</option>
            <option v-for="project in recentProjects" :key="project.id" :value="project.id">{{ project.name }}</option>
          </select>
          <button
            class="button secondary compact-button"
            type="button"
            :disabled="!currentProjectId"
            @click="openRecentProject"
          >
            最近项目
          </button>
          <div class="runtime-pill">SiliconFlow + Electron + Vue</div>
        </div>
      </header>

      <section v-if="showOnboarding" class="onboarding-panel" aria-label="首次启动引导">
        <div class="onboarding-copy">
          <p class="eyebrow">首次启动引导</p>
          <h2>完成基础配置后即可开始使用</h2>
          <p>
            AI 配置缺失不会阻塞 JSON、API、Git 和项目工作区。需要模型能力时，先在设置页保存 API Key 并执行连接测试。
          </p>
        </div>
        <div class="onboarding-steps">
          <button
            v-for="item in onboardingSteps"
            :key="item.label"
            class="onboarding-step"
            :class="{ done: item.done }"
            type="button"
            @click="router.push(item.route)"
          >
            <span>{{ item.done ? '完成' : '待办' }}</span>
            <strong>{{ item.label }}</strong>
            <small>{{ item.action }}</small>
          </button>
        </div>
        <button class="button secondary compact-button" type="button" @click="dismissOnboarding">跳过引导</button>
      </section>

      <RouterView />
    </main>

    <div class="toast-stack" aria-live="polite">
      <div v-for="toast in toasts" :key="toast.id" class="toast" :class="toast.type">
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>
