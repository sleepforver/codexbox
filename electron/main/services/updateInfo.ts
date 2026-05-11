import { app, shell } from 'electron'

const defaultFeedUrl = 'https://pub-bade506d946641b0b4cbb6b345690acc.r2.dev/'
const defaultDownloadPageUrl = 'https://codexbox.pages.dev/#download'

export interface UpdateInfo {
  currentVersion: string
  channel: 'beta' | 'stable'
  feedUrl: string
  feedFile: string
  downloadPageUrl: string
  source: 'cloudflare-r2-generic'
  packaged: boolean
}

export type UpdateCheckResponse =
  | {
      ok: true
      status: 'current' | 'available' | 'unknown'
      currentVersion: string
      latestVersion?: string
      releaseDate?: string
      downloadPageUrl: string
      message: string
    }
  | {
      ok: false
      currentVersion: string
      downloadPageUrl: string
      error: string
    }

export function getUpdateInfo(): UpdateInfo {
  const feedUrl = normalizeFeedUrl(process.env.CODEXBOX_UPDATE_FEED_URL || defaultFeedUrl)
  const currentVersion = app.getVersion()
  return {
    currentVersion,
    channel: currentVersion.startsWith('0.') || currentVersion.includes('-') ? 'beta' : 'stable',
    feedUrl,
    feedFile: `${feedUrl}latest.yml`,
    downloadPageUrl: process.env.CODEXBOX_DOWNLOAD_PAGE_URL || defaultDownloadPageUrl,
    source: 'cloudflare-r2-generic',
    packaged: app.isPackaged
  }
}

export async function checkForUpdate(): Promise<UpdateCheckResponse> {
  const info = getUpdateInfo()

  try {
    const response = await fetch(info.feedFile, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`update feed returned HTTP ${response.status}`)
    }

    const metadata = parseLatestYml(await response.text())
    const latestVersion = metadata.version
    if (!latestVersion) {
      return {
        ok: true,
        status: 'unknown',
        currentVersion: info.currentVersion,
        downloadPageUrl: info.downloadPageUrl,
        message: '更新元数据缺少 version 字段，请通过官网下载页手动确认。'
      }
    }

    const status = compareVersions(latestVersion, info.currentVersion) > 0 ? 'available' : 'current'
    return {
      ok: true,
      status,
      currentVersion: info.currentVersion,
      latestVersion,
      releaseDate: metadata.releaseDate,
      downloadPageUrl: info.downloadPageUrl,
      message:
        status === 'available'
          ? `发现新版本 ${latestVersion}，请通过官网下载页获取安装包。`
          : `当前已是最新版本 ${info.currentVersion}。`
    }
  } catch (error) {
    return {
      ok: false,
      currentVersion: info.currentVersion,
      downloadPageUrl: info.downloadPageUrl,
      error: error instanceof Error ? error.message : '检查更新失败'
    }
  }
}

export async function openManualDownloadPage(): Promise<void> {
  const info = getUpdateInfo()
  await shell.openExternal(info.downloadPageUrl)
}

function normalizeFeedUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

function parseLatestYml(source: string): { version?: string; releaseDate?: string } {
  const version = source.match(/^version:\s*['"]?([^'"\r\n]+)['"]?/m)?.[1]?.trim()
  const releaseDate = source.match(/^releaseDate:\s*['"]?([^'"\r\n]+)['"]?/m)?.[1]?.trim()
  return { version, releaseDate }
}

function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left)
  const rightParts = normalizeVersion(right)
  const maxLength = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (diff !== 0) return diff
  }

  return 0
}

function normalizeVersion(version: string): number[] {
  return version
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part))
}
