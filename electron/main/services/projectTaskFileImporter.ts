import { dialog } from 'electron'
import { readFileSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { inflateRawSync } from 'node:zlib'

export interface ImportedTaskFile {
  path: string
  content: string
  sizeBytes: number
}

const maxTaskFileBytes = 5 * 1024 * 1024
const textTaskFileExtensions = [
  'txt',
  'md',
  'json',
  'ts',
  'tsx',
  'js',
  'jsx',
  'vue',
  'java',
  'py',
  'go',
  'rs',
  'sql',
  'yaml',
  'yml',
  'csv'
]
const documentTaskFileExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']
export const taskFileExtensions = [...textTaskFileExtensions, ...documentTaskFileExtensions]

interface ZipEntry {
  name: string
  data: Buffer
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function stripXmlTags(value: string): string {
  return decodeXml(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdOffset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocdOffset < 0) throw new Error('无法读取 Office 文档结构')
  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16)
  const entries: ZipEntry[] = []
  let offset = centralDirectoryOffset

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8')

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : Buffer.alloc(0)
    if (data.length) entries.push({ name, data })
    offset += 46 + fileNameLength + extraLength + commentLength
  }

  return entries
}

function readZipText(entries: ZipEntry[], name: string): string {
  return entries.find((entry) => entry.name === name)?.data.toString('utf8') ?? ''
}

function convertDocxToMarkdown(buffer: Buffer, path: string): string {
  const entries = readZipEntries(buffer)
  const documentXml = readZipText(entries, 'word/document.xml')
  if (!documentXml) throw new Error('无法读取 DOCX 正文')
  const paragraphs = [...documentXml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map((match) => stripXmlTags(match[0].replace(/<w:tab\/>/g, ' ').replace(/<w:br\/>/g, '\n')))
    .filter(Boolean)

  return [`# ${fileName(path)}`, '', ...paragraphs].join('\n\n')
}

function convertXlsxToMarkdown(buffer: Buffer, path: string): string {
  const entries = readZipEntries(buffer)
  const sharedStrings = [...readZipText(entries, 'xl/sharedStrings.xml').matchAll(/<si[\s\S]*?<\/si>/g)].map((match) =>
    stripXmlTags(match[0])
  )
  const sheetEntries = entries.filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name)).slice(0, 8)
  const lines = [`# ${fileName(path)}`]

  for (const [sheetIndex, entry] of sheetEntries.entries()) {
    const sheetXml = entry.data.toString('utf8')
    const rows = [...sheetXml.matchAll(/<row[\s\S]*?<\/row>/g)]
      .slice(0, 200)
      .map((rowMatch) => {
        return [...rowMatch[0].matchAll(/<c\b([^>]*)>[\s\S]*?<v>([\s\S]*?)<\/v>[\s\S]*?<\/c>/g)].map((cellMatch) => {
          const type = cellMatch[1]
          const raw = decodeXml(cellMatch[2])
          return type.includes('t="s"') ? sharedStrings[Number(raw)] || raw : raw
        })
      })
      .filter((row) => row.length)
    if (!rows.length) continue
    lines.push('', `## Sheet ${sheetIndex + 1}`, '')
    for (const row of rows) lines.push(`| ${row.map(escapeMarkdownCell).join(' | ')} |`)
  }

  return lines.join('\n')
}

function extractReadableBinaryText(buffer: Buffer): string {
  return (
    buffer
      .toString('latin1')
      .replace(/\0/g, ' ')
      .match(/[ -~\u00a0-\u00ff]{4,}/g)
      ?.map((item) => item.replace(/\s+/g, ' ').trim())
      .filter((item) => item.length > 3 && !/^[\d\s.]+$/.test(item))
      .slice(0, 800)
      .join('\n') ?? ''
  )
}

function convertPdfToMarkdown(buffer: Buffer, path: string): string {
  const source = buffer.toString('latin1')
  const literalText = [...source.matchAll(/\(([^()]{2,})\)\s*Tj/g)]
    .map((match) => match[1].replace(/\\([()\\])/g, '$1'))
    .join('\n')
  const fallback = extractReadableBinaryText(buffer)
  const content = literalText.trim() || fallback.trim()
  if (!content) throw new Error('无法从 PDF 中提取文本，请改用可复制文本的 PDF 或先导出为 Markdown/TXT')
  return [`# ${fileName(path)}`, '', content].join('\n')
}

export function convertDocumentToMarkdown(path: string, extension: string): string {
  const buffer = readFileSync(path)
  if (extension === 'docx') return convertDocxToMarkdown(buffer, path)
  if (extension === 'xlsx') return convertXlsxToMarkdown(buffer, path)
  if (extension === 'pdf') return convertPdfToMarkdown(buffer, path)
  const text = extractReadableBinaryText(buffer)
  if (!text.trim()) {
    throw new Error(`暂无法从 ${extension.toUpperCase()} 文件中提取文本，请先另存为 PDF、DOCX、XLSX、Markdown 或 TXT`)
  }
  return [`# ${fileName(path)}`, '', text].join('\n')
}

export function chooseTaskFile(): ImportedTaskFile | null {
  const result = dialog.showOpenDialogSync({
    title: '上传任务文件',
    properties: ['openFile'],
    filters: [
      {
        name: '任务文件',
        extensions: taskFileExtensions
      }
    ]
  })
  const path = result?.[0]
  if (!path) return null
  const extension = extname(path).replace(/^\./, '').toLowerCase()
  if (!taskFileExtensions.includes(extension)) {
    throw new Error(
      `暂不支持该文件格式：.${extension || '无扩展名'}。请选择文本、Markdown、JSON、代码、SQL/YAML、PDF 或 Office 文档。`
    )
  }
  const stat = statSync(path)
  if (stat.size > maxTaskFileBytes) throw new Error('任务文件不能超过 5MB')
  const content = textTaskFileExtensions.includes(extension)
    ? readFileSync(path, 'utf8')
    : convertDocumentToMarkdown(path, extension)
  return { path, content, sizeBytes: stat.size }
}
