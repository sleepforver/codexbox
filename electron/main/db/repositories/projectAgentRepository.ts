import { randomUUID } from 'node:crypto'
import type {
  AgentWorkflowPlanRequest,
  AgentWorkflowRun,
  AgentWorkflowRunSaveRequest,
  AgentWorkflowStep,
  ProjectAgent,
  ProjectAgentRole,
  ProjectAgentSaveRequest
} from '../../../../src/shared/ipc.js'
import {
  agentWorkflowPlanSchema,
  agentWorkflowRunSaveSchema,
  projectAgentSaveSchema
} from '../../validation/schemas.js'
import { getDatabase, persist } from '../connection.js'
import { readMany, readOne, run } from '../runtime.js'
import { listProjectTasksFromDb } from './projectTaskRepository.js'

interface ProjectAgentRow {
  id: string
  project_id: string
  name: string
  role: ProjectAgentRole
  provider: ProjectAgent['provider']
  model: string
  system_prompt: string
  responsibilities: string
  status: ProjectAgent['status']
  created_at: string
  updated_at: string
}

interface AgentWorkflowRunRow {
  id: string
  project_id: string
  task_id: string | null
  title: string
  goal: string
  status: AgentWorkflowRun['status']
  steps: string
  output: string
  created_at: string
  updated_at: string
}

const defaultAgentTemplates: Array<
  Pick<ProjectAgent, 'name' | 'role' | 'provider' | 'model' | 'systemPrompt' | 'responsibilities' | 'status'>
> = [
  {
    name: '项目经理 Agent',
    role: 'pm',
    provider: 'siliconflow',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    systemPrompt: '你负责把项目目标拆解为可执行任务，维护优先级、里程碑、验收标准和风险。',
    responsibilities: '需求澄清、任务拆解、进度跟踪、验收口径',
    status: 'active'
  },
  {
    name: '架构师 Agent',
    role: 'architect',
    provider: 'siliconflow',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    systemPrompt: '你负责识别技术边界、数据模型、模块职责和风险控制点。',
    responsibilities: '架构方案、接口边界、数据模型、技术风险',
    status: 'active'
  },
  {
    name: '开发 Agent',
    role: 'developer',
    provider: 'siliconflow',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    systemPrompt: '你负责根据任务上下文输出可落地的实现步骤、文件范围和验证命令。',
    responsibilities: '实现计划、文件清单、提交说明、联调建议',
    status: 'active'
  },
  {
    name: '测试 Agent',
    role: 'tester',
    provider: 'siliconflow',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    systemPrompt: '你负责生成测试策略、回归范围、边界用例和验收检查清单。',
    responsibilities: '测试用例、回归范围、验收清单、质量门禁',
    status: 'active'
  },
  {
    name: '审查 Agent',
    role: 'reviewer',
    provider: 'siliconflow',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    systemPrompt: '你负责从风险、可维护性、数据安全和发布影响角度审查变更。',
    responsibilities: '代码审查、风险提示、遗漏检查、发布建议',
    status: 'active'
  }
]

