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

/** キャッシュ済みリクエストのパス名一覧。保存状況の判定に使う。 */
const listCachedPathnames = async (cache: Cache): Promise<Set<string>> => {
  const keys = await cache.keys()
  return new Set(keys.map((request) => new URL(request.url).pathname))
}

const resolveAssetPathname = (path: string): string =>
  new URL(resolveAssetUrl(path), window.location.href).pathname

/** マニフェストの各ファイルが Cache Storage に入っているかを数える。 */
export const readLocalCacheStatus = async (
  manifest: CacheManifest,
): Promise<LocalCacheStatus> => {
  if (!isCacheStorageSupported()) {
    return { cachedFileCount: 0, cachedBytes: 0 }
  }
  try {
    const cache = await caches.open(ASSET_CACHE_NAME)
    const cachedPaths = await listCachedPathnames(cache)
    let cachedFileCount = 0
    let cachedBytes = 0
    for (const file of manifest.files) {
      if (cachedPaths.has(resolveAssetPathname(file.path))) {
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
  /** キャンセルで中断された場合 true。保存済みの分は残る。 */
  aborted: boolean
  /** 実際にダウンロード対象になったファイル数。0 なら全部保存済みだった。 */
  plannedCount: number
}

/**
 * 音声は 1 本 15-35KB 程度の小ファイルが数百個あり、所要時間は帯域ではなく
 * リクエストの往復回数で決まる。並列数を上げるほど RTT を重ねられる。
 */
const DOWNLOAD_CONCURRENCY = 10

/**
 * マニフェストのうち未保存のファイルだけを Cache Storage へダウンロードする。
 * 保存状況の走査は進捗に含めず、onProgress は不足分がある場合にのみ、
 * 不足分を母数として呼ばれる。個別の失敗では止めず、最後に失敗数を返す。
 * signal で即時キャンセルできる。
 */
export const downloadAllAssets = async (
  manifest: CacheManifest,
  onProgress: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<DownloadAllResult> => {
  if (!isCacheStorageSupported()) {
    return {
      ok: false,
      failedCount: manifest.files.length,
      aborted: false,
      plannedCount: manifest.files.length,
    }
  }
  const cache = await caches.open(ASSET_CACHE_NAME)
  const cachedPaths = await listCachedPathnames(cache)
  const targets = manifest.files.filter(
    (file) => !cachedPaths.has(resolveAssetPathname(file.path)),
  )
  if (targets.length === 0) {
    return { ok: true, failedCount: 0, aborted: false, plannedCount: 0 }
  }

  // Service Worker がページを制御している間は、fetch を横取りした SW 側が
  // 同じキャッシュへ保存する。ページ側でも put すると全ファイルが
  // 二重書き込みになり倍近く遅くなるため省く。
  const isCachedByServiceWorker =
    'serviceWorker' in navigator && navigator.serviceWorker.controller !== null
  const totalFiles = targets.length
  const totalBytes = targets.reduce((sum, file) => sum + file.size, 0)
  let doneFiles = 0
  let doneBytes = 0
  let failedCount = 0

  const reportProgress = () => {
    onProgress({ doneFiles, totalFiles, doneBytes, totalBytes })
  }
  reportProgress()

  const queue = [...targets]
  const worker = async () => {
    for (;;) {
      if (signal?.aborted) {
        return
      }
      const file = queue.shift()
      if (!file) {
        return
      }
      const url = resolveAssetUrl(file.path)
      try {
        const response = await fetch(url, { signal })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        if (!isCachedByServiceWorker) {
          await cache.put(url, response)
        }
      } catch {
        if (signal?.aborted) {
          return
        }
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
  const aborted = signal?.aborted ?? false
  return {
    ok: failedCount === 0 && !aborted,
    failedCount,
    aborted,
    plannedCount: targets.length,
  }
}
