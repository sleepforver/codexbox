<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Bot, GitBranch, Plus, Save, Trash2, Wand2 } from 'lucide-vue-next'
import type {
  AgentWorkflowRun,
  AgentWorkflowStatus,
  ProjectAgent,
  ProjectAgentRole,
  ProjectAgentStatus,
  ProjectTask
} from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'
import { safeLoad } from '../safeLoad'
import { currentProjectId, loadProjectContext, projects as contextProjects } from '../stores/projectContext'
import { showToast } from '../toast'

const projects = contextProjects
const selectedProjectId = currentProjectId
const agents = ref<ProjectAgent[]>([])
const tasks = ref<ProjectTask[]>([])
const runs = ref<AgentWorkflowRun[]>([])
const selectedAgentId = ref('')
const selectedRunId = ref('')
const selectedTaskId = ref('')
const workflowGoal = ref('')
const status = ref('正在读取 Agent 工作站')
const statusType = ref<'idle' | 'success' | 'error'>('idle')
const agentForm = ref({
  name: '',
  role: 'pm' as ProjectAgentRole,
  provider: 'siliconflow' as ProjectAgent['provider'],
  model: 'Qwen/Qwen2.5-7B-Instruct',
  systemPrompt: '',
  responsibilities: '',
  status: 'active' as ProjectAgentStatus
})
const runForm = ref({
  title: '',
  goal: '',
  status: 'draft' as AgentWorkflowStatus,
  output: ''
})

const selectedProject = computed(() => projects.value.find((project) => project.id === selectedProjectId.value) ?? null)
const selectedAgent = computed(() => agents.value.find((agent) => agent.id === selectedAgentId.value) ?? null)
const selectedRun = computed(() => runs.value.find((run) => run.id === selectedRunId.value) ?? null)

const roleLabels: Record<ProjectAgentRole, string> = {
  pm: '项目经理',
  architect: '架构师',
  developer: '开发',
  tester: '测试',
  reviewer: '审查',
  release: '发布'
}

async function loadProjects(): Promise<void> {
  await loadProjectContext()
}

async function loadAgents(): Promise<void> {
  if (!selectedProjectId.value) {
    agents.value = []
    runs.value = []
    tasks.value = []
    status.value = '请先创建或选择项目'
    statusType.value = 'idle'
    return
  }
  agents.value = await devtoolsApi.projects.listAgents(selectedProjectId.value)
  tasks.value = await devtoolsApi.projects.listTasks({ projectId: selectedProjectId.value })
  runs.value = await devtoolsApi.projects.listAgentRuns(selectedProjectId.value)
  if (selectedAgentId.value && !agents.value.some((agent) => agent.id === selectedAgentId.value))
    selectedAgentId.value = ''
  if (!selectedAgentId.value && agents.value[0]) applyAgent(agents.value[0])
  if (selectedRunId.value && !runs.value.some((run) => run.id === selectedRunId.value)) selectedRunId.value = ''
  if (!selectedRunId.value && runs.value[0]) applyRun(runs.value[0])
  status.value = `已读取 ${agents.value.length} 个 Agent、${runs.value.length} 条工作流`
  statusType.value = 'success'
}

function createAgent(): void {
  selectedAgentId.value = ''
  agentForm.value = {
    name: '',
    role: 'pm',
    provider: 'siliconflow',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    systemPrompt: '',
    responsibilities: '',
    status: 'active'
  }
}

function applyAgent(agent: ProjectAgent): void {
  selectedAgentId.value = agent.id
  agentForm.value = {
    name: agent.name,
    role: agent.role,
    provider: agent.provider,
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    responsibilities: agent.responsibilities,
    status: agent.status
  }
}

