import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import type {
  ApiDiscoveredRequest,
  ApiDiscoveryGroup,
  ApiDiscoveryRequest,
  ApiDiscoveryResponse,
  ApiMethod,
  ApiSavedRequest,
  HeaderPair
} from '../../../src/shared/ipc.js'
import { getApiSavedRequests, saveApiSavedRequest } from './settings.js'

const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'out', 'build', 'coverage', '.idea', '.vscode', 'target'])
const maxFiles = 2500
const maxFileBytes = 700 * 1024

interface LoadedSourceFile {
  file: string
  rel: string
  source: string
}

interface JavaClassModel {
  name: string
  fields: JavaField[]
}

interface JavaField {
  name: string
  type: string
}

interface JavaParam {
  annotations: string
  type: string
  name: string
}

interface OpenApiParameter {
  name: string
  location: string
}

export async function discoverApiRequests(request: ApiDiscoveryRequest): Promise<ApiDiscoveryResponse> {
  if (!request.projectPath.trim()) throw new Error('项目目录不能为空')
  const files = await collectCandidateFiles(request.projectPath)
  const loadedFiles: LoadedSourceFile[] = []
  const discovered: ApiDiscoveredRequest[] = []
  const warnings: string[] = []
  let scannedFiles = 0
  let skippedFiles = 0

  for (const file of files) {
    const info = await stat(file)
    if (info.size > maxFileBytes) {
      skippedFiles += 1
      continue
    }
    const source = await readFile(file, 'utf8')
    const rel = relative(request.projectPath, file)
    scannedFiles += 1
    loadedFiles.push({ file, rel, source })
  }

  const javaModels = buildJavaModelIndex(loadedFiles.filter((item) => item.file.endsWith('.java')))

  for (const item of loadedFiles) {
    if (item.file.endsWith('.java')) {
      discovered.push(...scanSpringController(item.source, item.rel, javaModels))
      continue
    }

    if (/\.(ts|tsx|js|jsx|vue)$/.test(item.file)) {
      discovered.push(...scanFrontendCalls(item.source, item.rel))
    }
  }

  if (files.length >= maxFiles) warnings.push(`扫描文件达到上限 ${maxFiles}，可能存在未扫描的接口`)
  if (!discovered.length) warnings.push('未发现可导入的 API，请确认项目中存在 Controller、fetch 或 axios 调用')

  const groups = groupDiscoveredRequests(dedupeRequests(discovered))
  return {
    ok: true,
    projectType: detectProjectType(groups),
    scannedFiles,
    skippedFiles,
    groups,
    warnings
  }
}

export function parseOpenApiDocument(source: string, sourcePath = 'openapi.json'): ApiDiscoveryResponse {
  let document: unknown
  try {
    document = JSON.parse(source)
  } catch (error) {
    throw new Error(error instanceof Error ? `OpenAPI JSON 解析失败：${error.message}` : 'OpenAPI JSON 解析失败')
  }
  if (!document || typeof document !== 'object') throw new Error('OpenAPI 文档格式不正确')

  const root = document as Record<string, unknown>
  const paths = root.paths
  if (!paths || typeof paths !== 'object') throw new Error('OpenAPI 文档缺少 paths')

  const baseUrl = readOpenApiBaseUrl(root)
  const requests: ApiDiscoveredRequest[] = []
  for (const [rawPath, pathItem] of Object.entries(paths as Record<string, unknown>)) {
    if (!pathItem || typeof pathItem !== 'object') continue
    const pathParameters = readOpenApiParameters((pathItem as Record<string, unknown>).parameters)
    for (const [methodKey, operation] of Object.entries(pathItem as Record<string, unknown>)) {
      const method = methodKey.toUpperCase() as ApiMethod
      if (
        !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method) ||
        !operation ||
        typeof operation !== 'object'
      )
        continue
      const operationItem = operation as Record<string, unknown>
      const parameters = [...pathParameters, ...readOpenApiParameters(operationItem.parameters)]
      const queryParams = parameters
        .filter((item) => item.location === 'query')
        .map((item) => ({ key: item.name, value: `{{${item.name}}}` }))
      const operationHeaders = parameters
        .filter((item) => item.location === 'header')
        .map((item) => ({
          key: item.name,
          value: item.name.toLowerCase() === 'authorization' ? 'Bearer {{token}}' : `{{${item.name}}}`
        }))
      const body = createOpenApiBodyExample(operationItem.requestBody, root)
      const contentType = body ? [{ key: 'Content-Type', value: 'application/json' }] : []
      const tags = Array.isArray(operationItem.tags)
        ? operationItem.tags.filter((item): item is string => typeof item === 'string')
        : []
      const groupName = tags[0] || rawPath.split('/').filter(Boolean)[0] || 'OpenAPI'
      const url = appendQueryParams(`${baseUrl}${normalizePath(rawPath)}`, queryParams)

      requests.push(
        createDiscoveredRequest({
          name:
            typeof operationItem.summary === 'string' && operationItem.summary
              ? operationItem.summary
              : `${method} ${rawPath}`,
          method,
          url,
          headers: [{ key: 'Accept', value: 'application/json' }, ...contentType, ...operationHeaders],
          body,
          groupName,
          sourceType: 'openapi',
          sourcePath,
          confidence: 95
        })
      )
    }
  }

  const groups = groupDiscoveredRequests(dedupeRequests(requests))
  return {
    ok: true,
    projectType: 'unknown',
    scannedFiles: 1,
    skippedFiles: 0,
    groups,
    warnings: requests.length ? [] : ['OpenAPI 文档中未发现可导入接口']
  }
}

