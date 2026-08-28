import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type Plugin } from 'vite'

import { listFilesRecursively } from './src/lib/fileOperations'

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
 * ビルド識別子。JS へ __BUILD_STAMP__ として焼き込み、version.json にも同じ値を
 * 書き出す。実行中のビルドとサーバー上のビルドを直接比較できるようにするため
 * (開発サーバーでは public/version.json の "dev" と一致しないが、更新判定は
 * 本番ビルドでしか動かさないので問題ない)。
 */
const buildStamp = Date.now().toString()

const distDir = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist')

/**
 * ビルドごとに dist/version.json へビルド識別子とアプリバージョンを書き出す。
 * クライアントはこれを no-store で取得して更新判定・最新バージョン表示に使う
 * (public/version.json の "dev" は開発時のプレースホルダーで、ビルドで上書きされる)。
 */
const versionJsonPlugin = (): Plugin => ({
  name: 'version-json',
  apply: 'build',
  closeBundle() {
    // ビルドが途中で失敗すると dist が無いまま closeBundle が呼ばれ、
    // ここでの ENOENT が本来のビルドエラーを覆い隠してしまうため何もしない。
    if (!existsSync(distDir)) {
      return
    }
    writeFileSync(
      resolve(distDir, 'version.json'),
      JSON.stringify({
        version: buildStamp,
        appVersion: String(packageJson.version ?? ''),
      }),
      'utf-8',
    )
  },
})

/** cache-manifest.json に含めないファイル。常に最新を取りたいもの・SW 本体。 */
const CACHE_MANIFEST_EXCLUDED = new Set([
  'version.json',
  'cache-manifest.json',
  'sw.js',
])

/**
 * dist の全ファイル一覧とサイズを dist/cache-manifest.json へ書き出す。
 * 設定画面の「全データのサイズ表示」と「すべてダウンロード」がこれを読む。
 * version-json プラグインの closeBundle より後に実行される前提はない
 * (version.json は除外リストで弾くので順序に依存しない)。
 */
const cacheManifestPlugin = (): Plugin => ({
  name: 'cache-manifest',
  apply: 'build',
  closeBundle() {
    // version-json プラグインと同じく、ビルド失敗時はエラーを隠さないよう何もしない。
    if (!existsSync(distDir)) {
      return
    }
    const files = listFilesRecursively(distDir)
      .filter((relativePath) => !CACHE_MANIFEST_EXCLUDED.has(relativePath))
      .map((relativePath) => ({
        path: relativePath,
        size: statSync(resolve(distDir, relativePath)).size,
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    writeFileSync(
      resolve(distDir, 'cache-manifest.json'),
      JSON.stringify({ version: buildStamp, totalSize, files }),
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
      __BUILD_STAMP__: JSON.stringify(buildStamp),
    },
    plugins: [versionJsonPlugin(), cacheManifestPlugin()],
  }
})
