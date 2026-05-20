import type { RouteRecordRaw } from 'vue-router'
import ProjectDashboard from './views/ProjectDashboard.vue'
import ProjectKnowledge from './views/ProjectKnowledge.vue'
import ProjectAgents from './views/ProjectAgents.vue'
import ProjectTasks from './views/ProjectTasks.vue'
import ProjectWorkspace from './views/ProjectWorkspace.vue'
import JsonTool from './views/JsonTool.vue'
import ApiTester from './views/ApiTester.vue'
import CodeReview from './views/CodeReview.vue'
import GitAssistant from './views/GitAssistant.vue'
import AiExplain from './views/AiExplain.vue'
import AiGenerate from './views/AiGenerate.vue'
import AiHistoryCenter from './views/AiHistoryCenter.vue'
import SettingsView from './views/SettingsView.vue'

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'dashboard', component: ProjectDashboard, meta: { label: '项目总览' } },
  { path: '/project-tasks', name: 'project-tasks', component: ProjectTasks, meta: { label: '项目任务' } },
  { path: '/project-agents', name: 'project-agents', component: ProjectAgents, meta: { label: 'Agent工作站' } },
  { path: '/project-knowledge', name: 'project-knowledge', component: ProjectKnowledge, meta: { label: '项目知识库' } },
  { path: '/ai-generate', name: 'ai-generate', component: AiGenerate, meta: { label: 'AI开发' } },
  { path: '/code-review', name: 'code-review', component: CodeReview, meta: { label: '代码审查' } },
  { path: '/api', name: 'api', component: ApiTester, meta: { label: 'API管理' } },
  { path: '/git', name: 'git', component: GitAssistant, meta: { label: 'Git工作流' } },
  { path: '/projects', name: 'projects', component: ProjectWorkspace, meta: { label: '项目设置' } },
  { path: '/ai-history', name: 'ai-history', component: AiHistoryCenter, meta: { label: 'AI历史中心' } },
  { path: '/ai-explain', name: 'ai-explain', component: AiExplain, meta: { label: 'AI解释代码' } },
  { path: '/json', name: 'json', component: JsonTool, meta: { label: 'JSON工具' } },
  { path: '/settings', name: 'settings', component: SettingsView, meta: { label: '设置' } }
]
