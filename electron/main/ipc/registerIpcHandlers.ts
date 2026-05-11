import { registerAiIpc } from './registerAiIpc.js'
import { registerApiIpc } from './registerApiIpc.js'
import { registerGitIpc } from './registerGitIpc.js'
import { registerJsonIpc } from './registerJsonIpc.js'
import { registerProjectsIpc } from './registerProjectsIpc.js'
import { registerSettingsIpc } from './registerSettingsIpc.js'
import { registerUpdateIpc } from './registerUpdateIpc.js'

export function registerIpcHandlers(): void {
  registerJsonIpc()
  registerApiIpc()
  registerGitIpc()
  registerAiIpc()
  registerProjectsIpc()
  registerSettingsIpc()
  registerUpdateIpc()
}
