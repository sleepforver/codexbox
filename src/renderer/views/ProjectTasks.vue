<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ClipboardList, Eye, Plus, Save, Search, Trash2, Upload } from 'lucide-vue-next'
import type {
  AiHistoryItem,
  ProjectTask,
  ProjectTaskFile,
  ProjectTaskPriority,
  ProjectTaskStatus,
  ProjectTaskType
} from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'
import { safeLoad } from '../safeLoad'
import { currentProjectId, loadProjectContext, projects as contextProjects } from '../stores/projectContext'
import { showToast } from '../toast'

const projects = contextProjects
const tasks = ref<ProjectTask[]>([])
const linkedHistory = ref<AiHistoryItem[]>([])
const taskFiles = ref<ProjectTaskFile[]>([])
const selectedTaskFile = ref<ProjectTaskFile | null>(null)
const selectedProjectId = currentProjectId
const selectedTaskId = ref('')
const keyword = ref('')
const statusFilter = ref<ProjectTaskStatus | 'all'>('all')
const typeFilter = ref<ProjectTaskType | 'all'>('all')
const status = ref('正在读取项目任务')
const statusType = ref<'idle' | 'success' | 'error'>('idle')
const form = ref({
  title: '',
  description: '',
  taskType: 'requirement' as ProjectTaskType,
  priority: 'medium' as ProjectTaskPriority,
  status: 'todo' as ProjectTaskStatus
})
const router = useRouter()

const selectedProject = computed(() => projects.value.find((item) => item.id === selectedProjectId.value) ?? null)
const selectedTask = computed(() => tasks.value.find((item) => item.id === selectedTaskId.value) ?? null)

async function loadProjects(): Promise<void> {
  await loadProjectContext()
}

async function loadTasks(): Promise<void> {
  if (!selectedProjectId.value) {
    tasks.value = []
    status.value = '请先创建或选择项目'
    statusType.value = 'idle'
    return
  }
  tasks.value = await devtoolsApi.projects.listTasks({
    projectId: selectedProjectId.value,
    status: statusFilter.value,
    taskType: typeFilter.value,
    keyword: keyword.value
  })
  if (selectedTaskId.value && !tasks.value.some((item) => item.id === selectedTaskId.value)) selectedTaskId.value = ''
  if (!selectedTaskId.value && tasks.value[0]) applyTask(tasks.value[0])
  status.value = `已读取 ${tasks.value.length} 条项目任务`
  statusType.value = 'success'
}

function createTask(): void {
  selectedTaskId.value = ''
  form.value = {
    title: '',
    description: '',
    taskType: 'requirement',
    priority: 'medium',
    status: 'todo'
  }
  status.value = '正在创建新任务'
  statusType.value = 'idle'
  linkedHistory.value = []
  taskFiles.value = []
  selectedTaskFile.value = null
}

function applyTask(task: ProjectTask): void {
  selectedTaskId.value = task.id
  form.value = {
    title: task.title,
    description: task.description,
    taskType: task.taskType,
    priority: task.priority,
    status: task.status
  }
  status.value = `已选择任务：${task.title}`
  statusType.value = 'idle'
  void loadLinkedHistory()
  void loadTaskFiles()
}

async function loadLinkedHistory(): Promise<void> {
  if (!selectedProjectId.value || !selectedTaskId.value) {
    linkedHistory.value = []
    return
  }
  linkedHistory.value = await devtoolsApi.ai.getHistory(undefined, selectedProjectId.value, selectedTaskId.value)
}

async function loadTaskFiles(): Promise<void> {
  if (!selectedTaskId.value) {
    taskFiles.value = []
    selectedTaskFile.value = null
    return
  }
  taskFiles.value = await devtoolsApi.projects.listTaskFiles(selectedTaskId.value)
  if (selectedTaskFile.value && !taskFiles.value.some((item) => item.id === selectedTaskFile.value?.id)) {
    selectedTaskFile.value = null
  }
}

