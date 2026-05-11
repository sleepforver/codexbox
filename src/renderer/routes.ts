import type { RouteRecordRaw } from 'vue-router'
import ProjectWorkspace from './views/ProjectWorkspace.vue'
import JsonTool from './views/JsonTool.vue'
import ApiTester from './views/ApiTester.vue'
import GitAssistant from './views/GitAssistant.vue'
import AiExplain from './views/AiExplain.vue'
import AiGenerate from './views/AiGenerate.vue'
import AiHistoryCenter from './views/AiHistoryCenter.vue'
import SettingsView from './views/SettingsView.vue'

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/projects' },
  { path: '/projects', name: 'projects', component: ProjectWorkspace, meta: { label: '项目工作区' } },
  { path: '/json', name: 'json', component: JsonTool, meta: { label: 'JSON工具' } },
  { path: '/api', name: 'api', component: ApiTester, meta: { label: 'API测试' } },
  { path: '/git', name: 'git', component: GitAssistant, meta: { label: 'Git助手' } },
  { path: '/ai-explain', name: 'ai-explain', component: AiExplain, meta: { label: 'AI解释代码' } },
  { path: '/ai-generate', name: 'ai-generate', component: AiGenerate, meta: { label: 'AI生成代码' } },
  { path: '/ai-history', name: 'ai-history', component: AiHistoryCenter, meta: { label: 'AI历史中心' } },
  { path: '/settings', name: 'settings', component: SettingsView, meta: { label: '设置' } }
]
