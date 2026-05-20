import { z } from 'zod'

export const apiMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])

export const aiTaskTypeSchema = z.enum(['explain-code', 'generate-code', 'git-summary', 'commit-message', 'api-debug'])
export const aiHistorySourceTypeSchema = z.enum([
  'manual',
  'project',
  'task',
  'git_diff',
  'api_response',
  'code_review'
])

export const headerPairSchema = z.object({
  key: z.string(),
  value: z.string()
})

export const envPairSchema = headerPairSchema

export const apiHistoryItemSchema = z.object({
  method: apiMethodSchema,
  url: z.string(),
  at: z.string()
})

export const apiToolStateSchema = z.object({
  envVars: z.array(envPairSchema),
  history: z.array(apiHistoryItemSchema)
})

export const apiSavedRequestInputSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  method: apiMethodSchema,
  url: z.string(),
  headers: z.array(headerPairSchema),
  body: z.string(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
  groupName: z.string().optional(),
  sourceType: z.enum(['spring-controller', 'frontend-call', 'openapi', 'manual']).optional(),
  sourcePath: z.string().optional(),
  confidence: z.number().optional()
})

export const aiHistorySaveSchema = z.object({
  taskType: aiTaskTypeSchema,
  title: z.string(),
  prompt: z.string(),
  output: z.string(),
  model: z.string(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
  sourceType: aiHistorySourceTypeSchema.optional(),
  sourceRef: z.string().optional()
})

export const aiPromptTemplateSchema = z.object({
  id: z.string(),
  taskType: aiTaskTypeSchema,
  name: z.string(),
  content: z.string(),
  variables: z.array(z.string()),
  isBuiltin: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const aiPromptTemplateSaveSchema = z.object({
  id: z.string().optional(),
  taskType: aiTaskTypeSchema,
  name: z.string(),
  content: z.string(),
  variables: z.array(z.string())
})

export const workspaceProjectSaveSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  path: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  projectType: z.string().optional(),
  techStack: z.string().optional(),
  installCommand: z.string().optional(),
  devCommand: z.string().optional(),
  testCommand: z.string().optional(),
  buildCommand: z.string().optional(),
  importantPaths: z.string().optional(),
  notes: z.string().optional()
})

export const workspaceProjectSchema = workspaceProjectSaveSchema.extend({
  id: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  lastOpenedAt: z.string().nullable().optional()
})

export const projectTaskStatusSchema = z.enum(['todo', 'in_progress', 'pending_validation', 'done', 'archived'])
export const projectTaskTypeSchema = z.enum([
  'requirement',
  'bug',
  'improvement',
  'refactor',
  'documentation',
  'release'
])
export const projectTaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])
export const projectAgentRoleSchema = z.enum(['pm', 'architect', 'developer', 'tester', 'reviewer', 'release'])
export const projectAgentStatusSchema = z.enum(['active', 'paused'])
export const agentWorkflowStatusSchema = z.enum(['draft', 'running', 'blocked', 'done'])

export const projectTaskFiltersSchema = z.object({
  projectId: z.string(),
  status: z.union([projectTaskStatusSchema, z.literal('all')]).optional(),
  taskType: z.union([projectTaskTypeSchema, z.literal('all')]).optional(),
  keyword: z.string().optional()
})

export const projectTaskSaveSchema = z.object({
  id: z.string().optional(),
  projectId: z.string(),
  title: z.string(),
  description: z.string(),
  taskType: projectTaskTypeSchema,
  priority: projectTaskPrioritySchema,
  status: projectTaskStatusSchema
})

export const projectAgentSaveSchema = z.object({
  id: z.string().optional(),
  projectId: z.string(),
  name: z.string(),
  role: projectAgentRoleSchema,
  provider: z.enum(['siliconflow', 'openai', 'deepseek', 'custom']),
  model: z.string(),
  systemPrompt: z.string(),
  responsibilities: z.string(),
  status: projectAgentStatusSchema
})

export const agentWorkflowStepSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  role: projectAgentRoleSchema,
  instruction: z.string()
})

export const agentWorkflowRunSaveSchema = z.object({
  id: z.string().optional(),
  projectId: z.string(),
  taskId: z.string().optional(),
  title: z.string(),
  goal: z.string(),
  status: agentWorkflowStatusSchema,
  steps: z.array(agentWorkflowStepSchema),
  output: z.string()
})

export const agentWorkflowPlanSchema = z.object({
  projectId: z.string(),
  taskId: z.string().optional(),
  goal: z.string()
})

export const projectKnowledgeFiltersSchema = z.object({
  projectId: z.string(),
  keyword: z.string().optional(),
  favoriteOnly: z.boolean().optional()
})

export const projectKnowledgeSaveSchema = z.object({
  id: z.string().optional(),
  projectId: z.string(),
  title: z.string(),
  content: z.string(),
  sourceType: aiHistorySourceTypeSchema,
  sourceId: z.string().optional(),
  isFavorite: z.boolean().optional()
})

const projectTaskPackageSchema = projectTaskSaveSchema.extend({
  id: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  completedAt: z.string().nullable().optional()
})

const projectKnowledgePackageSchema = projectKnowledgeSaveSchema.extend({
  id: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
})

export const projectPackageSchema = z.object({
  project: workspaceProjectSchema,
  aiHistory: z.array(
    aiHistorySaveSchema.extend({
      id: z.string().optional(),
      createdAt: z.string().optional(),
      isFavorite: z.boolean().optional()
    })
  ),
  apiRequests: z.array(
    apiSavedRequestInputSchema.extend({ createdAt: z.string().optional(), updatedAt: z.string().optional() })
  ),
  tasks: z.array(projectTaskPackageSchema).optional(),
  knowledge: z.array(projectKnowledgePackageSchema).optional(),
  exportedAt: z.string().optional()
})

export const importEnvelopeSchema = z.object({
  version: z.number().optional(),
  type: z.string().optional(),
  exportedAt: z.string().optional(),
  items: z.array(z.unknown())
})

export function formatValidationError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ')
  }

  return error instanceof Error ? error.message : '数据格式校验失败'
}