function readOpenApiBaseUrl(root: Record<string, unknown>): string {
  const servers = root.servers
  if (Array.isArray(servers) && servers[0] && typeof servers[0] === 'object') {
    const url = (servers[0] as Record<string, unknown>).url
    return typeof url === 'string' && url !== '/' ? url.replace(/\/$/, '') : ''
  }

  const swaggerBasePath = typeof root.basePath === 'string' ? root.basePath : ''
  return swaggerBasePath && swaggerBasePath !== '/' ? normalizePath(swaggerBasePath) : ''
}

function readOpenApiParameters(value: unknown): OpenApiParameter[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const name = typeof record.name === 'string' ? record.name : ''
      const location = typeof record.in === 'string' ? record.in : ''
      return name && location ? { name, location } : null
    })
    .filter((item): item is OpenApiParameter => Boolean(item))
}

function createOpenApiBodyExample(requestBody: unknown, root: Record<string, unknown>): string | undefined {
  const schema = readOpenApiRequestBodySchema(requestBody)
  if (!schema) return undefined
  return `${JSON.stringify(exampleValueForOpenApiSchema(schema, root, new Set()), null, 2)}\n`
}

function readOpenApiRequestBodySchema(requestBody: unknown): Record<string, unknown> | undefined {
  if (!requestBody || typeof requestBody !== 'object') return undefined
  const content = (requestBody as Record<string, unknown>).content
  if (!content || typeof content !== 'object') return undefined
  const contentRecord = content as Record<string, unknown>
  const jsonContent =
    contentRecord['application/json'] ?? contentRecord['application/*+json'] ?? Object.values(contentRecord)[0]
  if (!jsonContent || typeof jsonContent !== 'object') return undefined
  const schema = (jsonContent as Record<string, unknown>).schema
  return schema && typeof schema === 'object' ? (schema as Record<string, unknown>) : undefined
}

function exampleValueForOpenApiSchema(
  schema: Record<string, unknown>,
  root: Record<string, unknown>,
  seen: Set<string>
): unknown {
  const ref = typeof schema.$ref === 'string' ? schema.$ref : ''
  if (ref) {
    const resolved = resolveOpenApiRef(root, ref)
    if (!resolved || seen.has(ref) || seen.size >= 8) return {}
    return exampleValueForOpenApiSchema(resolved, root, new Set([...seen, ref]))
  }

  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]

  const type = typeof schema.type === 'string' ? schema.type : schema.properties ? 'object' : ''
  if (type === 'array') {
    const items = schema.items && typeof schema.items === 'object' ? (schema.items as Record<string, unknown>) : {}
    return [exampleValueForOpenApiSchema(items, root, seen)]
  }
  if (type === 'object') {
    const properties =
      schema.properties && typeof schema.properties === 'object' ? (schema.properties as Record<string, unknown>) : {}
    return Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        value && typeof value === 'object'
          ? exampleValueForOpenApiSchema(value as Record<string, unknown>, root, seen)
          : null
      ])
    )
  }
  if (type === 'integer' || type === 'number') return 0
  if (type === 'boolean') return false
  return ''
}

