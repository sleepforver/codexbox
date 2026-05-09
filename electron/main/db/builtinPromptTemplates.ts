import type { AiPromptTemplate } from '../../../src/shared/ipc.js'

export const builtinPromptTemplates: Array<
  Pick<AiPromptTemplate, 'id' | 'taskType' | 'name' | 'content' | 'variables'>
> = [
  {
    id: 'builtin-explain-risk-review',
    taskType: 'explain-code',
    name: '代码风险审查',
    content:
      '请从通用软件工程角度审查以下代码：\n\n{{code}}\n\n请按“意图概述、关键流程、潜在风险、改进建议、建议测试”五段输出。',
    variables: ['code']
  },
  {
    id: 'builtin-explain-geojson',
    taskType: 'explain-code',
    name: 'GeoJSON 数据解释',
    content: '请解释以下 GeoJSON 或地理数据处理代码的作用，并说明数据结构、坐标处理和质量校验风险：\n\n{{code}}',
    variables: ['code']
  },
  {
    id: 'builtin-generate-geojson-validator',
    taskType: 'generate-code',
    name: 'GeoJSON 体检函数',
    content:
      '请生成一个 TypeScript 函数，用于校验 GeoJSON FeatureCollection。要求统计 geometry 类型、计算经纬度范围、检查必填属性 {{requiredFields}}，并返回结构化问题列表。',
    variables: ['requiredFields']
  },
  {
    id: 'builtin-generate-dataset-checker',
    taskType: 'generate-code',
    name: '通用数据字段检查',
    content:
      '请生成 TypeScript 代码，校验一组业务数据记录。字段包括 featureId、datasetName、category、geometry。要求输出缺失字段、重复标识和坐标异常。',
    variables: []
  },
  {
    id: 'builtin-api-debug-general',
    taskType: 'api-debug',
    name: 'API 报文排错',
    content:
      '请分析以下 API 请求和响应，重点检查鉴权、参数、分页、服务端错误和业务字段是否合理：\n\n{{requestAndResponse}}',
    variables: ['requestAndResponse']
  },
  {
    id: 'builtin-git-summary-general',
    taskType: 'git-summary',
    name: '通用变更说明',
    content: '请根据以下 Git diff 生成中文变更说明，按“功能变化、影响范围、风险点、建议验证”输出：\n\n{{diff}}',
    variables: ['diff']
  },
  {
    id: 'builtin-commit-message-standard',
    taskType: 'commit-message',
    name: '规范 Commit Message',
    content:
      '请根据以下 Git diff 生成规范 commit message。要求包含一行 Conventional Commits 标题，必要时补充中文正文：\n\n{{diff}}',
    variables: ['diff']
  }
]