async function saveTask(): Promise<void> {
  if (!selectedProjectId.value) {
    handleError(new Error('请先选择项目'), '保存项目任务失败')
    return
  }
  try {
    tasks.value = await devtoolsApi.projects.saveTask({
      id: selectedTaskId.value || undefined,
      projectId: selectedProjectId.value,
      title: form.value.title,
      description: form.value.description,
      taskType: form.value.taskType,
      priority: form.value.priority,
      status: form.value.status
    })
    selectedTaskId.value = tasks.value.find((item) => item.title === form.value.title)?.id ?? tasks.value[0]?.id ?? ''
    if (selectedTask.value) applyTask(selectedTask.value)
    await loadLinkedHistory()
    await loadTaskFiles()
    status.value = '项目任务已保存'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '保存项目任务失败')
  }
}

async function deleteTask(): Promise<void> {
  if (!selectedTask.value || !selectedProjectId.value) return
  if (!window.confirm(`确认删除任务“${selectedTask.value.title}”？`)) return
  try {
    tasks.value = await devtoolsApi.projects.deleteTask(selectedTask.value.id, selectedProjectId.value)
    selectedTaskId.value = tasks.value[0]?.id ?? ''
    if (selectedTask.value) applyTask(selectedTask.value)
    else createTask()
    status.value = '项目任务已删除'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '删除项目任务失败')
  }
}

async function changeProject(): Promise<void> {
  selectedTaskId.value = ''
  createTask()
  await loadTasks()
}

async function openAiGenerate(mode: 'plan' | 'tests' | 'commit'): Promise<void> {
  if (!selectedProject.value) return
  const task = selectedTask.value
  const promptParts = [
    '请基于以下项目和任务上下文输出结果。',
    `项目：${selectedProject.value.name}`,
    `路径：${selectedProject.value.path}`,
    `技术栈：${selectedProject.value.techStack || '未设置'}`,
    `运行命令：${selectedProject.value.devCommand || '未设置'}`,
    `测试命令：${selectedProject.value.testCommand || '未设置'}`,
    `重要目录：\n${selectedProject.value.importantPaths || '未设置'}`
  ]
  if (task) {
    promptParts.push(
      `任务：${task.title}`,
      `类型：${task.taskType}`,
      `优先级：${task.priority}`,
      `状态：${task.status}`,
      `任务描述：\n${task.description || '无'}`
    )
  }
  if (taskFiles.value.length) {
    promptParts.push(
      '任务附件：',
      ...taskFiles.value.map((file) => `文件：${file.name}\n路径：${file.path}\n内容：\n${file.content}`)
    )
  }
  const instruction = {
    plan: '请生成开发方案，包含目标、涉及文件、实现步骤、风险点和验收建议。',
    tests: '请生成测试建议，包含测试范围、关键用例、边界条件、回归点和建议执行命令。',
    commit: '请生成提交说明草稿，包含背景、变更点、测试说明和风险提示。'
  }[mode]
  localStorage.setItem(
    'codexbox:ai-generate-draft',
    JSON.stringify({
      projectId: selectedProject.value.id,
      taskId: task?.id,
      mode,
      prompt: `${promptParts.join('\n')}\n\n${instruction}`
    })
  )
  await router.push('/ai-generate')
}

async function attachTaskFile(): Promise<void> {
  if (!selectedProjectId.value || !selectedTaskId.value) {
    handleError(new Error('请先保存并选择任务'), '上传任务文件失败')
    return
  }
  try {
    taskFiles.value = await devtoolsApi.projects.attachTaskFile(selectedProjectId.value, selectedTaskId.value)
    status.value = `任务文件已更新：${taskFiles.value.length} 个`
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '上传任务文件失败')
  }
}

async function deleteTaskFile(file: ProjectTaskFile): Promise<void> {
  if (!window.confirm(`确认删除任务文件“${file.name}”？`)) return
  try {
    taskFiles.value = await devtoolsApi.projects.deleteTaskFile(file.id, file.taskId)
    if (selectedTaskFile.value?.id === file.id) selectedTaskFile.value = null
    status.value = '任务文件已删除'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '删除任务文件失败')
  }
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
  void safeLoad('读取项目任务', async () => {
    await loadProjects()
    await loadTasks()
  })
})
</script>

