import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'

const packageJsonPath = resolve(fileURLToPath(new URL('.', import.meta.url)), 'package.json')
const packageJson = (() => {
  try {
    return JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  } catch (error) {
    throw new Error(`Failed to load package.json from ${packageJsonPath}`, { cause: error })
  }
})()

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: env.BASE_PATH || '/',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version ?? ''),
    },
  }
})
