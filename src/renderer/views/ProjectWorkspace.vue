<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Download, FolderOpen, Plus, Save, Search, Trash2, Upload } from 'lucide-vue-next'
import type {
  DataTransferDetail,
  ProjectPackageImportMode,
  ProjectPackageImportPreview,
  WorkspaceProject
} from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'
import { safeLoad } from '../safeLoad'
import { showToast } from '../toast'

const projects = ref<WorkspaceProject[]>([])
const selectedId = ref('')
const keyword = ref('')
const status = ref('正在读取项目工作区')
const statusType = ref<'idle' | 'success' | 'error'>('idle')
const form = ref({
  name: '',
  path: '',
  description: '',
  tags: ''
})
const packageImportMode = ref<ProjectPackageImportMode>('overwrite')
const packagePreview = ref<ProjectPackageImportPreview | null>(null)
const packageImportDetails = ref<DataTransferDetail[]>([])

const selectedProject = computed(() => projects.value.find((item) => item.id === selectedId.value) ?? null)
const filteredProjects = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  if (!text) return projects.value
  return projects.value.filter((item) => {
    return [item.name, item.path, item.description, item.tags.join(' ')].some((value) =>
      value.toLowerCase().includes(text)
    )
  })
})

async function loadProjects(): Promise<void> {
  projects.value = await devtoolsApi.projects.list()
  selectedId.value = selectedId.value || projects.value[0]?.id || ''
  if (selectedProject.value) applyProject(selectedProject.value)
  status.value = `已读取 ${projects.value.length} 个项目工作区`
  statusType.value = 'success'
}

function applyProject(project: WorkspaceProject): void {
  selectedId.value = project.id
  form.value = {
    name: project.name,
    path: project.path,
    description: project.description,
    tags: project.tags.join(', ')
  }
  status.value = `已选择 ${project.name}`
  statusType.value = 'idle'
}

function createProject(): void {
  selectedId.value = ''
  form.value = {
    name: '',
    path: '',
    description: '',
    tags: ''
  }
  status.value = '正在创建新项目工作区'
  statusType.value = 'idle'
}

async function chooseDirectory(): Promise<void> {
  try {
    const directory = await devtoolsApi.settings.selectDirectory()
    if (!directory) return
    form.value.path = directory
    if (!form.value.name.trim()) {
      form.value.name = directory.split(/[\\/]/).filter(Boolean).at(-1) ?? '未命名项目'
    }
  } catch (error) {
    handleError(error, '选择项目目录失败')
  }
}

async function saveProject(): Promise<void> {
  if (!form.value.path.trim()) {
    handleError(new Error('请先选择项目目录'), '保存项目工作区失败')
    return
  }

  try {
    projects.value = await devtoolsApi.projects.save({
      id: selectedId.value || undefined,
      name: form.value.name,
      path: form.value.path,
      description: form.value.description,
      tags: form.value.tags
        .split(/[,，\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    })
    selectedId.value = projects.value.find((item) => item.path === form.value.path)?.id ?? projects.value[0]?.id ?? ''
    if (selectedProject.value) applyProject(selectedProject.value)
    status.value = '项目工作区已保存'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '保存项目工作区失败')
  }
}

async function deleteProject(): Promise<void> {
  if (!selectedProject.value) return
  if (!window.confirm(`确认删除项目工作区“${selectedProject.value.name}”？`)) return

  try {
    projects.value = await devtoolsApi.projects.delete(selectedProject.value.id)
    selectedId.value = projects.value[0]?.id ?? ''
    if (selectedProject.value) applyProject(selectedProject.value)
    else createProject()
    status.value = '项目工作区已删除'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '删除项目工作区失败')
  }
}

async function markOpened(project: WorkspaceProject): Promise<void> {
  try {
    projects.value = await devtoolsApi.projects.markOpened(project.id)
    selectedId.value = project.id
    const latestProject = projects.value.find((item) => item.id === project.id) ?? project
    applyProject(latestProject)
    status.value = `已标记最近使用：${latestProject.name}`
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '标记最近使用失败')
  }
}

async function exportProjectPackage(): Promise<void> {
  if (!selectedProject.value) return
  try {
    const result = await devtoolsApi.settings.exportProjectPackage(selectedProject.value.id)
    if (!result) return
    status.value = result.message
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '导出项目数据包失败')
  }
}

async function exportWorkspaceProjects(): Promise<void> {
  try {
    const result = await devtoolsApi.settings.exportWorkspaceProjects()
    if (!result) return
    status.value = result.message
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '导出项目工作区失败')
  }
}

async function importWorkspaceProjects(): Promise<void> {
  if (!window.confirm('导入项目列表会按项目 ID 覆盖同名记录，确认继续？')) return
  try {
    const result = await devtoolsApi.settings.importWorkspaceProjects()
    if (!result) return
    await loadProjects()
    packageImportDetails.value = result.details ?? []
    status.value = result.message
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '导入项目工作区失败')
  }
}

async function importProjectPackage(): Promise<void> {
  try {
    packagePreview.value = await devtoolsApi.settings.previewProjectPackageImport()
    if (!packagePreview.value) return
  } catch (error) {
    handleError(error, '预览项目数据包失败')
    return
  }

  const conflictText = packagePreview.value.conflictProjectNames.length
    ? `\n冲突项目：${packagePreview.value.conflictProjectNames.join('、')}`
    : ''
  if (
    !window.confirm(
      `确认导入项目数据包？\n项目：${packagePreview.value.projectCount} 个\nAI 历史：${packagePreview.value.aiHistoryCount} 条\nAPI 请求：${packagePreview.value.apiRequestCount} 条${conflictText}`
    )
  ) {
    return
  }

  try {
    const result = await devtoolsApi.settings.importProjectPackage(packagePreview.value.path, packageImportMode.value)
    if (!result) return
    await loadProjects()
    packageImportDetails.value = result.details ?? []
    status.value = result.message
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '导入项目数据包失败')
  }
}