async function saveAgent(): Promise<void> {
  if (!selectedProjectId.value) {
    handleError(new Error('请先选择项目'), '保存 Agent 失败')
    return
  }
  try {
    agents.value = await devtoolsApi.projects.saveAgent({
      id: selectedAgentId.value || undefined,
      projectId: selectedProjectId.value,
      ...agentForm.value
    })
    selectedAgentId.value =
      agents.value.find((agent) => agent.name === agentForm.value.name)?.id ?? agents.value[0]?.id ?? ''
    if (selectedAgent.value) applyAgent(selectedAgent.value)
    status.value = '项目 Agent 已保存'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '保存 Agent 失败')
  }
}

async function deleteAgent(): Promise<void> {
  if (!selectedAgent.value || !selectedProjectId.value) return
  if (!window.confirm(`确认删除 Agent“${selectedAgent.value.name}”？`)) return
  try {
    agents.value = await devtoolsApi.projects.deleteAgent(selectedAgent.value.id, selectedProjectId.value)
    selectedAgentId.value = agents.value[0]?.id ?? ''
    if (selectedAgent.value) applyAgent(selectedAgent.value)
    else createAgent()
    status.value = '项目 Agent 已删除'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '删除 Agent 失败')
  }
}

async function createWorkflowPlan(): Promise<void> {
  if (!selectedProjectId.value) {
    handleError(new Error('请先选择项目'), '创建 Agent 工作流失败')
    return
  }
  try {
    const run = await devtoolsApi.projects.createAgentWorkflowPlan({
      projectId: selectedProjectId.value,
      taskId: selectedTaskId.value || undefined,
      goal: workflowGoal.value
    })
    runs.value = await devtoolsApi.projects.listAgentRuns(selectedProjectId.value)
    applyRun(run)
    status.value = 'Agent 工作流草案已创建'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '创建 Agent 工作流失败')
  }
}

function applyRun(run: AgentWorkflowRun): void {
  selectedRunId.value = run.id
  selectedTaskId.value = run.taskId ?? ''
  workflowGoal.value = run.goal
  runForm.value = {
    title: run.title,
    goal: run.goal,
    status: run.status,
    output: run.output
  }
}

async function saveRun(): Promise<void> {
  if (!selectedProjectId.value || !selectedRun.value) {
    handleError(new Error('请先创建工作流'), '保存 Agent 工作流失败')
    return
  }
  try {
    runs.value = await devtoolsApi.projects.saveAgentRun({
      id: selectedRun.value.id,
      projectId: selectedProjectId.value,
      taskId: selectedTaskId.value || undefined,
      title: runForm.value.title,
      goal: runForm.value.goal,
      status: runForm.value.status,
      steps: selectedRun.value.steps,
      output: runForm.value.output
    })
    const updated = runs.value.find((run) => run.id === selectedRunId.value)
    if (updated) applyRun(updated)
    status.value = 'Agent 工作流已保存'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '保存 Agent 工作流失败')
  }
}

async function deleteRun(): Promise<void> {
  if (!selectedRun.value || !selectedProjectId.value) return
  if (!window.confirm(`确认删除工作流“${selectedRun.value.title}”？`)) return
  try {
    runs.value = await devtoolsApi.projects.deleteAgentRun(selectedRun.value.id, selectedProjectId.value)
    selectedRunId.value = runs.value[0]?.id ?? ''
    if (selectedRun.value) applyRun(selectedRun.value)
    status.value = 'Agent 工作流已删除'
    statusType.value = 'success'
    showToast(status.value, 'success')
  } catch (error) {
    handleError(error, '删除 Agent 工作流失败')
  }
}

function copyRunPrompt(): void {
  if (!selectedRun.value || !selectedProject.value) return
  const prompt = [
    `项目：${selectedProject.value.name}`,
    `路径：${selectedProject.value.path}`,
    `目标：${selectedRun.value.goal}`,
    '',
    '请按照以下 Agent 分工输出项目推进方案：',
    ...selectedRun.value.steps.map(
      (step, index) => `${index + 1}. ${step.agentName}（${roleLabels[step.role]}）\n${step.instruction}`
    )
  ].join('\n')
  localStorage.setItem(
    'codexbox:ai-generate-draft',
    JSON.stringify({
      projectId: selectedProject.value.id,
      taskId: selectedRun.value.taskId,
      mode: 'agent-workflow',
      prompt
    })
  )
  status.value = 'Agent 工作流提示已发送到 AI 开发页'
  statusType.value = 'success'
  showToast(status.value, 'success')
}

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : '暂无'
}

