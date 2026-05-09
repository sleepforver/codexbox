import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isAbsolute, normalize, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import type {
  GitAction,
  GitActionResponse,
  GitCommitResponse,
  GitCommand,
  GitCommandRequest,
  GitCommandResponse,
  GitCommit,
  GitFileChange
} from '../../../src/shared/ipc.js'
import { readAppSettings } from './settings.js'

const execFileAsync = promisify(execFile)
const gitCommandArgs: Record<GitCommand, string[]> = {
  status: ['status', '--short', '--branch'],
  log: ['log', '--pretty=format:%h%x09%an%x09%ad%x09%s', '--date=short', '-20'],
  diff: ['diff', '--stat'],
  'file-diff': ['diff', '--']
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    windowsHide: true,
    timeout: 15000
  })

  return stdout || stderr || ''
}

function parseStatus(raw: string) {
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const branchLine = lines.find((line) => line.startsWith('## '))
  const changes: GitFileChange[] = lines
    .filter((line) => !line.startsWith('## '))
    .map((line) => ({
      status: line.slice(0, 2).trim() || 'modified',
      path: line.slice(3).trim()
    }))

  return {
    branch: branchLine?.replace(/^##\s*/, '') || 'unknown',
    changes,
    raw: raw || '工作区干净'
  }
}

function parseLog(raw: string) {
  const commits: GitCommit[] = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, author, date, ...subjectParts] = line.split('\t')
      return {
        hash,
        author,
        date,
        subject: subjectParts.join('\t')
      }
    })

  return { commits, raw: raw || '没有提交记录' }
}

function assertGitInput(cwd: string, path?: string): string | null {
  if (!existsSync(cwd)) return '工作目录不存在'
  if (path !== undefined && !path.trim()) return '文件路径不能为空'
  if (path !== undefined && isUnsafeGitPath(path)) return '文件路径不能是绝对路径或越过工作目录'
  return null
}

function isUnsafeGitPath(path: string): boolean {
  const normalized = normalize(path.trim())
  return isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..\\`) || normalized.startsWith('../')
}

async function resolveAllowedCwd(cwd?: string): Promise<{ cwd: string; error?: string }> {
  const settings = await readAppSettings()
  const requested = resolve(cwd || settings.defaultWorkspace || process.cwd())
  const base = settings.defaultWorkspace ? resolve(settings.defaultWorkspace) : requested

  if (!existsSync(requested)) {
    return { cwd: requested, error: '工作目录不存在' }
  }

  const outbound = relative(base, requested)
  if (outbound.startsWith('..') || isAbsolute(outbound)) {
    return { cwd: requested, error: 'Git 工作目录必须位于默认工作目录内' }
  }

  return { cwd: requested }
}

export async function handleGitRun(request: GitCommandRequest): Promise<GitCommandResponse> {
  const cwdResult = await resolveAllowedCwd(request.cwd)
  const cwd = cwdResult.cwd
  if (cwdResult.error) return { ok: false, command: request.command, output: '', error: cwdResult.error }
  const inputError = assertGitInput(cwd, request.command === 'file-diff' ? request.path : undefined)

  if (inputError) {
    return { ok: false, command: request.command, output: '', error: inputError }
  }

  try {
    const args = request.command === 'file-diff' ? ['diff', '--', request.path || ''] : gitCommandArgs[request.command]
    const raw = await runGit(cwd, args)

    if (request.command === 'status') {
      return { ok: true, command: 'status', status: parseStatus(raw) }
    }

    if (request.command === 'log') {
      return { ok: true, command: 'log', log: parseLog(raw) }
    }

    if (request.command === 'file-diff') {
      return {
        ok: true,
        command: 'file-diff',
        path: request.path || '',
        diff: {
          summary: raw.trim() || '该文件没有未提交差异',
          raw: raw || '该文件没有未提交差异'
        }
      }
    }

    return {
      ok: true,
      command: 'diff',
      diff: {
        summary: raw.trim() || '没有未提交差异',
        raw: raw || '没有未提交差异'
      }
    }
  } catch (error) {
    const execError = error as Error & { stdout?: string; stderr?: string }
    return {
      ok: false,
      command: request.command,
      output: execError.stdout ?? '',
      error: execError.stderr || execError.message
    }
  }
}

export async function handleGitAction(request: {
  action: GitAction
  cwd?: string
  path: string
}): Promise<GitActionResponse> {
  const cwdResult = await resolveAllowedCwd(request.cwd)
  const cwd = cwdResult.cwd
  if (cwdResult.error) {
    return { ok: false, action: request.action, path: request.path, output: '', error: cwdResult.error }
  }
  const inputError = assertGitInput(cwd, request.path)

  if (inputError) {
    return { ok: false, action: request.action, path: request.path, output: '', error: inputError }
  }

  const args =
    request.action === 'stage-file' ? ['add', '--', request.path] : ['restore', '--staged', '--', request.path]

  try {
    const output = await runGit(cwd, args)
    return { ok: true, action: request.action, path: request.path, output: output || '操作完成' }
  } catch (error) {
    const execError = error as Error & { stdout?: string; stderr?: string }
    return {
      ok: false,
      action: request.action,
      path: request.path,
      output: execError.stdout ?? '',
      error: execError.stderr || execError.message
    }
  }
}

export async function handleGitCommit(request: { cwd?: string; message: string }): Promise<GitCommitResponse> {
  const cwdResult = await resolveAllowedCwd(request.cwd)
  const cwd = cwdResult.cwd
  if (cwdResult.error) {
    return { ok: false, output: '', error: cwdResult.error }
  }

  const message = request.message.trim()
  if (!message) {
    return { ok: false, output: '', error: '提交信息不能为空' }
  }

  try {
    const output = await runGit(cwd, ['commit', '-m', message])
    return { ok: true, output: output || '提交完成' }
  } catch (error) {
    const execError = error as Error & { stdout?: string; stderr?: string }
    return {
      ok: false,
      output: execError.stdout ?? '',
      error: execError.stderr || execError.message
    }
  }
}
