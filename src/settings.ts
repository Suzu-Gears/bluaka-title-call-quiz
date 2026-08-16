import {
  applyUpdateNow,
  checkForUpdate,
  clearServiceWorkersAndCaches,
  getRunningBuildStamp,
  registerAppServiceWorker,
  type ServerVersionInfo,
} from '@/lib/appUpdate'
import {
  downloadAllAssets,
  fetchCacheManifest,
  formatBytes,
  readLocalCacheStatus,
  type CacheManifest,
} from '@/lib/assetCache'

declare const __APP_VERSION__: string

/**
 * 設定画面(歯車)。PWA(スタンドアロン)として開いているときだけ表示し、
 * ステータス確認・アップデート・全データダウンロード・キャッシュクリア・
 * 初期化を手動で行えるようにする。
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
  key.startsWith('bluaka-title-call-quiz')

const removeAllAppStorage = (): void => {
  try {
    const keys = Object.keys(localStorage).filter(isAppStorageKey)
    keys.forEach((key) => localStorage.removeItem(key))
  } catch {
    // ストレージにアクセスできない環境では何もしない
  }
}

/** ビルド識別子(Date.now() の文字列)を「2026/08/16 12:34」形式にする。 */
const formatBuildStamp = (stamp: string): string | null => {
  const ms = Number(stamp)
  if (!Number.isFinite(ms) || ms <= 0) {
    return null
  }
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const formatVersionLabel = (
  appVersion: string | null,
  buildStamp: string,
): string => {
  const builtAt = formatBuildStamp(buildStamp)
  const version = appVersion ?? '不明'
  return builtAt ? `${version}（${builtAt} ビルド）` : version
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
  const networkState = document.getElementById('settings-network-state')
  const currentVersionText = document.getElementById(
    'settings-current-version',
  )
  const latestVersionText = document.getElementById('settings-latest-version')
  const updateNote = document.getElementById('settings-update-note')
  const statusText = document.getElementById('settings-status')
  const checkUpdateButton = document.getElementById(
    'settings-check-update',
  ) as HTMLButtonElement | null
  const updateButtonBadge = document.getElementById(
    'settings-update-button-badge',
  )
  const applyUpdateButton = document.getElementById(
    'settings-apply-update',
  ) as HTMLButtonElement | null
  const cacheSizeLine = document.getElementById('settings-cache-size-line')
  const downloadProgress = document.getElementById(
    'settings-download-progress',
  )
  const downloadProgressBar = document.getElementById(
    'settings-download-progress-bar',
  ) as HTMLProgressElement | null
  const downloadProgressText = document.getElementById(
    'settings-download-progress-text',
  )
  const downloadAllButton = document.getElementById(
    'settings-download-all',
  ) as HTMLButtonElement | null
  const cancelDownloadButton = document.getElementById(
    'settings-cancel-download',
  ) as HTMLButtonElement | null
  const clearCacheButton = document.getElementById(
    'settings-clear-cache',
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

  const setStatus = (message: string) => {
    if (statusText) {
      statusText.textContent = message
    }
  }

  const setUpdateNote = (message: string) => {
    if (updateNote) {
      updateNote.textContent = message
      updateNote.hidden = message.length === 0
    }
  }

  // --- ステータス欄 -------------------------------------------------------

  if (currentVersionText) {
    currentVersionText.textContent = formatVersionLabel(
      __APP_VERSION__,
      getRunningBuildStamp(),
    )
  }

  const renderNetworkState = () => {
    if (networkState) {
      networkState.textContent = navigator.onLine ? 'オンライン' : 'オフライン'
    }
  }
  renderNetworkState()
  window.addEventListener('online', renderNetworkState)
  window.addEventListener('offline', renderNetworkState)

  // --- アップデート -------------------------------------------------------

  let latestInfo: ServerVersionInfo | null = null
  let updateAvailable = false

  const renderUpdateState = () => {
    if (latestVersionText) {
      latestVersionText.textContent = latestInfo
        ? formatVersionLabel(latestInfo.appVersion, latestInfo.version)
        : '取得できませんでした'
    }
    if (badge) {
      badge.hidden = !updateAvailable
    }
    if (updateButtonBadge) {
      updateButtonBadge.hidden = !updateAvailable
    }
    if (applyUpdateButton) {
      applyUpdateButton.hidden = !updateAvailable
    }
    setUpdateNote(
      updateAvailable ? '新しいバージョンがあります。' : '',
    )
  }

  /** 更新確認。showResult が真のときだけ結果をステータス欄へ出す。 */
  const runUpdateCheck = async (showResult: boolean) => {
    if (checkUpdateButton) {
      checkUpdateButton.disabled = true
    }
    try {
      const result = await checkForUpdate()
      latestInfo = result.info
      updateAvailable = result.available
      renderUpdateState()
      if (!showResult) {
        return
      }
      if (result.info === null) {
        setUpdateNote('確認できませんでした。通信環境を確認してください。')
        return
      }
      if (!result.available) {
        setUpdateNote('最新の状態です。')
      }
    } finally {
      if (checkUpdateButton) {
        checkUpdateButton.disabled = false
      }
    }
  }

  checkUpdateButton?.addEventListener('click', () => {
    setUpdateNote('更新を確認しています...')
    void runUpdateCheck(true)
  })

  applyUpdateButton?.addEventListener('click', () => {
    void (async () => {
      applyUpdateButton.disabled = true
      setUpdateNote('更新を適用しています...')
      await applyUpdateNow()
      // ここには基本的に戻らない(リロードされる)
    })()
  })

  // --- データのダウンロード -----------------------------------------------

  let manifest: CacheManifest | null = null
  let isDownloading = false
  let downloadAbortController: AbortController | null = null

  const renderCacheSizeLine = async () => {
    if (!cacheSizeLine) {
      return
    }
    manifest ??= await fetchCacheManifest()
    if (!manifest) {
      cacheSizeLine.textContent =
        'データサイズを取得できませんでした（オフラインの可能性があります）。'
      return
    }
    const local = await readLocalCacheStatus(manifest)
    cacheSizeLine.textContent =
      `全データ: 約${formatBytes(manifest.totalSize)}（${manifest.files.length} ファイル） / ` +
      `端末に保存済み: ${formatBytes(local.cachedBytes)}（${local.cachedFileCount} ファイル）`
  }

  const setDownloadProgress = (
    doneBytes: number,
    totalBytes: number,
    visible: boolean,
  ) => {
    if (downloadProgress) {
      downloadProgress.hidden = !visible
    }
    if (!visible) {
      return
    }
    const ratio = totalBytes > 0 ? doneBytes / totalBytes : 0
    if (downloadProgressBar) {
      downloadProgressBar.value = Math.min(1, ratio)
    }
    if (downloadProgressText) {
      downloadProgressText.textContent = `${formatBytes(doneBytes)} / ${formatBytes(totalBytes)}（${Math.floor(ratio * 100)}%）`
    }
  }

  downloadAllButton?.addEventListener('click', () => {
    void (async () => {
      if (isDownloading) {
        return
      }
      manifest ??= await fetchCacheManifest()
      if (!manifest) {
        setStatus('ファイル一覧を取得できませんでした。通信環境を確認してください。')
        return
      }
      isDownloading = true
      downloadAllButton.disabled = true
      downloadAbortController = new AbortController()
      setStatus('保存状況を確認しています...')
      try {
        const result = await downloadAllAssets(
          manifest,
          (progress) => {
            // 不足分がある場合にだけ呼ばれる。ここで初めてバーとキャンセルを出す
            if (cancelDownloadButton?.hidden) {
              cancelDownloadButton.hidden = false
              cancelDownloadButton.disabled = false
              setStatus('ダウンロードしています...')
            }
            setDownloadProgress(progress.doneBytes, progress.totalBytes, true)
          },
          downloadAbortController.signal,
        )
        if (result.aborted) {
          setStatus(
            'ダウンロードをキャンセルしました。保存済みの分は残っており、次回は続きから再開します。',
          )
        } else if (result.plannedCount === 0) {
          setStatus('すべて保存済みです。')
        } else {
          setStatus(
            result.ok
              ? 'すべてのデータを保存しました。'
              : `${result.failedCount} 件のファイルを取得できませんでした。あとでもう一度お試しください。`,
          )
        }
      } finally {
        isDownloading = false
        downloadAbortController = null
        downloadAllButton.disabled = false
        if (cancelDownloadButton) {
          cancelDownloadButton.hidden = true
        }
        setDownloadProgress(0, 0, false)
        void renderCacheSizeLine()
      }
    })()
  })

  cancelDownloadButton?.addEventListener('click', () => {
    // 二度押し防止。ボタン自体はダウンロード終了処理(finally)で隠す
    cancelDownloadButton.disabled = true
    downloadAbortController?.abort()
  })

  // --- キャッシュ・初期化 ---------------------------------------------------

  clearCacheButton?.addEventListener('click', () => {
    void (async () => {
      clearCacheButton.disabled = true
      setStatus('キャッシュを削除しています...')
      await clearServiceWorkersAndCaches()
      // 解除したままだとオフライン起動できなくなるため、その場で登録し直す
      registerAppServiceWorker()
      setStatus('キャッシュをクリアしました。')
      clearCacheButton.disabled = false
      void renderCacheSizeLine()
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

  // --- 開閉 ----------------------------------------------------------------

  openButton.addEventListener('click', () => {
    setStatus('')
    renderNetworkState()
    dialog.showModal()
    // showModal は最初のフォーカス可能要素(×ボタン)へフォーカスを移し、
    // iOS でフォーカスリングが表示されてしまうため、ダイアログ自体へ移す。
    dialog.focus({ preventScroll: true })
    // 開くたびに最新情報へ更新する(結果メッセージは出さない)
    void runUpdateCheck(false)
    void renderCacheSizeLine()
  })
  closeButton?.addEventListener('click', () => {
    dialog.close()
  })
  // ダイアログの外(バックドロップ)をタップしたら閉じる。
  // 外側クリックは target がダイアログ自身になるため、座標が内容領域の
  // 外にあるときだけ閉じる(パディング部分のタップでは閉じない)。
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) {
      return
    }
    const rect = dialog.getBoundingClientRect()
    const isInsideDialog =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    if (!isInsideDialog) {
      dialog.close()
    }
  })

  // 起動時に一度だけ更新を確認し、あれば歯車にバッジを出す(適用はしない)。
  void runUpdateCheck(false)
}
