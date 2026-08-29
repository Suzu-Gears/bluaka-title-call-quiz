import { resolveAssetUrl } from '@/lib/assetPath'
import { readStorage, removeStorage, writeStorage } from '@/lib/safeStorage'

declare const __BUILD_STAMP__: string

/**
 * iOS の PWA などが抱え込む強いキャッシュを強制的に破棄して、
 * 最新ビルドへ更新する仕組み(MediaKeyLogger と同方式)。
 *
 * - ビルドごとに version.json のビルド識別子(ビルド時刻)が変わる
 * - 同じ識別子が JS へ __BUILD_STAMP__ として焼き込まれているので、
 *   「いま実際に動いているビルド」とサーバー上のビルドを直接比較できる
 * - 差があれば Service Worker 全解除 + Cache Storage 全削除 + リロード
 * - 通常タブでは黙って適用、PWA では設定画面からの手動適用+バッジ表示
 * - オフライン・取得失敗時は何もしない(手元のキャッシュのまま動き続ける)
 */

const ATTEMPT_KEY = 'bluaka-title-call-quiz2.app-update-attempt.v1'
const FETCH_TIMEOUT_MS = 5000
/** この時間内に同じバージョンへの更新を再検知したら「反映失敗」とみなして諦める */
const ATTEMPT_TTL_MS = 10 * 60 * 1000

/** いま実行中のビルドの識別子(ビルド時刻のミリ秒文字列。開発時は dev 用の値)。 */
export const getRunningBuildStamp = (): string => __BUILD_STAMP__

export interface ServerVersionInfo {
  /** ビルド識別子(Date.now() の文字列) */
  version: string
  /** package.json のバージョン。旧ビルドの version.json には無いので null 許容 */
  appVersion: string | null
}

const fetchServerVersionInfo = async (): Promise<ServerVersionInfo | null> => {
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
    const record = data as { version: unknown; appVersion?: unknown }
    return {
      version: String(record.version),
      appVersion:
        typeof record.appVersion === 'string' && record.appVersion.length > 0
          ? record.appVersion
          : null,
    }
  } catch {
    // オフライン・タイムアウト・パース失敗。すべて「更新なし」として扱う
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Service Worker を登録する(本番ビルドのみ)。PWA モードかどうかの判定は
 * 呼び出し側の責任。登録済みなら何もしないのと同じで、何度呼んでも安全。
 * キャッシュクリアで SW を解除した後の登録し直しにも使う。
 */
export const registerAppServiceWorker = (): void => {
  if (!import.meta.env.PROD) {
    return
  }
  if (!('serviceWorker' in navigator)) {
    return
  }
  navigator.serviceWorker
    .register(resolveAssetUrl('sw.js'), { updateViaCache: 'none' })
    .catch(() => {
      // 登録に失敗してもアプリ本体は普通に動く
    })
}

const unregisterServiceWorkers = async (): Promise<void> => {
  if (!('serviceWorker' in navigator)) {
    return
  }
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    )
  } catch {
    // 解除に失敗しても更新自体は続行する
  }
}

/** 設定画面の「キャッシュ削除」「初期化」用。音声・画像も含めて全部消す。 */
export const clearServiceWorkersAndCaches = async (): Promise<void> => {
  await unregisterServiceWorkers()
  if ('caches' in window) {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    } catch {
      // 削除に失敗しても更新自体は続行する
    }
  }
}

const toPathname = (path: string): string =>
  new URL(resolveAssetUrl(path), window.location.href).pathname

/**
 * 更新で消す対象 = ビルドごとに差し替わるアプリシェル。
 *
 * 「残すものを選ぶ」のではなく「消すものを絞る」ことが重要。ここに挙げたものは
 * すべて、SW の precacheAppShell か直後のページ読み込みで必ず取り直されるので、
 * 更新後に保存済み件数が目減りしない。逆に、消しても誰も取り直さないファイル
 * (アイコン・og-image・robots.txt・ビルド生成物の JSON など)を消してしまうと、
 * 「すべてダウンロード」をやり直すまで欠けたままになる。
 */