function mapProjectAgent(row: ProjectAgentRow): ProjectAgent {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    role: row.role,
    provider: row.provider,
    model: row.model,
    systemPrompt: row.system_prompt,
    responsibilities: row.responsibilities,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapWorkflowRun(row: AgentWorkflowRunRow): AgentWorkflowRun {
  return {
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id ?? undefined,
    title: row.title,
    goal: row.goal,
    status: row.status,
    steps: parseWorkflowSteps(row.steps),
    output: row.output,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function parseWorkflowSteps(value: string): AgentWorkflowStep[] {
  try {
    const parsed = JSON.parse(value) as AgentWorkflowStep[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function listProjectAgentsFromDb(projectId: string): Promise<ProjectAgent[]> {
  if (!projectId.trim()) return []
  const db = await getDatabase()
  const rows = readMany<ProjectAgentRow>(
    db,
    `SELECT id, project_id, name, role, provider, model, system_prompt, responsibilities, status, created_at, updated_at
      FROM project_agents
      WHERE project_id = ?
      ORDER BY
        CASE role
          WHEN 'pm' THEN 0
          WHEN 'architect' THEN 1
          WHEN 'developer' THEN 2
          WHEN 'tester' THEN 3
          WHEN 'reviewer' THEN 4
          ELSE 5
        END,
        updated_at DESC`,
    [projectId]
  )
  if (rows.length) return rows.map(mapProjectAgent)
  return seedDefaultAgents(projectId)
}

async function seedDefaultAgents(projectId: string): Promise<ProjectAgent[]> {
  const db = await getDatabase()
  const now = new Date().toISOString()
  for (const agent of defaultAgentTemplates) {
    run(
      db,
      `INSERT INTO project_agents
        (id, project_id, name, role, provider, model, system_prompt, responsibilities, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        projectId,
        agent.name,
        agent.role,
        agent.provider,
        agent.model,
        agent.systemPrompt,
        agent.responsibilities,
        agent.status,
        now,
        now
      ]
    )
  }
  persist(db)
  return listProjectAgentsFromDb(projectId)
}

export async function saveProjectAgentToDb(request: ProjectAgentSaveRequest): Promise<ProjectAgent[]> {
  const parsed = projectAgentSaveSchema.parse(request)
  if (!parsed.projectId.trim()) throw new Error('项目不能为空')
  const db = await getDatabase()
  const now = new Date().toISOString()
  const id = parsed.id || randomUUID()
  const createdAt =
    parsed.id &&
    readOne<{ created_at: string }>(db, 'SELECT created_at FROM project_agents WHERE id = ? AND project_id = ?', [
      parsed.id,
      parsed.projectId
    ])?.created_at

  run(
    db,
    `INSERT OR REPLACE INTO project_agents
      (id, project_id, name, role, provider, model, system_prompt, responsibilities, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      parsed.projectId,
      parsed.name.trim() || '未命名 Agent',
      parsed.role,
      parsed.provider,
      parsed.model.trim(),
      parsed.systemPrompt.trim(),
      parsed.responsibilities.trim(),
      parsed.status,
      createdAt || now,
      now
    ]
  )
  persist(db)
  return listProjectAgentsFromDb(parsed.projectId)
}

export async function deleteProjectAgentFromDb(id: string, projectId: string): Promise<ProjectAgent[]> {
  const db = await getDatabase()
  run(db, 'DELETE FROM project_agents WHERE id = ? AND project_id = ?', [id, projectId])
  persist(db)
  return listProjectAgentsFromDb(projectId)
}

export async function listAgentWorkflowRunsFromDb(projectId: string, taskId?: string): Promise<AgentWorkflowRun[]> {
  if (!projectId.trim()) return []
  const db = await getDatabase()
  const clauses = ['project_id = ?']
  const params: string[] = [projectId]
  if (taskId?.trim()) {
    clauses.push('task_id = ?')
    params.push(taskId)
  }
  const rows = readMany<AgentWorkflowRunRow>(
    db,
    `SELECT id, project_id, task_id, title, goal, status, steps, output, created_at, updated_at
      FROM agent_workflow_runs
      WHERE ${clauses.join(' AND ')}
      ORDER BY updated_at DESC`,
    params
  )
  return rows.map(mapWorkflowRun)
}

export async function createAgentWorkflowPlanFromDb(request: AgentWorkflowPlanRequest): Promise<AgentWorkflowRun> {
  const parsed = agentWorkflowPlanSchema.parse(request)
  if (!parsed.projectId.trim()) throw new Error('项目不能为空')
  const agents = (await listProjectAgentsFromDb(parsed.projectId)).filter((agent) => agent.status === 'active')
  const tasks = await listProjectTasksFromDb({ projectId: parsed.projectId })
  const task = parsed.taskId ? tasks.find((item) => item.id === parsed.taskId) : null
  const goal = parsed.goal.trim() || task?.title || '项目工作流推进'
  const steps = agents.map((agent) => ({
    agentId: agent.id,
    agentName: agent.name,
    role: agent.role,
    instruction: buildAgentInstruction(agent, goal, task?.title)
  }))
  const title = task ? `${task.title} - Agent 工作流` : `${goal.slice(0, 32)} - Agent 工作流`
  const [run] = await saveAgentWorkflowRunToDb({
    projectId: parsed.projectId,
    taskId: parsed.taskId,
    title,
    goal,
    status: 'draft',
    steps,
    output: ''
  })
  return run
}

function buildAgentInstruction(agent: ProjectAgent, goal: string, taskTitle?: string): string {
  const scope = taskTitle ? `关联任务：${taskTitle}` : '关联范围：当前项目'
  return [
    `目标：${goal}`,
    scope,
    `职责：${agent.responsibilities}`,
    `输出要求：围绕自身角色给出可执行结论、风险和下一步动作。`
  ].join('\n')
}

export async function saveAgentWorkflowRunToDb(request: AgentWorkflowRunSaveRequest): Promise<AgentWorkflowRun[]> {
  const parsed = agentWorkflowRunSaveSchema.parse(request)
  if (!parsed.projectId.trim()) throw new Error('项目不能为空')
  const db = await getDatabase()
  const now = new Date().toISOString()
  const id = parsed.id || randomUUID()
  const createdAt =
    parsed.id &&
    readOne<{ created_at: string }>(db, 'SELECT created_at FROM agent_workflow_runs WHERE id = ? AND project_id = ?', [
      parsed.id,
      parsed.projectId
    ])?.created_at

  run(
    db,
    `INSERT OR REPLACE INTO agent_workflow_runs
      (id, project_id, task_id, title, goal, status, steps, output, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      parsed.projectId,
      parsed.taskId?.trim() || null,
      parsed.title.trim() || '未命名 Agent 工作流',
      parsed.goal.trim(),
      parsed.status,
      JSON.stringify(parsed.steps),
      parsed.output.trim(),
      createdAt || now,
      now
    ]
  )
  persist(db)
  return listAgentWorkflowRunsFromDb(parsed.projectId)
}

export async function deleteAgentWorkflowRunFromDb(id: string, projectId: string): Promise<AgentWorkflowRun[]> {
  const db = await getDatabase()
  run(db, 'DELETE FROM agent_workflow_runs WHERE id = ? AND project_id = ?', [id, projectId])
  persist(db)
  return listAgentWorkflowRunsFromDb(projectId)
}
