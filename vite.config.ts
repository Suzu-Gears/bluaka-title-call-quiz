import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type Plugin } from 'vite'

const packageJsonPath = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  'package.json',
)
const packageJson = (() => {
  try {
    return JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  } catch (error) {
    throw new Error(`Failed to load package.json from ${packageJsonPath}`, {
      cause: error,
    })
  }
})()

/**
 * ビルドごとに dist/version.json へビルド時刻を書き出す。
 * クライアントはこれを no-store で取得して自動アップデート判定に使う
 * (public/version.json の "dev" は開発時のプレースホルダーで、ビルドで上書きされる)。
 */
const versionJsonPlugin = (): Plugin => ({
  name: 'version-json',
  apply: 'build',
  closeBundle() {
    const outDir = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist')
    writeFileSync(
      resolve(outDir, 'version.json'),
      JSON.stringify({ version: Date.now().toString() }),
      'utf-8',
    )
  },
})

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
    plugins: [versionJsonPlugin()],
  }
})
