import { resolveAssetUrl } from '@/lib/assetPath'
import { readStorage, removeStorage, writeStorage } from '@/lib/safeStorage'

/**
 * iOS の PWA などが抱え込む強いキャッシュを強制的に破棄して、
 * 最新ビルドへ自動で更新する仕組み(MediaKeyLogger と同方式)。
 *
 * - ビルドごとに version.json のバージョン(ビルド時刻)が変わる
 * - 起動時に no-store で取得し、localStorage に控えた値と比較する
 * - 差があれば Service Worker 全解除 + Cache Storage 全削除 + リロード
 * - 通知やバッジは出さない(黙って適用)
 * - オフライン・取得失敗時は何もしない(手元のキャッシュのまま動き続ける)
 */

const VERSION_KEY = 'bluaka-title-call-quiz2.app-version.v1'
const ATTEMPT_KEY = 'bluaka-title-call-quiz2.app-update-attempt.v1'
const FETCH_TIMEOUT_MS = 5000
/** この時間内に同じバージョンへの更新を再検知したら「反映失敗」とみなして諦める */
const ATTEMPT_TTL_MS = 10 * 60 * 1000

const fetchServerVersion = async (): Promise<string | null> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(
      `${resolveAssetUrl('version.json')}?t=${Date.now()}`,
      { cache: 'no-store', signal: controller.signal },
    )
    if (!response.ok) {
      return null
    }
    const data: unknown = await response.json()
    if (typeof data !== 'object' || data === null || !('version' in data)) {
      return null
    }
    return String((data as { version: unknown }).version)
  } catch {
    // オフライン・タイムアウト・パース失敗。すべて「更新なし」として扱う
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

export const clearServiceWorkersAndCaches = async (): Promise<void> => {
  // Service Worker は現状使っていないが、過去の残骸や将来の導入に備えて全解除する
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(
        registrations.map((registration) => registration.unregister()),
      )
    } catch {
      // 解除に失敗しても更新自体は続行する
    }
  }
  if ('caches' in window) {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    } catch {
      // 削除に失敗しても更新自体は続行する
    }
  }
}

export interface UpdateCheckResult {
  /** 取得できなかった場合は null(オフライン等) */
  serverVersion: string | null
  available: boolean
}

/** 手動更新用: 更新があるかだけを調べる(適用はしない)。 */
export const checkForUpdate = async (): Promise<UpdateCheckResult> => {
  if (!navigator.onLine) {
    return { serverVersion: null, available: false }
  }
  const serverVersion = await fetchServerVersion()
  if (serverVersion === null) {
    return { serverVersion: null, available: false }
  }
  const savedVersion = readStorage(VERSION_KEY)
  if (savedVersion === null) {
    writeStorage(VERSION_KEY, serverVersion)
    return { serverVersion, available: false }
  }
  return { serverVersion, available: savedVersion !== serverVersion }
}

/** 手動更新用: キャッシュを破棄してこのバージョンとしてリロードする。 */
export const applyUpdateNow = async (serverVersion: string): Promise<void> => {
  await clearServiceWorkersAndCaches()
  writeStorage(VERSION_KEY, serverVersion)
  removeStorage(ATTEMPT_KEY)
  window.location.reload()
}

/** 起動時に呼ぶ。更新があればページごとリロードする(戻ってこない場合がある)。 */
export const applyPendingAppUpdate = async (): Promise<void> => {
  if (!navigator.onLine) {
    return
  }
  const serverVersion = await fetchServerVersion()
  if (serverVersion === null) {
    return
  }

  const savedVersion = readStorage(VERSION_KEY)
  if (savedVersion === null) {
    // 初回訪問。いま動いているものが最新なので控えるだけ
    writeStorage(VERSION_KEY, serverVersion)
    return
  }
  if (savedVersion === serverVersion) {
    removeStorage(ATTEMPT_KEY)
    return
  }

  // リロードしてもキャッシュが割れない環境で無限リロードにならないよう、
  // 同じバージョンへの強制更新は一定時間内に 1 回だけ試す。
  // (更新が成功したケースもこの分岐を通ってバージョン記録が確定する)
  const attemptRaw = readStorage(ATTEMPT_KEY)
  if (attemptRaw !== null) {
    try {
      const attempt = JSON.parse(attemptRaw) as {
        version?: unknown
        at?: unknown
      }
      if (
        String(attempt.version) === serverVersion &&
        typeof attempt.at === 'number' &&
        Date.now() - attempt.at < ATTEMPT_TTL_MS
      ) {
        writeStorage(VERSION_KEY, serverVersion)
        removeStorage(ATTEMPT_KEY)
        return
      }
    } catch {
      // 壊れた記録は無視して更新を試す
    }
  }
  writeStorage(
    ATTEMPT_KEY,
    JSON.stringify({ version: serverVersion, at: Date.now() }),
  )

  await clearServiceWorkersAndCaches()
  window.location.reload()
}