function resolveOpenApiRef(root: Record<string, unknown>, ref: string): Record<string, unknown> | undefined {
  if (!ref.startsWith('#/')) return undefined
  let current: unknown = root
  for (const segment of ref.slice(2).split('/')) {
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~')
    if (!current || typeof current !== 'object' || !(key in current)) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current && typeof current === 'object' ? (current as Record<string, unknown>) : undefined
}

export async function importDiscoveredApiRequests(
  projectId: string | undefined,
  requests: ApiDiscoveredRequest[],
  mode: 'skip' | 'overwrite'
): Promise<ApiSavedRequest[]> {
  let latest = await getApiSavedRequests(projectId)
  const existingKeys = new Set(latest.map((item) => `${item.method} ${item.url}`))
  const seen = new Set<string>()

  for (const item of requests) {
    const key = `${item.method} ${item.url}`
    if (seen.has(key)) continue
    seen.add(key)
    if (mode === 'skip' && existingKeys.has(key)) continue
    latest = await saveApiSavedRequest({
      id: mode === 'overwrite' ? stableDiscoveredRequestId(projectId, key) : undefined,
      name: item.name,
      method: item.method,
      url: item.url,
      headers: item.headers,
      body: item.body,
      projectId,
      groupName: item.groupName,
      sourceType: item.sourceType,
      sourcePath: item.sourcePath,
      confidence: item.confidence
    })
    existingKeys.add(key)
  }

  return latest
}

function stableDiscoveredRequestId(projectId: string | undefined, key: string): string {
  const hash = createHash('sha1')
    .update(`${projectId || 'global'}:${key}`)
    .digest('hex')
  return `discovered:${hash}`
}

async function collectCandidateFiles(root: string): Promise<string[]> {
  const result: string[] = []
  const queue = [root]

  while (queue.length && result.length < maxFiles) {
    const dir = queue.shift() as string
    let entries: Awaited<ReturnType<typeof readdir>>
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) queue.push(full)
        continue
      }
      if (!entry.isFile()) continue
      if (/\.(java|ts|tsx|js|jsx|vue)$/.test(entry.name)) result.push(full)
      if (result.length >= maxFiles) break
    }
  }

  return result
}

