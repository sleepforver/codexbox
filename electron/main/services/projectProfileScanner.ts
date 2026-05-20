import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ProjectProfileDraft } from '../../../src/shared/ipc.js'

const knownDirectories: Record<string, string> = {
  src: '源代码目录',
  electron: 'Electron 主进程和预加载代码',
  tests: '测试目录',
  test: '测试目录',
  docs: '项目文档',
  requirement: '需求文档',
  public: '静态资源',
  server: '服务端代码',
  app: '应用代码',
  pages: '页面目录',
  components: '组件目录'
}

function readJsonFile(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function hasFile(projectPath: string, name: string): boolean {
  return existsSync(join(projectPath, name))
}

function detectPackageManager(projectPath: string): 'npm.cmd' | 'pnpm.cmd' | 'yarn.cmd' {
  if (hasFile(projectPath, 'pnpm-lock.yaml')) return 'pnpm.cmd'
  if (hasFile(projectPath, 'yarn.lock')) return 'yarn.cmd'
  return 'npm.cmd'
}

function packageCommand(manager: 'npm.cmd' | 'pnpm.cmd' | 'yarn.cmd', script: string): string {
  if (manager === 'pnpm.cmd') return script === 'install' ? 'pnpm.cmd install' : `pnpm.cmd ${script}`
  if (manager === 'yarn.cmd')
    return script === 'install' ? 'yarn.cmd install' : `yarn.cmd ${script.replace(/^run\s+/, '')}`
  return script === 'install' ? 'npm.cmd install' : `npm.cmd run ${script.replace(/^run\s+/, '')}`
}

function findScript(scripts: Record<string, unknown>, names: string[]): string {
  return names.find((name) => typeof scripts[name] === 'string') ?? ''
}

function scanPackageJson(projectPath: string, techStack: Set<string>): Partial<ProjectProfileDraft> {
  const packageJson = readJsonFile(join(projectPath, 'package.json'))
  if (!packageJson) return {}
  const dependencies = {
    ...(packageJson.dependencies as Record<string, string> | undefined),
    ...(packageJson.devDependencies as Record<string, string> | undefined)
  }
  const scripts = (packageJson.scripts as Record<string, unknown> | undefined) ?? {}
  const manager = detectPackageManager(projectPath)
  const knownDeps: Record<string, string> = {
    vue: 'Vue',
    react: 'React',
    '@angular/core': 'Angular',
    electron: 'Electron',
    typescript: 'TypeScript',
    vite: 'Vite',
    'vue-router': 'Vue Router',
    pinia: 'Pinia',
    express: 'Express',
    koa: 'Koa',
    fastify: 'Fastify',
    next: 'Next.js',
    nuxt: 'Nuxt',
    tailwindcss: 'Tailwind CSS',
    'sql.js': 'SQLite/sql.js'
  }
  for (const [name, label] of Object.entries(knownDeps)) {
    if (dependencies[name] !== undefined) techStack.add(label)
  }
  if (hasFile(projectPath, 'electron.vite.config.mts') || hasFile(projectPath, 'electron.vite.config.ts')) {
    techStack.add('Electron Vite')
  }
  const devScript = findScript(scripts, ['dev', 'start', 'serve', 'electron:dev'])
  const testScript = findScript(scripts, ['test', 'test:unit', 'test:smoke'])
  const buildScript = findScript(scripts, ['build', 'pack', 'dist'])
  return {
    projectType: dependencies.electron ? 'desktop' : dependencies.vue || dependencies.react ? 'frontend' : '',
    installCommand: packageCommand(manager, 'install'),
    devCommand: devScript ? packageCommand(manager, devScript) : '',
    testCommand: testScript ? packageCommand(manager, testScript) : '',
    buildCommand: buildScript ? packageCommand(manager, buildScript) : '',
    tags: ['Node.js']
  }
}

export function scanProjectProfile(projectPath: string): ProjectProfileDraft {
  if (!existsSync(projectPath) || !statSync(projectPath).isDirectory()) throw new Error('项目目录不存在')
  const techStack = new Set<string>()
  const tags = new Set<string>()
  const draft: ProjectProfileDraft = {
    projectType: '',
    techStack: '',
    installCommand: '',
    devCommand: '',
    testCommand: '',
    buildCommand: '',
    importantPaths: '',
    notes: '',
    tags: []
  }

  Object.assign(draft, scanPackageJson(projectPath, techStack))
  for (const tag of draft.tags) tags.add(tag)

  if (hasFile(projectPath, 'pom.xml')) {
    techStack.add('Java')
    techStack.add('Maven')
    tags.add('Java')
    draft.projectType ||= 'backend'
    draft.buildCommand ||= 'mvn package'
    draft.testCommand ||= 'mvn test'
    draft.devCommand ||= 'mvn spring-boot:run'
  }
  if (hasFile(projectPath, 'build.gradle') || hasFile(projectPath, 'build.gradle.kts')) {
    techStack.add('Java')
    techStack.add('Gradle')
    tags.add('Java')
    draft.projectType ||= 'backend'
    draft.buildCommand ||= 'gradle build'
    draft.testCommand ||= 'gradle test'
  }
  if (hasFile(projectPath, 'pyproject.toml') || hasFile(projectPath, 'requirements.txt')) {
    techStack.add('Python')
    tags.add('Python')
    draft.projectType ||= 'script'
    draft.installCommand ||= hasFile(projectPath, 'requirements.txt') ? 'python -m pip install -r requirements.txt' : ''
    draft.testCommand ||= 'python -m pytest'
  }
  if (hasFile(projectPath, 'go.mod')) {
    techStack.add('Go')
    tags.add('Go')
    draft.projectType ||= 'backend'
    draft.testCommand ||= 'go test ./...'
    draft.buildCommand ||= 'go build ./...'
  }
  if (hasFile(projectPath, 'Cargo.toml')) {
    techStack.add('Rust')
    tags.add('Rust')
    draft.projectType ||= 'backend'
    draft.testCommand ||= 'cargo test'
    draft.buildCommand ||= 'cargo build'
  }

  const directories = readdirSync(projectPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && knownDirectories[entry.name])
    .map((entry) => `${entry.name}/：${knownDirectories[entry.name]}`)
  draft.importantPaths = directories.join('\n')
  draft.techStack = Array.from(techStack).join(', ')
  draft.tags = Array.from(tags)
  draft.notes = [
    hasFile(projectPath, 'README.md') ? '检测到 README.md，可作为项目说明入口。' : '',
    hasFile(projectPath, '.env.example') ? '检测到 .env.example，可参考配置本地环境变量。' : ''
  ]
    .filter(Boolean)
    .join('\n')

  return draft
}