const SHELL_EXACT_PATHS = ['', 'index.html', 'data/final.json'].map(toPathname)
const SHELL_PATH_PREFIXES = ['assets/', 'fonts/'].map(toPathname)

const isAppShellRequest = (request: Request): boolean => {
  try {
    const { pathname } = new URL(request.url)
    return (
      SHELL_EXACT_PATHS.includes(pathname) ||
      SHELL_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    )
  } catch {
    return false
  }
}

/**
 * 更新用: Service Worker を解除し、アプリシェル(HTML/JS/CSS・フォント・
 * final.json)だけを消す。「すべてダウンロード」で貯めた音声・画像
 * (合わせて 9MB 超)やアイコン類は残し、更新のたびに取り直させない。
 *
 * 音声・画像は録り直し(世代)や差し替えでファイル名自体が変わるため、
 * 古いエントリが残っても誤って配信されることはない。同名で中身だけ
 * 差し替えた場合に備え、設定画面の「キャッシュ削除」は全消しのまま残す。
 */
export const clearAppShellCaches = async (): Promise<void> => {
  await unregisterServiceWorkers()
  if (!('caches' in window)) {
    return
  }
  try {
    const keys = await caches.keys()
    await Promise.all(
      keys.map(async (key) => {
        const cache = await caches.open(key)
        const requests = await cache.keys()
        await Promise.all(
          requests
            .filter((request) => isAppShellRequest(request))
            .map((request) => cache.delete(request)),
        )
      }),
    )
  } catch {
    // 削除に失敗しても更新自体は続行する
  }
}

export interface UpdateCheckResult {
  /** 取得できなかった場合は null(オフライン等) */
  info: ServerVersionInfo | null
  available: boolean
}

/** 手動更新用: 更新があるかだけを調べる(適用はしない)。 */
export const checkForUpdate = async (): Promise<UpdateCheckResult> => {
  if (!navigator.onLine) {
    return { info: null, available: false }
  }
  const info = await fetchServerVersionInfo()
  if (info === null) {
    return { info: null, available: false }
  }
  // 開発サーバーでは version.json がプレースホルダーなので常に「最新」とする
  if (import.meta.env.DEV) {
    return { info, available: false }
  }
  return { info, available: info.version !== __BUILD_STAMP__ }
}

/** 手動更新用: アプリシェルを破棄して最新ビルドとしてリロードする。 */
export const applyUpdateNow = async (): Promise<void> => {
  await clearAppShellCaches()
  removeStorage(ATTEMPT_KEY)
  window.location.reload()
}

/** 起動時に呼ぶ。更新があればページごとリロードする(戻ってこない場合がある)。 */
export const applyPendingAppUpdate = async (): Promise<void> => {
  if (import.meta.env.DEV) {
    return
  }
  if (!navigator.onLine) {
    return
  }
  const info = await fetchServerVersionInfo()
  if (info === null) {
    return
  }
  if (info.version === __BUILD_STAMP__) {
    removeStorage(ATTEMPT_KEY)
    return
  }

  // リロードしてもキャッシュが割れない環境で無限リロードにならないよう、
  // 同じバージョンへの強制更新は一定時間内に 1 回だけ試す。
  const attemptRaw = readStorage(ATTEMPT_KEY)
  if (attemptRaw !== null) {
    try {
      const attempt = JSON.parse(attemptRaw) as {
        version?: unknown
        at?: unknown
      }
      if (
        String(attempt.version) === info.version &&
        typeof attempt.at === 'number' &&
        Date.now() - attempt.at < ATTEMPT_TTL_MS
      ) {
        return
      }
    } catch {
      // 壊れた記録は無視して更新を試す
    }
  }
  writeStorage(
    ATTEMPT_KEY,
    JSON.stringify({ version: info.version, at: Date.now() }),
  )

  await clearAppShellCaches()
  window.location.reload()
}