function handleError(error: unknown, fallback: string): void {
  status.value = error instanceof Error ? error.message : fallback
  statusType.value = 'error'
  showToast(status.value, 'error')
}

onMounted(() => {
  void safeLoad('读取项目工作区', loadProjects)
})
</script>

<template>
  <section class="tool-panel">
    <header class="tool-header">
      <div class="tool-title">
        <h2>项目工作区</h2>
        <p>维护常用项目目录、标签和说明，为后续按项目隔离历史与配置做准备。</p>
      </div>
      <div class="toolbar">
        <button class="button secondary" type="button" @click="createProject">
          <Plus :size="16" />
          新建
        </button>
        <button class="button" type="button" @click="saveProject">
          <Save :size="16" />
          保存
        </button>
        <button class="button secondary" type="button" :disabled="!selectedProject" @click="exportProjectPackage">
          <Download :size="16" />
          导出项目包
        </button>
        <button class="button secondary" type="button" @click="importProjectPackage">
          <Upload :size="16" />
          导入项目包
        </button>
      </div>
    </header>

    <div class="tool-body">
      <div class="project-workspace-grid">
        <aside class="section">
          <div class="meta-row">
            <Search :size="16" />
            <strong>项目列表</strong>
            <span class="badge">{{ projects.length }}</span>
          </div>
          <div class="toolbar">
            <button class="button secondary compact-button" type="button" @click="exportWorkspaceProjects">
              导出列表
            </button>
            <button class="button secondary compact-button" type="button" @click="importWorkspaceProjects">
              导入列表
            </button>
            <select v-model="packageImportMode" class="select select-compact" aria-label="项目包冲突策略">
              <option value="overwrite">覆盖冲突</option>
              <option value="skip">跳过冲突</option>
              <option value="new">另存新项目</option>
            </select>
          </div>
          <div v-if="packageImportDetails.length" class="section">
            <strong>最近导入明细</strong>
            <div class="history-list compact-history">
              <div
                v-for="(item, index) in packageImportDetails"
                :key="`${index}:${item.scope}:${item.message}`"
                class="list-item"
              >
                <span class="badge" :class="item.action === 'skipped' ? 'warning' : 'success'">{{ item.action }}</span>
                <strong>{{ item.scope }}</strong>
                <small>{{ item.message }}</small>
              </div>
            </div>
          </div>
          <input v-model="keyword" class="input" placeholder="搜索名称、路径、标签" />
          <div class="history-list project-list">
            <button
              v-for="project in filteredProjects"
              :key="project.id"
              class="list-item action-item project-list-item"
              :class="{ active: project.id === selectedId }"
              type="button"
              @click="applyProject(project)"
            >
              <div>
                <strong>{{ project.name }}</strong>
                <small>{{ project.path }}</small>
              </div>
              <span v-if="project.tags[0]" class="badge">{{ project.tags[0] }}</span>
            </button>
            <div v-if="!filteredProjects.length" class="empty-state compact-empty">暂无项目工作区</div>
          </div>
        </aside>

        <div class="section">
          <div class="field">
            <label for="project-name">项目名称</label>
            <input id="project-name" v-model="form.name" class="input" placeholder="例如：后台管理系统" />
          </div>

          <div class="field">
            <label for="project-path">项目目录</label>
            <div class="input-row">
              <input id="project-path" v-model="form.path" class="input" placeholder="选择或粘贴本地项目目录" />
              <button class="button secondary icon-text-button" type="button" @click="chooseDirectory">
                <FolderOpen :size="16" />
                选择
              </button>
            </div>
          </div>

          <div class="field">
            <label for="project-tags">标签</label>
            <input id="project-tags" v-model="form.tags" class="input" placeholder="前端, API, 工具链" />
          </div>

          <div class="field">
            <label for="project-description">说明</label>
            <textarea
              id="project-description"
              v-model="form.description"
              class="textarea project-description"
              placeholder="记录项目用途、业务边界、常用验证方式"
            />
          </div>

          <div class="toolbar">
            <button class="button" type="button" @click="saveProject">
              <Save :size="16" />
              保存项目
            </button>
            <button
              class="button secondary"
              type="button"
              :disabled="!selectedProject"
              @click="selectedProject && markOpened(selectedProject)"
            >
              标记最近使用
            </button>
            <button class="button secondary" type="button" :disabled="!selectedProject" @click="exportProjectPackage">
              <Download :size="16" />
              导出项目包
            </button>
            <button class="button danger" type="button" :disabled="!selectedProject" @click="deleteProject">
              <Trash2 :size="16" />
              删除
            </button>
          </div>

          <div v-if="selectedProject" class="code-box">
            创建时间：{{ new Date(selectedProject.createdAt).toLocaleString() }} 更新时间：{{
              new Date(selectedProject.updatedAt).toLocaleString()
            }}
            最近使用：{{
              selectedProject.lastOpenedAt ? new Date(selectedProject.lastOpenedAt).toLocaleString() : '暂无'
            }}
          </div>
        </div>
      </div>
    </div>

    <footer class="status-bar" :class="statusType" role="status" aria-live="polite">{{ status }}</footer>
  </section>
</template>
