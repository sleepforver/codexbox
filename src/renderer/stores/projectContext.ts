import { computed, ref, watch } from 'vue'
import type { WorkspaceProject } from '../../shared/ipc'
import { devtoolsApi } from '../devtoolsApi'

const storageKey = 'codexbox:current-project-id'

export const projects = ref<WorkspaceProject[]>([])
export const currentProjectId = ref(localStorage.getItem(storageKey) ?? '')
export const currentProject = computed(
  () => projects.value.find((project) => project.id === currentProjectId.value) ?? null
)

function rememberProject(id: string): void {
  currentProjectId.value = id
  if (id) localStorage.setItem(storageKey, id)
  else localStorage.removeItem(storageKey)
}

export function setCurrentProject(id: string): void {
  rememberProject(projects.value.some((project) => project.id === id) ? id : '')
}

export async function loadProjectContext(preferredProjectId = currentProjectId.value): Promise<WorkspaceProject[]> {
  projects.value = await devtoolsApi.projects.list()
  const nextProjectId =
    projects.value.find((project) => project.id === preferredProjectId)?.id ??
    projects.value.find((project) => project.id === currentProjectId.value)?.id ??
    projects.value[0]?.id ??
    ''
  rememberProject(nextProjectId)
  return projects.value
}

export async function markCurrentProjectOpened(): Promise<WorkspaceProject[]> {
  if (!currentProjectId.value) return projects.value
  projects.value = await devtoolsApi.projects.markOpened(currentProjectId.value)
  setCurrentProject(currentProjectId.value)
  return projects.value
}

watch(currentProjectId, (id) => {
  if (id) localStorage.setItem(storageKey, id)
  else localStorage.removeItem(storageKey)
})
