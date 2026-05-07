<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { Bot, Braces, GitBranch, Hammer, Map, Send, Settings, Sparkles } from 'lucide-vue-next'
import { routes } from './routes'
import { toasts } from './toast'

const route = useRoute()
const navItems = [
  { path: '/json', label: 'JSON工具', description: '格式化、压缩、校验', icon: Braces },
  { path: '/api', label: 'API测试', description: '请求调试与响应检查', icon: Send },
  { path: '/git', label: 'Git助手', description: '状态、日志、差异', icon: GitBranch },
  { path: '/geo', label: '电力地理', description: 'GeoJSON体检与台账校验', icon: Map },
  { path: '/ai-explain', label: 'AI解释代码', description: '代码理解与风险分析', icon: Bot },
  { path: '/ai-generate', label: 'AI生成代码', description: '需求转实现草稿', icon: Sparkles },
  { path: '/settings', label: '设置', description: '模型、目录、超时', icon: Settings }
]

const currentTitle = computed(() => {
  return routes.find((item) => item.path === route.path)?.meta?.label ?? 'AI 开发工具箱'
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
        <div class="runtime-pill">SiliconFlow + Electron + Vue</div>
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
