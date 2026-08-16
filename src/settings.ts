import {
  applyUpdateNow,
  checkForUpdate,
  clearServiceWorkersAndCaches,
} from '@/lib/appUpdate'

declare const __APP_VERSION__: string

/**
 * 設定画面(歯車)。PWA(スタンドアロン)として開いているときだけ表示し、
 * アップデート・キャッシュクリア・再ダウンロード・初期化を手動で行えるようにする。
 * 通常のブラウザタブでは何も表示しない(更新は自動適用に任せる)。
 */

/** ホーム画面から起動した PWA(standalone 表示)かどうか。 */
const isStandaloneDisplay = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS Safari 独自プロパティ(古い iOS のホーム画面アプリ用フォールバック)
  ('standalone' in navigator &&
    (navigator as { standalone?: boolean }).standalone === true)

/** 開発・動作確認用: `?pwa` を付けるとブラウザタブでも PWA 扱いにできる。 */
const isPwaDebugForced = (): boolean =>
  new URLSearchParams(window.location.search).has('pwa')

export const isPwaMode = (): boolean =>
  isStandaloneDisplay() || isPwaDebugForced()

/** このアプリが localStorage に保存しているデータかどうか(初期化の対象判定)。 */
const isAppStorageKey = (key: string): boolean =>
  key.startsWith('bluaka-title-call-quiz') || key === 'quizProficiency'

const removeAllAppStorage = (): void => {
  try {
    const keys = Object.keys(localStorage).filter(isAppStorageKey)
    keys.forEach((key) => localStorage.removeItem(key))
  } catch {
    // ストレージにアクセスできない環境では何もしない
  }
}

export const setupSettings = (): void => {
  const openButton = document.getElementById(
    'settings-open',
  ) as HTMLButtonElement | null
  const badge = document.getElementById('settings-badge')
  const dialog = document.getElementById(
    'settings-dialog',
  ) as HTMLDialogElement | null
  const closeButton = document.getElementById('settings-dialog-close')
  const versionLine = document.getElementById('settings-version-line')
  const statusText = document.getElementById('settings-status')
  const checkUpdateButton = document.getElementById(
    'settings-check-update',
  ) as HTMLButtonElement | null
  const clearCacheButton = document.getElementById(
    'settings-clear-cache',
  ) as HTMLButtonElement | null
  const redownloadButton = document.getElementById(
    'settings-redownload',
  ) as HTMLButtonElement | null
  const resetButton = document.getElementById(
    'settings-reset-app',
  ) as HTMLButtonElement | null

  if (!openButton || !dialog) {
    return
  }
  if (!isPwaMode()) {
    return
  }

  openButton.hidden = false
  if (versionLine) {
    versionLine.textContent = `バージョン: ${__APP_VERSION__}`
  }

  const setStatus = (message: string) => {
    if (statusText) {
      statusText.textContent = message
    }
  }

  openButton.addEventListener('click', () => {
    setStatus('')
    dialog.showModal()
  })
  closeButton?.addEventListener('click', () => {
    dialog.close()
  })

  // 起動時に一度だけ更新を確認し、あれば歯車にバッジを出す(適用はしない)。
  void (async () => {
    const result = await checkForUpdate()
    if (badge) {
      badge.hidden = !result.available
    }
  })()

  checkUpdateButton?.addEventListener('click', () => {
    void (async () => {
      checkUpdateButton.disabled = true
      setStatus('更新を確認しています...')
      try {
        const result = await checkForUpdate()
        if (result.serverVersion === null) {
          setStatus('確認できませんでした。通信環境を確認してください。')
          return
        }
        if (!result.available) {
          setStatus('最新の状態です。')
          if (badge) {
            badge.hidden = true
          }
          return
        }
        setStatus('更新を適用しています...')
        await applyUpdateNow(result.serverVersion)
        // ここには基本的に戻らない(リロードされる)
      } finally {
        checkUpdateButton.disabled = false
      }
    })()
  })

  clearCacheButton?.addEventListener('click', () => {
    void (async () => {
      clearCacheButton.disabled = true
      setStatus('キャッシュを削除しています...')
      await clearServiceWorkersAndCaches()
      setStatus('キャッシュをクリアしました。')
      clearCacheButton.disabled = false
    })()
  })

  redownloadButton?.addEventListener('click', () => {
    void (async () => {
      redownloadButton.disabled = true
      setStatus('取得し直しています...')
      await clearServiceWorkersAndCaches()
      window.location.reload()
    })()
  })

  resetButton?.addEventListener('click', () => {
    const confirmed = window.confirm(
      '進捗(クイズの正答記録)や設定をすべて削除して初期状態に戻します。\nこの操作は取り消せません。よろしいですか？',
    )
    if (!confirmed) {
      return
    }
    void (async () => {
      resetButton.disabled = true
      setStatus('初期化しています...')
      removeAllAppStorage()
      await clearServiceWorkersAndCaches()
      window.location.reload()
    })()
  })
}
