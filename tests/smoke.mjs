import assert from 'node:assert/strict'

function resolveVariables(value, envVars) {
  return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key) => {
    return envVars.find((item) => item.key === key)?.value ?? ''
  })
}

function readPathValue(source, path) {
  const normalized = path.trim().replace(/^\$\.?/, '')
  if (!normalized) return { matched: true, value: source }

  const segments = normalized
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)

  let current = source
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return { matched: false, value: undefined }
      current = current[index]
      continue
    }
    if (current !== null && typeof current === 'object' && segment in current) {
      current = current[segment]
      continue
    }
    return { matched: false, value: undefined }
  }

  return { matched: true, value: current }
}

function parseStatus(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const branchLine = lines.find((line) => line.startsWith('## '))
  const changes = lines
    .filter((line) => !line.startsWith('## '))
    .map((line) => ({
      status: line.slice(0, 2).trim() || 'modified',
      path: line.slice(3).trim()
    }))

  return {
    branch: branchLine?.replace(/^##\s*/, '') || 'unknown',
    changes
  }
}

function collectCoordinatePairs(value, pairs) {
  if (!Array.isArray(value)) return
  if (
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    pairs.push([value[0], value[1]])
    return
  }
  value.forEach((item) => collectCoordinatePairs(item, pairs))
}

function summarizeGeoJson(source) {
  const typeCounts = new Map()
  const issues = []
  for (const [index, feature] of source.features.entries()) {
    const type = feature.geometry?.type || 'Unknown'
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1)
    const pairs = []
    collectCoordinatePairs(feature.geometry?.coordinates, pairs)
    if (!pairs.length) issues.push(`features[${index}]`)
  }
  return { typeCounts: [...typeCounts.entries()], issues }
}

function renderPromptTemplate(content, variables) {
  return content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key) => variables[key] ?? '')
}

function extractPromptVariables(content) {
  return [...new Set([...content.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map((match) => match[1]))]
}

function exportEnvelope(type, items) {
  return JSON.stringify({ version: 1, type, exportedAt: '2026-05-07T00:00:00.000Z', items }, null, 2)
}

function parseImportItems(source, expectedType) {
  const data = JSON.parse(source)
  if (Array.isArray(data)) return data
  if (data.type && data.type !== expectedType) throw new Error(`type mismatch: ${data.type}`)
  if (!Array.isArray(data.items)) throw new Error('missing items')
  return data.items
}

function formatAiHistoryMarkdown(items) {
  const lines = ['# AI 历史记录', '', '导出时间：2026/5/7 00:00:00', '']
  items.forEach((item, index) => {
    lines.push(`## ${index + 1}. ${item.title}`, '')
    lines.push(`- 任务类型：${item.taskType}`)
    lines.push(`- 模型：${item.model}`)
    lines.push(`- 时间：${new Date(item.createdAt).toLocaleString()}`)
    lines.push('', '### Prompt', '', '```text', item.prompt, '```', '', '### 输出', '', item.output, '')
  })
  return lines.join('\n')
}

assert.equal(
  resolveVariables('{{baseUrl}}/users/{{id}}', [
    { key: 'baseUrl', value: 'https://example.com' },
    { key: 'id', value: '42' }
  ]),
  'https://example.com/users/42'
)

const json = { profile: { industry: 'general-devtools' }, modules: ['json', 'api'] }
assert.deepEqual(readPathValue(json, 'profile.industry'), { matched: true, value: 'general-devtools' })
assert.deepEqual(readPathValue(json, 'modules[1]'), { matched: true, value: 'api' })
assert.equal(readPathValue(json, 'missing.path').matched, false)

const status = parseStatus('## main...origin/main\n M src/app.ts\n?? README.md')
assert.equal(status.branch, 'main...origin/main')
assert.deepEqual(status.changes, [
  { status: 'M', path: 'src/app.ts' },
  { status: '??', path: 'README.md' }
])

const geo = summarizeGeoJson({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [120, 30] }, properties: {} },
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [120, 30],
          [121, 31]
        ]
      },
      properties: {}
    }
  ]
})
assert.deepEqual(geo.typeCounts, [
  ['Point', 1],
  ['LineString', 1]
])
assert.deepEqual(geo.issues, [])

const template = '请分析 {{ code }} 并关注 {{industry}}，再次检查 {{code}}。'
assert.deepEqual(extractPromptVariables(template), ['code', 'industry'])
assert.equal(
  renderPromptTemplate(template, { code: 'GeoJSON 校验函数', industry: '通用开发工具' }),
  '请分析 GeoJSON 校验函数 并关注 通用开发工具，再次检查 GeoJSON 校验函数。'
)

const templatesEnvelope = exportEnvelope('prompt-templates', [
  { taskType: 'explain-code', name: '风险审查', content: '{{code}}', variables: ['code'] }
])
assert.equal(parseImportItems(templatesEnvelope, 'prompt-templates').length, 1)
assert.throws(() => parseImportItems(templatesEnvelope, 'api-requests'), /type mismatch/)
assert.throws(() => parseImportItems('{"type":"prompt-templates"}', 'prompt-templates'), /missing items/)

const markdown = formatAiHistoryMarkdown([
  {
    title: '代码解释',
    taskType: 'explain-code',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    createdAt: '2026-05-07T00:00:00.000Z',
    prompt: '解释代码',
    output: '输出内容'
  }
])
assert.ok(markdown.includes('# AI 历史记录'))
assert.ok(markdown.includes('```text\n解释代码\n```'))
assert.ok(markdown.includes('输出内容'))

console.log('smoke tests passed')
