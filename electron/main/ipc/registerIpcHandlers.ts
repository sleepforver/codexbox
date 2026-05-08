import { registerAiIpc } from './registerAiIpc.js'
import { registerApiIpc } from './registerApiIpc.js'
import { registerGeoIpc } from './registerGeoIpc.js'
import { registerGitIpc } from './registerGitIpc.js'
import { registerJsonIpc } from './registerJsonIpc.js'
import { registerProjectsIpc } from './registerProjectsIpc.js'
import { registerSettingsIpc } from './registerSettingsIpc.js'

export function registerIpcHandlers(): void {
  registerJsonIpc()
  registerApiIpc()
  registerGitIpc()
  registerGeoIpc()
  registerAiIpc()
  registerProjectsIpc()
  registerSettingsIpc()
}
