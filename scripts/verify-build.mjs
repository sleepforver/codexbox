import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const requiredOutputs = ['out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html']

const missing = requiredOutputs.filter((item) => {
  const path = join(process.cwd(), item)
  return !existsSync(path) || statSync(path).size === 0
})

if (missing.length) {
  console.error(`build output check failed: ${missing.join(', ')}`)
  process.exit(1)
}

console.log('build output check passed')