<template>
  <section class="tool-panel">
    <header class="tool-header">
      <div class="tool-title">
        <h2>项目任务</h2>
        <p>管理需求、Bug、优化、重构、文档和发布任务，为后续 AI 任务时间线做准备。</p>
      </div>
      <div class="toolbar">
        <select v-model="selectedProjectId" class="select select-compact project-switcher" @change="changeProject">
          <option value="">选择项目</option>
          <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
        </select>
        <button class="button secondary" type="button" @click="createTask">
          <Plus :size="16" />
          新建
        </button>
        <button class="button" type="button" :disabled="!selectedProjectId" @click="saveTask">
          <Save :size="16" />
          保存
        </button>
      </div>
    </header>

    <div class="tool-body">
      <div v-if="!selectedProject" class="empty-state">
        <div class="empty-action">
          <ClipboardList :size="28" />
          <strong>任务必须归属于项目</strong>
          <span>先创建项目，再在项目内维护需求、Bug、优化和发布任务。</span>
          <RouterLink class="button" to="/projects">创建项目</RouterLink>
        </div>
      </div>

      <div v-else class="task-workspace-grid">
        <aside class="section">
          <div class="meta-row">
            <Search :size="16" />
            <strong>{{ selectedProject.name }}</strong>
            <span class="badge">{{ tasks.length }}</span>
          </div>
          <input v-model="keyword" class="input" placeholder="搜索标题或描述" @change="loadTasks" />
          <div class="filter-grid">
            <select v-model="statusFilter" class="select" @change="loadTasks">
              <option value="all">全部状态</option>
              <option value="todo">待处理</option>
              <option value="in_progress">进行中</option>
              <option value="pending_validation">待验证</option>
              <option value="done">已完成</option>
              <option value="archived">已归档</option>
            </select>
            <select v-model="typeFilter" class="select" @change="loadTasks">
              <option value="all">全部类型</option>
              <option value="requirement">需求</option>
              <option value="bug">Bug</option>
              <option value="improvement">优化</option>
              <option value="refactor">重构</option>
              <option value="documentation">文档</option>
              <option value="release">发布</option>
            </select>
          </div>

          <div class="history-list project-list">
            <button
              v-for="task in tasks"
              :key="task.id"
              class="list-item action-item project-list-item"
              :class="{ active: task.id === selectedTaskId }"
              type="button"
              @click="applyTask(task)"
            >
              <div>
                <strong>{{ task.title }}</strong>
                <small>{{ task.taskType }} / {{ task.priority }} / {{ formatDate(task.updatedAt) }}</small>
              </div>
              <span
                class="badge"
                :class="{ success: task.status === 'done', warning: task.status === 'pending_validation' }"
              >
                {{ task.status }}
              </span>
            </button>
            <div v-if="!tasks.length" class="empty-state compact-empty">暂无项目任务</div>
          </div>
        </aside>

        <section class="section task-editor">
          <div class="field">
            <label for="task-title">任务标题</label>
            <input id="task-title" v-model="form.title" class="input" placeholder="例如：新增项目仪表盘" />
          </div>

          <div class="filter-grid">
            <div class="field">
              <label for="task-type">类型</label>
              <select id="task-type" v-model="form.taskType" class="select">
                <option value="requirement">需求</option>
                <option value="bug">Bug</option>
                <option value="improvement">优化</option>
                <option value="refactor">重构</option>
                <option value="documentation">文档</option>
                <option value="release">发布</option>
              </select>
            </div>
            <div class="field">
              <label for="task-priority">优先级</label>
              <select id="task-priority" v-model="form.priority" class="select">
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
                <option value="urgent">紧急</option>
              </select>
            </div>
            <div class="field">
              <label for="task-status">状态</label>
              <select id="task-status" v-model="form.status" class="select">
                <option value="todo">待处理</option>
                <option value="in_progress">进行中</option>
                <option value="pending_validation">待验证</option>
                <option value="done">已完成</option>
                <option value="archived">已归档</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label for="task-description">任务描述</label>
            <textarea
              id="task-description"
              v-model="form.description"
              class="textarea task-description"
              placeholder="记录任务背景、范围、验收标准和风险点"
            />
          </div>

          <div class="toolbar">
            <button class="button" type="button" :disabled="!selectedProjectId" @click="saveTask">
              <Save :size="16" />
              保存任务
            </button>
            <button class="button secondary" type="button" @click="createTask">
              <Plus :size="16" />
              新建任务
            </button>
            <button class="button danger" type="button" :disabled="!selectedTask" @click="deleteTask">
              <Trash2 :size="16" />
              删除
            </button>
          </div>

          <div class="toolbar">
            <button class="button secondary" type="button" :disabled="!selectedProject" @click="openAiGenerate('plan')">
              生成开发方案
            </button>
            <button
              class="button secondary"
              type="button"
              :disabled="!selectedProject"
              @click="openAiGenerate('tests')"
            >
              生成测试建议
            </button>
            <button
              class="button secondary"
              type="button"
              :disabled="!selectedProject"
              @click="openAiGenerate('commit')"
            >
              生成提交说明
            </button>
          </div>

          <div v-if="selectedTask" class="code-box">
            创建时间：{{ formatDate(selectedTask.createdAt) }} 更新时间：{{
              formatDate(selectedTask.updatedAt)
            }}
            完成时间：{{ formatDate(selectedTask.completedAt) }}
          </div>

          <section class="section linked-history-panel">
            <div class="meta-row">
              <strong>任务文件</strong>
              <span class="badge">{{ taskFiles.length }}</span>
              <button
                class="button secondary compact-button"
                type="button"
                :disabled="!selectedTask"
                @click="attachTaskFile"
              >
                <Upload :size="14" />
                上传
              </button>
              <span v-if="!selectedTask" class="hint-text">保存并选中任务后可上传文件</span>
            </div>
            <div class="history-list compact-history">
              <div v-for="file in taskFiles" :key="file.id" class="list-item action-item">
                <button class="plain-list-button" type="button" @click="selectedTaskFile = file">
                  <strong>{{ file.name }}</strong>
                  <small>{{ file.sizeBytes }} bytes / {{ formatDate(file.createdAt) }}</small>
                </button>
                <div class="toolbar">
                  <button class="icon-button" type="button" aria-label="查看文件" @click="selectedTaskFile = file">
                    <Eye :size="16" />
                  </button>
                  <button class="icon-button" type="button" aria-label="删除文件" @click="deleteTaskFile(file)">
                    <Trash2 :size="16" />
                  </button>
                </div>
              </div>
              <div v-if="!taskFiles.length" class="empty-state compact-empty">
                {{ selectedTask ? '暂无任务文件' : '当前任务尚未保存，保存后可上传文件' }}
              </div>
            </div>
            <pre v-if="selectedTaskFile" class="output-box task-file-preview">{{ selectedTaskFile.content }}</pre>
          </section>

          <section v-if="selectedTask" class="section linked-history-panel">
            <div class="meta-row">
              <strong>关联 AI 输出</strong>
              <span class="badge">{{ linkedHistory.length }}</span>
            </div>
            <div class="history-list compact-history">
              <div v-for="item in linkedHistory" :key="item.id" class="list-item">
                <strong>{{ item.title }}</strong>
                <small>{{ item.taskType }} / {{ item.model }} / {{ formatDate(item.createdAt) }}</small>
              </div>
              <div v-if="!linkedHistory.length" class="empty-state compact-empty">暂无关联 AI 输出</div>
            </div>
          </section>
        </section>
      </div>
    </div>

    <footer class="status-bar" :class="statusType" role="status" aria-live="polite">{{ status }}</footer>
  </section>
</template>
