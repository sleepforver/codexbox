/// <reference types="vite/client" />

import type { DevtoolsApi } from '../shared/ipc'

declare global {
  interface Window {
    devtoolsApi: DevtoolsApi
  }
}

export {}
