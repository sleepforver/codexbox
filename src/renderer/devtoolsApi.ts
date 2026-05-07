import type { DevtoolsApi } from '../shared/ipc'

export const devtoolsApi = (window as unknown as { devtoolsApi: DevtoolsApi }).devtoolsApi
