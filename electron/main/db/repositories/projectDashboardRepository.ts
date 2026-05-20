import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import type {
  AiHistoryItem,
  ApiHistoryItem,
  ProjectDashboardSummary,
  ProjectTaskStatus
} from '../../../../src/shared/ipc.js'
import { getDatabase } from '../connection.js'
import { readMany, readOne } from '../runtime.js'
import { getAiHistoryFromDb } from './aiHistoryRepository.js'
import { getApiToolStateFromDb } from './apiRepository.js'
import { listWorkspaceProjectsFromDb } from './projectRepository.js'
import { listProjectTasksFromDb } from './projectTaskRepository.js'

const execFileAsync = promisify(execFile)
const taskStatuses: ProjectTaskStatus[] = ['todo', 'in_progress', 'pending_validation', 'done', 'archived']

async function readGitSummary(path: string): Promise<ProjectDashboardSummary['git']> {
  if (!path || !existsSync(path)) {
    return { ok: false, branch: '', changedFiles: 0, stagedFiles: 0, recentCommit: '', message: '项目目录不存在' }
  }

  try {
    const [{ stdout: statusStdout }, { stdout: logStdout }] = await Promise.all([
      execFileAsync('git', ['status', '--short', '--branch'], { cwd: path, windowsHide: true, timeout: 8000 }),
      execFileAsync('git', ['log', '-1', '--pretty=format:%h %s'], { cwd: path, windowsHide: true, timeout: 8000 })
    ])
    const statusLines = statusStdout.split(/\r?\n/).filter(Boolean)
    const branch = statusLines.find((line) => line.startsWith('## '))?.replace(/^##\s*/, '') || 'unknown'
    const changeLines = statusLines.filter((line) => !line.startsWith('## '))
    const stagedFiles = changeLines.filter((line) => line[0] && line[0] !== ' ' && line[0] !== '?').length

    return {
      ok: true,
      branch,
      changedFiles: changeLines.length,
      stagedFiles,
      recentCommit: logStdout.trim() || '暂无提交',
      message: changeLines.length ? `有 ${changeLines.length} 个变更文件` : '工作区干净'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Git 状态读取失败'
    return { ok: false, branch: '', changedFiles: 0, stagedFiles: 0, recentCommit: '', message }
  }
}

export async function getProjectDashboardFromDb(projectId?: string): Promise<ProjectDashboardSummary> {
  const projects = await listWorkspaceProjectsFromDb()
  const project = projectId ? (projects.find((item) => item.id === projectId) ?? null) : (projects[0] ?? null)
  const emptyStats = Object.fromEntries(taskStatuses.map((status) => [status, 0])) as Record<ProjectTaskStatus, number>

  if (!project) {
    return {
      project: null,
      pathExists: false,
      taskStats: emptyStats,
      recentTasks: [],
      aiStats: { total: 0, favorites: 0, recent: [] },
      apiStats: { savedRequests: 0, envVars: 0, recentHistory: [] },
      git: { ok: false, branch: '', changedFiles: 0, stagedFiles: 0, recentCommit: '', message: '请先创建或选择项目' }
    }
  }

  const db = await getDatabase()
  const taskRows = readMany<{ status: ProjectTaskStatus; count: number }>(
    db,
    'SELECT status, COUNT(*) AS count FROM project_tasks WHERE project_id = ? GROUP BY status',
    [project.id]
  )
  const taskStats = { ...emptyStats }
  for (const row of taskRows) taskStats[row.status] = row.count

  const [recentTasks, recentAi, apiState, git] = await Promise.all([
    listProjectTasksFromDb({ projectId: project.id }),
    getAiHistoryFromDb(undefined, project.id),
    getApiToolStateFromDb(project.id),
    readGitSummary(project.path)
  ])

  const aiCount = readOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM ai_history WHERE project_id = ?', [
    project.id
  ])
  const favoriteCount = readOne<{ count: number }>(
    db,
    'SELECT COUNT(*) AS count FROM ai_history WHERE project_id = ? AND is_favorite = 1',
    [project.id]
  )
  const savedRequests = readOne<{ count: number }>(
    db,
    'SELECT COUNT(*) AS count FROM api_saved_requests WHERE project_id = ?',
    [project.id]
  )

  return {
    project,
    pathExists: existsSync(project.path),
    taskStats,
    recentTasks: recentTasks.slice(0, 6),
    aiStats: {
      total: aiCount?.count ?? 0,
      favorites: favoriteCount?.count ?? 0,
      recent: recentAi.slice(0, 5) as AiHistoryItem[]
    },
    apiStats: {
      savedRequests: savedRequests?.count ?? 0,
      envVars: apiState.envVars.length,
      recentHistory: apiState.history.slice(0, 5) as ApiHistoryItem[]
    },
    git
  }
}