function handleError(error: unknown, fallback: string): void {
  status.value = error instanceof Error ? error.message : fallback
  statusType.value = 'error'
  showToast(status.value, 'error')
}

async function changeProject(): Promise<void> {
  selectedAgentId.value = ''
  selectedRunId.value = ''
  selectedTaskId.value = ''
  workflowGoal.value = ''
  createAgent()
  await loadAgents()
}

onMounted(() => {
  void safeLoad('读取 Agent 工作站', async () => {
    await loadProjects()
    await loadAgents()
  })
})
</script>

<template>
  <section class="tool-panel">
    <header class="tool-header">
      <div class="tool-title">
        <h2>Agent 工作站</h2>
        <p>为项目配置项目经理、架构、开发、测试和审查 Agent，并把任务推进成可追踪的协同工作流。</p>
      </div>
      <div class="toolbar">
        <select v-model="selectedProjectId" class="select select-compact project-switcher" @change="changeProject">
          <option value="">选择项目</option>
          <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
        </select>
        <button class="button secondary" type="button" :disabled="!selectedProjectId" @click="createAgent">
          <Plus :size="16" />
          新建 Agent
        </button>
      </div>
    </header>

    <div class="tool-body">
      <div v-if="!selectedProject" class="empty-state">
        <div class="empty-action">
          <Bot :size="28" />
          <strong>Agent 必须归属于项目</strong>
          <span>先创建项目，再为项目配置不同职责的 AI Agent。</span>
          <RouterLink class="button" to="/projects">创建项目</RouterLink>
        </div>
      </div>

      <div v-else class="task-workspace-grid">
        <aside class="section">
          <div class="meta-row">
            <Bot :size="16" />
            <strong>{{ selectedProject.name }}</strong>
            <span class="badge">{{ agents.length }}</span>
          </div>
          <div class="history-list project-list">
            <button
              v-for="agent in agents"
              :key="agent.id"
              class="list-item action-item project-list-item"
              :class="{ active: agent.id === selectedAgentId }"
              type="button"
              @click="applyAgent(agent)"
            >
              <div>
                <strong>{{ agent.name }}</strong>
                <small>{{ roleLabels[agent.role] }} / {{ agent.model }}</small>
              </div>
              <span class="badge" :class="{ success: agent.status === 'active' }">{{ agent.status }}</span>
            </button>
          </div>
        </aside>

        <section class="section task-editor">
          <div class="filter-grid">
            <div class="field">
              <label for="agent-name">Agent 名称</label>
              <input id="agent-name" v-model="agentForm.name" class="input" placeholder="例如：架构审查 Agent" />
            </div>
            <div class="field">
              <label for="agent-role">职责角色</label>
              <select id="agent-role" v-model="agentForm.role" class="select">
                <option value="pm">项目经理</option>
                <option value="architect">架构师</option>
                <option value="developer">开发</option>
                <option value="tester">测试</option>
                <option value="reviewer">审查</option>
                <option value="release">发布</option>
              </select>
            </div>
            <div class="field">
              <label for="agent-status">状态</label>
              <select id="agent-status" v-model="agentForm.status" class="select">
                <option value="active">启用</option>
                <option value="paused">暂停</option>
              </select>
            </div>
          </div>

          <div class="filter-grid">
            <div class="field">
              <label for="agent-provider">模型平台</label>
              <select id="agent-provider" v-model="agentForm.provider" class="select">
                <option value="siliconflow">SiliconFlow</option>
                <option value="openai">OpenAI</option>
                <option value="deepseek">DeepSeek</option>
                <option value="custom">兼容接口</option>
              </select>
            </div>
            <div class="field">
              <label for="agent-model">模型</label>
              <input id="agent-model" v-model="agentForm.model" class="input" placeholder="模型名称" />
            </div>
          </div>

          <div class="field">
            <label for="agent-responsibilities">职责范围</label>
            <textarea
              id="agent-responsibilities"
              v-model="agentForm.responsibilities"
              class="textarea"
              placeholder="记录这个 Agent 负责的流程、输入和输出"
            />
          </div>
          <div class="field">
            <label for="agent-system-prompt">系统提示词</label>
            <textarea
              id="agent-system-prompt"
              v-model="agentForm.systemPrompt"
              class="textarea task-description"
              placeholder="定义该 Agent 的判断标准、输出格式和边界"
            />
          </div>

          <div class="toolbar">
            <button class="button" type="button" :disabled="!selectedProjectId" @click="saveAgent">
              <Save :size="16" />
              保存 Agent
            </button>
            <button class="button danger" type="button" :disabled="!selectedAgent" @click="deleteAgent">
              <Trash2 :size="16" />
              删除
            </button>
          </div>
        </section>

        <section class="section task-editor">
          <div class="meta-row">
            <GitBranch :size="16" />
            <strong>协同工作流</strong>
            <span class="badge">{{ runs.length }}</span>
          </div>
          <div class="filter-grid">
            <select v-model="selectedTaskId" class="select">
              <option value="">不绑定任务</option>
              <option v-for="task in tasks" :key="task.id" :value="task.id">{{ task.title }}</option>
            </select>
            <input v-model="workflowGoal" class="input" placeholder="输入本次协同目标" />
          </div>
          <div class="toolbar">
            <button class="button" type="button" :disabled="!selectedProjectId" @click="createWorkflowPlan">
              <Wand2 :size="16" />
              生成工作流
            </button>
            <button class="button secondary" type="button" :disabled="!selectedRun" @click="copyRunPrompt">
              发送到 AI 开发
            </button>
          </div>

          <div class="history-list project-list">
            <button
              v-for="run in runs"
              :key="run.id"
              class="list-item action-item project-list-item"
              :class="{ active: run.id === selectedRunId }"
              type="button"
              @click="applyRun(run)"
            >
              <div>
                <strong>{{ run.title }}</strong>
                <small>{{ run.steps.length }} 个 Agent / {{ formatDate(run.updatedAt) }}</small>
              </div>
              <span class="badge" :class="{ success: run.status === 'done', warning: run.status === 'blocked' }">
                {{ run.status }}
              </span>
            </button>
          </div>

          <div v-if="selectedRun" class="field">
            <label for="run-status">工作流状态</label>
            <select id="run-status" v-model="runForm.status" class="select">
              <option value="draft">草稿</option>
              <option value="running">执行中</option>
              <option value="blocked">阻塞</option>
              <option value="done">完成</option>
            </select>
          </div>
          <div v-if="selectedRun" class="history-list compact-history">
            <div v-for="step in selectedRun.steps" :key="step.agentId" class="list-item">
              <strong>{{ step.agentName }} / {{ roleLabels[step.role] }}</strong>
              <small>{{ step.instruction }}</small>
            </div>
          </div>
          <div v-if="selectedRun" class="field">
            <label for="run-output">执行结果</label>
            <textarea
              id="run-output"
              v-model="runForm.output"
              class="textarea task-description"
              placeholder="记录各 Agent 产出的综合结论、风险、待办和验收结果"
            />
          </div>
          <div v-if="selectedRun" class="toolbar">
            <button class="button" type="button" @click="saveRun">
              <Save :size="16" />
              保存工作流
            </button>
            <button class="button danger" type="button" @click="deleteRun">
              <Trash2 :size="16" />
              删除工作流
            </button>
          </div>
        </section>
      </div>
    </div>

    <footer class="status-bar" :class="statusType" role="status" aria-live="polite">{{ status }}</footer>
  </section>
</template>