function scanSpringController(
  source: string,
  sourcePath: string,
  javaModels: Map<string, JavaClassModel>
): ApiDiscoveredRequest[] {
  if (!/@(RestController|Controller)\b/.test(source)) return []
  const className = source.match(/class\s+(\w+)/)?.[1] || basename(sourcePath, extname(sourcePath))
  const groupName = className.replace(/Controller$/, '') || className
  const classPrefix = extractMappingPath(
    source.slice(0, source.indexOf('class ') > 0 ? source.indexOf('class ') : source.length)
  )
  const requests: ApiDiscoveredRequest[] = []
  const methodRegex =
    /@(?<annotation>GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*(?:\((?<args>[\s\S]*?)\))?\s*(?:public|private|protected)?[\s\w<>,?@.[\]]+\s+(?<name>\w+)\s*\(/g

  for (const match of source.matchAll(methodRegex)) {
    const annotation = match.groups?.annotation || ''
    const args = match.groups?.args || ''
    const methodName = match.groups?.name || 'request'
    const method = mappingMethod(annotation, args)
    const paramsSource = extractMethodParams(source, match.index ?? 0)
    const requestParts = extractSpringRequestParts(paramsSource, method, javaModels)
    const path = appendQueryParams(
      normalizePath(`${classPrefix}/${extractMappingPath(args)}`),
      requestParts.queryParams
    )
    requests.push(
      createDiscoveredRequest({
        name: `${groupName}.${methodName}`,
        method,
        url: path || '/',
        headers: requestParts.headers,
        body: requestParts.body,
        groupName,
        sourceType: 'spring-controller',
        sourcePath,
        confidence: annotation === 'RequestMapping' ? 78 : 92
      })
    )
  }

  return requests
}

function scanFrontendCalls(source: string, sourcePath: string): ApiDiscoveredRequest[] {
  const requests: ApiDiscoveredRequest[] = []
  const groupName = sourcePath.split(/[\\/]/).slice(-2).join('/')
  const axiosRegex = /axios\.(get|post|put|delete|patch|head)\s*\(\s*([`'"])(.*?)\2/g
  const fetchRegex =
    /fetch\s*\(\s*([`'"])(.*?)\1\s*(?:,\s*\{[\s\S]*?method\s*:\s*([`'"])(GET|POST|PUT|DELETE|PATCH|HEAD)\3)?/g

  for (const match of source.matchAll(axiosRegex)) {
    requests.push(
      createDiscoveredRequest({
        name: `${match[1].toUpperCase()} ${match[3]}`,
        method: match[1].toUpperCase() as ApiMethod,
        url: normalizeDiscoveredUrl(match[3]),
        groupName,
        sourceType: 'frontend-call',
        sourcePath,
        confidence: 70
      })
    )
  }

  for (const match of source.matchAll(fetchRegex)) {
    requests.push(
      createDiscoveredRequest({
        name: `${(match[4] || 'GET').toUpperCase()} ${match[2]}`,
        method: (match[4] || 'GET').toUpperCase() as ApiMethod,
        url: normalizeDiscoveredUrl(match[2]),
        groupName,
        sourceType: 'frontend-call',
        sourcePath,
        confidence: match[4] ? 68 : 55
      })
    )
  }

  return requests
}

function extractMappingPath(source: string): string {
  const value =
    source.match(/(?:value|path)\s*=\s*["']([^"']+)["']/)?.[1] ?? source.match(/["']([^"']+)["']/)?.[1] ?? ''
  return value
}

function mappingMethod(annotation: string, args: string): ApiMethod {
  const direct: Record<string, ApiMethod> = {
    GetMapping: 'GET',
    PostMapping: 'POST',
    PutMapping: 'PUT',
    DeleteMapping: 'DELETE',
    PatchMapping: 'PATCH'
  }
  if (direct[annotation]) return direct[annotation]
  return (args.match(/RequestMethod\.(GET|POST|PUT|DELETE|PATCH|HEAD)/)?.[1] as ApiMethod | undefined) ?? 'GET'
}

function extractMethodParams(source: string, matchIndex: number): string {
  const start = source.indexOf('(', matchIndex)
  if (start < 0) return ''
  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) return source.slice(start + 1, index)
    }
  }
  return ''
}

function buildJavaModelIndex(files: LoadedSourceFile[]): Map<string, JavaClassModel> {
  const models = new Map<string, JavaClassModel>()
  for (const file of files) {
    const model = extractJavaClassModel(file.source)
    if (model?.fields.length) models.set(model.name, model)
  }
  return models
}

function extractJavaClassModel(source: string): JavaClassModel | null {
  const className = source.match(/\b(?:class|record)\s+(\w+)/)?.[1]
  if (!className) return null

  if (/\brecord\s+\w+\s*\(/.test(source)) {
    const params = extractMethodParams(source, source.indexOf(`record ${className}`))
    const fields = parseJavaParams(params).map((param) => ({
      name: jsonFieldName(param.annotations, param.name),
      type: param.type
    }))
    return { name: className, fields }
  }

  const fields: JavaField[] = []
  const fieldRegex =
    /(?<annotations>(?:\s*@[\w.]+(?:\([^)]*\))?\s*)*)\s*(?:private|protected|public)\s+(?!static\b)(?:final\s+)?(?<type>[\w.<>?,\s]+(?:\[\])?)\s+(?<name>\w+)\s*(?:=[^;]*)?;/g

  for (const match of source.matchAll(fieldRegex)) {
    const name = match.groups?.name || ''
    const type = normalizeJavaType(match.groups?.type || '')
    if (!name || !type || name === 'serialVersionUID') continue
    fields.push({ name: jsonFieldName(match.groups?.annotations || '', name), type })
  }

  return { name: className, fields }
}

function jsonFieldName(annotations: string, fallback: string): string {
  return annotations.match(/@(?:JsonProperty|JSONField)\s*\(\s*(?:name\s*=\s*)?["']([^"']+)["']/)?.[1] ?? fallback
}

function extractSpringRequestParts(
  paramsSource: string,
  method: ApiMethod,
  javaModels: Map<string, JavaClassModel>
): { queryParams: HeaderPair[]; headers: HeaderPair[]; body?: string; hasBody: boolean } {
  const params = parseJavaParams(paramsSource)
  const queryParams = extractAnnotatedParams(params, 'RequestParam').map((key) => ({ key, value: `{{${key}}}` }))
  const headers = extractAnnotatedParams(params, 'RequestHeader').map((key) => ({
    key,
    value: key.toLowerCase() === 'authorization' ? 'Bearer {{token}}' : `{{${key}}}`
  }))
  const bodyParam = findBodyParam(params, method, javaModels)
  const body = bodyParam ? createJsonBodyExample(bodyParam.type, javaModels, new Set()) : undefined
  return {
    queryParams,
    headers: [{ key: 'Accept', value: 'application/json' }, ...headers],
    body,
    hasBody: Boolean(body)
  }
}

function extractAnnotatedParams(params: JavaParam[], annotation: string): string[] {
  const result = new Set<string>()
  for (const param of params) {
    if (!param.annotations.includes(`@${annotation}`)) continue
    const explicitName =
      param.annotations.match(
        new RegExp(`@${annotation}\\s*\\(\\s*(?:(?:value|name)\\s*=\\s*)?["']([^"']+)["']`)
      )?.[1] ??
      param.annotations.match(new RegExp(`@${annotation}\\s*\\([^)]*(?:value|name)\\s*=\\s*["']([^"']+)["']`))?.[1]
    const key = explicitName || param.name
    if (key) result.add(key)
  }
  return [...result]
}

function findBodyParam(
  params: JavaParam[],
  method: ApiMethod,
  javaModels: Map<string, JavaClassModel>
): JavaParam | undefined {
  const explicitBody = params.find((param) => param.annotations.includes('@RequestBody'))
  if (explicitBody) return explicitBody
  if (!['POST', 'PUT', 'PATCH'].includes(method)) return undefined
  return params.find((param) => isLikelyBodyParam(param, javaModels))
}

function isLikelyBodyParam(param: JavaParam, javaModels: Map<string, JavaClassModel>): boolean {
  if (
    param.annotations.includes('@RequestParam') ||
    param.annotations.includes('@PathVariable') ||
    param.annotations.includes('@RequestHeader')
  )
    return false
  const type = simpleJavaType(param.type)
  if (!javaModels.has(type)) return false
  if (
    /^(HttpServletRequest|HttpServletResponse|Principal|Authentication|BindingResult|Model|ModelMap|Pageable|MultipartFile)$/.test(
      type
    )
  )
    return false
  return true
}

function parseJavaParams(paramsSource: string): JavaParam[] {
  return splitTopLevel(paramsSource, ',')
    .map((segment) => parseJavaParam(segment))
    .filter((param): param is JavaParam => Boolean(param))
}

function parseJavaParam(segment: string): JavaParam | null {
  const annotations = [...segment.matchAll(/@[\w.]+(?:\([^)]*\))?/g)].map((match) => match[0]).join(' ')
  const withoutAnnotations = normalizeJavaType(segment.replace(/@[\w.]+(?:\([^)]*\))?/g, ''))
    .replace(/\b(final|@Valid|@Validated)\b/g, '')
    .trim()
  const match = withoutAnnotations.match(/(?<type>[\w.<>?,\s]+(?:\[\])?)\s+(?<name>\w+)$/)
  if (!match?.groups) return null
  return {
    annotations,
    type: normalizeJavaType(match.groups.type),
    name: match.groups.name
  }
}

function splitTopLevel(value: string, separator: string): string[] {
  const result: string[] = []
  let depthAngle = 0
  let depthParen = 0
  let quote = ''
  let start = 0

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (quote) {
      if (char === quote && value[index - 1] !== '\\') quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '<') depthAngle += 1
    if (char === '>') depthAngle = Math.max(0, depthAngle - 1)
    if (char === '(') depthParen += 1
    if (char === ')') depthParen = Math.max(0, depthParen - 1)
    if (char === separator && depthAngle === 0 && depthParen === 0) {
      result.push(value.slice(start, index).trim())
      start = index + 1
    }
  }

  result.push(value.slice(start).trim())
  return result.filter(Boolean)
}

