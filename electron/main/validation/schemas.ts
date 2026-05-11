import { z } from 'zod'

export const apiMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])

export const aiTaskTypeSchema = z.enum(['explain-code', 'generate-code', 'git-summary', 'commit-message', 'api-debug'])

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
  projectId: z.string().optional()
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
  tags: z.array(z.string())
})

export const workspaceProjectSchema = workspaceProjectSaveSchema.extend({
  id: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  lastOpenedAt: z.string().nullable().optional()
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
