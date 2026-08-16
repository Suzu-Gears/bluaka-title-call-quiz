import { resolveAssetUrl } from '@/lib/assetPath'

/**
 * 設定画面の「キャッシュ」欄を支えるモジュール。
 * ビルド時に生成される cache-manifest.json(全配信ファイルの一覧とサイズ)を元に、
 * サーバー上の総サイズ表示・端末に保存済みの割合表示・一括ダウンロードを行う。
 * キャッシュ名は sw.js のランタイムキャッシュと共有する。
 */

export const ASSET_CACHE_NAME = 'bluaka-title-call-quiz-assets-v1'

const MANIFEST_FETCH_TIMEOUT_MS = 10000

export interface CacheManifestFile {
  path: string
  size: number
}

export interface CacheManifest {
  version: string
  totalSize: number
  files: CacheManifestFile[]
}

export function normalizeCacheManifest(raw: unknown): CacheManifest | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const source = raw as Partial<CacheManifest>
  if (!Array.isArray(source.files)) {
    return null
  }
  const files: CacheManifestFile[] = []
  for (const value of source.files) {
    if (!value || typeof value !== 'object') {
      continue
    }
    const path = (value as { path?: unknown }).path
    const size = Number((value as { size?: unknown }).size)
    if (typeof path !== 'string' || path.length === 0) {
      continue
    }
    files.push({ path, size: Number.isFinite(size) && size > 0 ? size : 0 })
  }
  if (files.length === 0) {
    return null
  }
  return {
    version: typeof source.version === 'string' ? source.version : '',
    totalSize: files.reduce((sum, file) => sum + file.size, 0),
    files,
  }
}

/** 1024 基数で 'KB' / 'MB' 表示にする。設定画面のサイズ表示用。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '-'
  }
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) {
    return `${(Math.round(mb * 10) / 10).toFixed(1)} MB`
  }
  const kb = bytes / 1024
  if (kb >= 1) {
    return `${Math.round(kb)} KB`
  }
  return `${bytes} B`
}

export const fetchCacheManifest = async (): Promise<CacheManifest | null> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), MANIFEST_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(
      `${resolveAssetUrl('cache-manifest.json')}?t=${Date.now()}`,
      { cache: 'no-store', signal: controller.signal },
    )
    if (!response.ok) {
      return null
    }
    return normalizeCacheManifest(await response.json())
  } catch {
    // オフライン・タイムアウト・開発サーバー(未生成)。呼び出し側で非表示にする
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

export interface LocalCacheStatus {
  /** マニフェスト掲載ファイルのうち端末に保存済みの数 */
  cachedFileCount: number
  /** 保存済みファイルの合計サイズ(マニフェストのサイズで集計) */
  cachedBytes: number
}

const isCacheStorageSupported = (): boolean => 'caches' in window

/** マニフェストの各ファイルが Cache Storage に入っているかを数える。 */
export const readLocalCacheStatus = async (
  manifest: CacheManifest,
): Promise<LocalCacheStatus> => {
  if (!isCacheStorageSupported()) {
    return { cachedFileCount: 0, cachedBytes: 0 }
  }
  try {
    const cache = await caches.open(ASSET_CACHE_NAME)
    const keys = await cache.keys()
    const cachedPaths = new Set(
      keys.map((request) => new URL(request.url).pathname),
    )
    let cachedFileCount = 0
    let cachedBytes = 0
    for (const file of manifest.files) {
      const pathname = new URL(resolveAssetUrl(file.path), window.location.href)
        .pathname
      if (cachedPaths.has(pathname)) {
        cachedFileCount += 1
        cachedBytes += file.size
      }
    }
    return { cachedFileCount, cachedBytes }
  } catch {
    return { cachedFileCount: 0, cachedBytes: 0 }
  }
}

export interface DownloadProgress {
  doneFiles: number
  totalFiles: number
  doneBytes: number
  totalBytes: number
}

export interface DownloadAllResult {
  ok: boolean
  failedCount: number
}

const DOWNLOAD_CONCURRENCY = 4

/**
 * マニフェストの全ファイルを Cache Storage へ保存する。
 * 保存済みのファイルは取得せず、進捗にだけ加算する(差分ダウンロード)。
 * 個別の失敗では止めず、最後に失敗数を返す。
 */
export const downloadAllAssets = async (
  manifest: CacheManifest,
  onProgress: (progress: DownloadProgress) => void,
): Promise<DownloadAllResult> => {
  if (!isCacheStorageSupported()) {
    return { ok: false, failedCount: manifest.files.length }
  }
  const cache = await caches.open(ASSET_CACHE_NAME)
  const totalFiles = manifest.files.length
  const totalBytes = manifest.totalSize
  let doneFiles = 0
  let doneBytes = 0
  let failedCount = 0

  const reportProgress = () => {
    onProgress({ doneFiles, totalFiles, doneBytes, totalBytes })
  }
  reportProgress()

  const queue = [...manifest.files]
  const worker = async () => {
    for (;;) {
      const file = queue.shift()
      if (!file) {
        return
      }
      const url = resolveAssetUrl(file.path)
      try {
        const cached = await cache.match(url)
        if (!cached) {
          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }
          await cache.put(url, response)
        }
      } catch {
        failedCount += 1
      }
      doneFiles += 1
      doneBytes += file.size
      reportProgress()
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(DOWNLOAD_CONCURRENCY, queue.length) },
      worker,
    ),
  )
  return { ok: failedCount === 0, failedCount }
}