function createJsonBodyExample(type: string, javaModels: Map<string, JavaClassModel>, seen: Set<string>): string {
  return `${JSON.stringify(exampleValueForType(type, javaModels, seen), null, 2)}\n`
}

function exampleValueForType(type: string, javaModels: Map<string, JavaClassModel>, seen: Set<string>): unknown {
  const normalized = normalizeJavaType(type)
  const simpleType = simpleJavaType(normalized)

  if (/\[\]$/.test(normalized) || /^(List|Set|Collection|Iterable)$/.test(simpleType)) {
    return [exampleValueForType(firstGenericType(normalized) || normalized.replace(/\[\]$/, ''), javaModels, seen)]
  }
  if (/^(Map|HashMap|LinkedHashMap)$/.test(simpleType)) return {}
  if (
    /^(String|CharSequence|UUID|LocalDate|LocalDateTime|Date|Instant|Timestamp|OffsetDateTime|ZonedDateTime)$/.test(
      simpleType
    )
  )
    return ''
  if (/^(boolean|Boolean)$/.test(simpleType)) return false
  if (
    /^(byte|short|int|long|float|double|Byte|Short|Integer|Long|Float|Double|BigDecimal|BigInteger)$/.test(simpleType)
  )
    return 0

  const model = javaModels.get(simpleType)
  if (!model || seen.has(simpleType) || seen.size >= 4) return {}

  const nextSeen = new Set(seen)
  nextSeen.add(simpleType)
  return Object.fromEntries(
    model.fields.map((field) => [field.name, exampleValueForType(field.type, javaModels, nextSeen)])
  )
}

function normalizeJavaType(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*<\s*/g, '<')
    .replace(/\s*>\s*/g, '>')
    .replace(/\s*,\s*/g, ', ')
    .trim()
}

function simpleJavaType(type: string): string {
  const withoutGeneric = type
    .replace(/<[\s\S]*>$/, '')
    .replace(/\[\]$/, '')
    .trim()
  return withoutGeneric.split('.').pop() || withoutGeneric
}

function firstGenericType(type: string): string {
  const generic = type.match(/<([\s\S]+)>/)?.[1]
  return generic ? splitTopLevel(generic, ',')[0] : ''
}

function appendQueryParams(path: string, params: HeaderPair[]): string {
  if (!params.length) return path
  const connector = path.includes('?') ? '&' : '?'
  return `${path}${connector}${params.map((item) => `${item.key}=${item.value}`).join('&')}`
}

function createDiscoveredRequest(
  input: Omit<ApiDiscoveredRequest, 'id' | 'headers' | 'body'> & { headers?: HeaderPair[]; body?: string }
): ApiDiscoveredRequest {
  return {
    id: randomUUID(),
    ...input,
    headers: input.headers?.length ? input.headers : [{ key: 'Accept', value: 'application/json' }],
    body: input.body ?? (['GET', 'HEAD'].includes(input.method) ? '' : '{\n  \n}')
  }
}

function normalizePath(value: string): string {
  return `/${value.split('/').filter(Boolean).join('/')}`.replace(/\{(\w+)\}/g, '{{$1}}')
}

function normalizeDiscoveredUrl(value: string): string {
  if (!value) return '/'
  return value.startsWith('http') || value.startsWith('{{') ? value : value.startsWith('/') ? value : `/${value}`
}

function dedupeRequests(requests: ApiDiscoveredRequest[]): ApiDiscoveredRequest[] {
  const seen = new Set<string>()
  return requests.filter((item) => {
    const key = `${item.method} ${item.url} ${item.sourcePath}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function groupDiscoveredRequests(requests: ApiDiscoveredRequest[]): ApiDiscoveryGroup[] {
  const map = new Map<string, ApiDiscoveryGroup>()
  for (const request of requests) {
    const key = `${request.sourceType}:${request.groupName}`
    const group = map.get(key) ?? { name: request.groupName, sourceType: request.sourceType, requests: [] }
    group.requests.push(request)
    map.set(key, group)
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function detectProjectType(groups: ApiDiscoveryGroup[]): ApiDiscoveryResponse['projectType'] {
  const hasSpring = groups.some((item) => item.sourceType === 'spring-controller')
  const hasFrontend = groups.some((item) => item.sourceType === 'frontend-call')
  if (hasSpring && hasFrontend) return 'mixed'
  if (hasSpring) return 'spring'
  if (hasFrontend) return 'frontend'
  return 'unknown'
}
