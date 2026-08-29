import { showCopyFeedback } from '@/lib/copyFeedback'
import {
  buildProgressExport,
  countProficiencyRecords,
  parseProgressExport,
  pickNewerSide,
  serializeProgressExport,
} from '@/lib/progressTransfer'
import type { ProficiencyMap } from '@/lib/quizProgress'
import { readStorage, writeStorage } from '@/lib/safeStorage'
import {
  fetchRemoteProgress,
  getCustomSyncEndpoint,
  isSyncEnabled,
  isValidSyncCode,
  isValidSyncEndpointUrl,
  pushRemoteProgress,
  requestNewSyncCode,
  setCustomSyncEndpoint,
} from '@/lib/syncClient'
import { closeOnBackdropClick } from '@/lib/uiState'
import {
  formatImportSucceeded,
  formatSyncDownloaded,
  PROGRESS_UI_TEXT,
  SYNC_UI_TEXT,
} from '@/lib/uiText'

export const SYNC_CODE_STORAGE_KEY = 'bluaka-title-call-quiz2.syncCode.v1'
export const PROGRESS_UPDATED_AT_STORAGE_KEY =
  'bluaka-title-call-quiz2.proficiencyUpdatedAt.v1'

export interface ProgressPanelParams {
  getProficiency: () => ProficiencyMap
  /** 取り込んだ進捗で置き換える。保存と画面反映は呼び出し側の責任。 */
  replaceProficiency: (map: ProficiencyMap) => void
  onOpen?: () => void
}

export interface ProgressPanel {
  /** 起動時にクラウド側が新しければ取り込みを提案する。 */
  pullOnStartup: () => Promise<void>
  /** クイズ終了時などにクラウドへ保存する(失敗しても黙って続行)。 */
  pushInBackground: () => void
}

const noopPanel: ProgressPanel = {
  pullOnStartup: async () => {},
  pushInBackground: () => {},
}

export const setupProgressPanel = (
  params: ProgressPanelParams,
): ProgressPanel => {
  const exportButton = document.getElementById(
    'quiz-export-progress-button',
  ) as HTMLButtonElement | null
  const importButton = document.getElementById(
    'quiz-import-progress-button',
  ) as HTMLButtonElement | null
  const syncButton = document.getElementById(
    'quiz-sync-button',
  ) as HTMLButtonElement | null

  const dialog = document.getElementById(
    'progress-dialog',
  ) as HTMLDialogElement | null
  const dialogTitle = document.getElementById('progress-dialog-title')
  const dialogDescription = document.getElementById(
    'progress-dialog-description',
  )
  const textarea = document.getElementById(
    'progress-dialog-textarea',
  ) as HTMLTextAreaElement | null
  const dialogStatus = document.getElementById('progress-dialog-status')
  const fileInput = document.getElementById(
    'progress-dialog-file',
  ) as HTMLInputElement | null
  const fileButton = document.getElementById(
    'progress-dialog-file-button',
  ) as HTMLButtonElement | null
  const copyButton = document.getElementById(
    'progress-dialog-copy-button',
  ) as HTMLButtonElement | null
  const downloadButton = document.getElementById(
    'progress-dialog-download-button',
  ) as HTMLButtonElement | null
  const applyButton = document.getElementById(
    'progress-dialog-apply-button',
  ) as HTMLButtonElement | null
  const closeButton = document.getElementById(
    'progress-dialog-close-button',
  ) as HTMLButtonElement | null

  if (!dialog || !textarea) {
    return noopPanel
  }

  const setStatus = (element: HTMLElement | null, message: string) => {
    if (element) {
      element.textContent = message
    }
  }

  const getUpdatedAt = () => readStorage(PROGRESS_UPDATED_AT_STORAGE_KEY)
  const markUpdated = () => {
    writeStorage(PROGRESS_UPDATED_AT_STORAGE_KEY, new Date().toISOString())
  }

  const openDialog = (mode: 'export' | 'import') => {
    params.onOpen?.()
    setStatus(dialogStatus, '')
    const isExport = mode === 'export'
    if (dialogTitle) {
      dialogTitle.textContent = isExport
        ? PROGRESS_UI_TEXT.exportTitle
        : PROGRESS_UI_TEXT.importTitle
    }
    if (dialogDescription) {
      dialogDescription.textContent = isExport
        ? PROGRESS_UI_TEXT.exportDescription
        : PROGRESS_UI_TEXT.importDescription
    }
    textarea.readOnly = isExport
    textarea.value = isExport
      ? serializeProgressExport(
          buildProgressExport(
            params.getProficiency(),
            new Date().toISOString(),
          ),
        )
      : ''
    if (copyButton) copyButton.hidden = !isExport
    if (downloadButton) downloadButton.hidden = !isExport
    if (applyButton) applyButton.hidden = isExport
    if (fileButton) fileButton.hidden = isExport
    dialog.showModal()
    // ボタンへの自動フォーカスで iOS にリングが出ないよう、ダイアログ自体へ移す
    dialog.focus({ preventScroll: true })
    if (!isExport) {
      textarea.focus()
    }
  }

  exportButton?.addEventListener('click', () => openDialog('export'))
  importButton?.addEventListener('click', () => openDialog('import'))
  closeButton?.addEventListener('click', () => dialog.close())
  closeOnBackdropClick(dialog)

  copyButton?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(textarea.value)
      setStatus(dialogStatus, '')
      showCopyFeedback(copyButton)
    } catch {
      textarea.select()
      setStatus(dialogStatus, PROGRESS_UI_TEXT.copyFailed)
    }
  })

  downloadButton?.addEventListener('click', () => {
    const blob = new Blob([textarea.value], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `bluaka-title-call-quiz-progress-${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setStatus(dialogStatus, PROGRESS_UI_TEXT.downloaded)
  })

  fileButton?.addEventListener('click', () => fileInput?.click())
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    try {
      textarea.value = await file.text()
      setStatus(dialogStatus, '')
    } catch {
      setStatus(dialogStatus, PROGRESS_UI_TEXT.fileReadFailed)
    }
    fileInput.value = ''
  })

  applyButton?.addEventListener('click', () => {
    const parsed = parseProgressExport(textarea.value)
    if (!parsed) {
      setStatus(dialogStatus, PROGRESS_UI_TEXT.importFailedParse)
      return
    }
    const count = countProficiencyRecords(parsed)
    if (count === 0) {
      setStatus(dialogStatus, PROGRESS_UI_TEXT.importFailedEmpty)
      return
    }
    if (!window.confirm(PROGRESS_UI_TEXT.importConfirm)) {
      return
    }
    params.replaceProficiency(parsed)
    markUpdated()
    setStatus(dialogStatus, formatImportSucceeded(count))
  })

  // --- ここから下はクラウド同期。既定エンドポイントが無くても、
  //     利用者が自分の保存先URLを設定できるように UI は常に出す ---
  if (!syncButton) {
    return noopPanel
  }

  const syncDialog = document.getElementById(
    'sync-dialog',
  ) as HTMLDialogElement | null
  const syncCodeInput = document.getElementById(
    'sync-code-input',
  ) as HTMLInputElement | null
  const syncEndpointInput = document.getElementById(
    'sync-endpoint-input',
  ) as HTMLInputElement | null
  const syncStatus = document.getElementById('sync-dialog-status')
  const generateButton = document.getElementById(
    'sync-generate-button',
  ) as HTMLButtonElement | null
  const uploadButton = document.getElementById(
    'sync-upload-button',
  ) as HTMLButtonElement | null
  const downloadRemoteButton = document.getElementById(
    'sync-download-button',
  ) as HTMLButtonElement | null
  const syncCloseButton = document.getElementById(
    'sync-close-button',
  ) as HTMLButtonElement | null
  const syncCodeForm = document.getElementById(
    'sync-code-form',
  ) as HTMLFormElement | null
  const syncCodeToggle = document.getElementById(
    'sync-code-toggle',
  ) as HTMLButtonElement | null

  if (!syncDialog || !syncCodeInput) {
    return noopPanel
  }

  syncButton.hidden = false

  const getSyncCode = () => readStorage(SYNC_CODE_STORAGE_KEY) ?? ''
  const storeSyncCode = (code: string) => {
    writeStorage(SYNC_CODE_STORAGE_KEY, code.trim())
  }

  syncButton.addEventListener('click', () => {
    params.onOpen?.()
    const code = getSyncCode()
    syncCodeInput.value = code
    if (syncEndpointInput) {
      syncEndpointInput.value = getCustomSyncEndpoint()
    }
    setStatus(syncStatus, code ? '' : SYNC_UI_TEXT.noCode)
    syncDialog.showModal()
    syncDialog.focus({ preventScroll: true })
  })
  syncCloseButton?.addEventListener('click', () => syncDialog.close())
  closeOnBackdropClick(syncDialog)

  syncEndpointInput?.addEventListener('change', () => {
    const url = syncEndpointInput.value.trim()
    if (!url) {
      setCustomSyncEndpoint('')
      setStatus(syncStatus, SYNC_UI_TEXT.endpointCleared)
      return
    }
    if (!isValidSyncEndpointUrl(url)) {
      setStatus(syncStatus, SYNC_UI_TEXT.invalidEndpoint)
      return
    }
    setCustomSyncEndpoint(url)
    setStatus(syncStatus, SYNC_UI_TEXT.endpointSaved)
  })

  generateButton?.addEventListener('click', async () => {
    if (!isSyncEnabled()) {
      setStatus(syncStatus, SYNC_UI_TEXT.noEndpoint)
      return
    }
    generateButton.disabled = true
    setStatus(syncStatus, SYNC_UI_TEXT.generating)
    try {
      const code = await requestNewSyncCode()
      syncCodeInput.value = code
      storeSyncCode(code)
      setStatus(syncStatus, SYNC_UI_TEXT.generated)
      offerToPasswordManager(code)
    } catch {
      setStatus(syncStatus, SYNC_UI_TEXT.failed)
    } finally {
      generateButton.disabled = false
    }
  })

  syncCodeInput.addEventListener('change', () => {
    const code = syncCodeInput.value.trim()
    if (code && !isValidSyncCode(code)) {
      setStatus(syncStatus, SYNC_UI_TEXT.invalidCode)
      return
    }
    storeSyncCode(code)
    setStatus(syncStatus, '')
  })

  // Chrome/Edge にはパスワードとして保存を明示的に促す(Safari は form の
  // submit を検知して保存を提案するため、こちらは黙って失敗してよい)。
  const offerToPasswordManager = (code: string) => {
    const PasswordCredential = (
      window as unknown as {
        PasswordCredential?: new (init: {
          id: string
          password: string
          name?: string
        }) => Credential
      }
    ).PasswordCredential
    if (!PasswordCredential || !navigator.credentials?.store) {
      return
    }
    navigator.credentials
      .store(
        new PasswordCredential({
          id: '同期コード',
          password: code,
          name: 'ブルアカタイトルコールクイズ',
        }),
      )
      .catch(() => {})
  }

  // Enter キーや保存操作での submit をパスワードマネージャーの保存契機にする。
  syncCodeForm?.addEventListener('submit', (event) => {
    event.preventDefault()
    const code = syncCodeInput.value.trim()
    if (code && !isValidSyncCode(code)) {
      setStatus(syncStatus, SYNC_UI_TEXT.invalidCode)
      return
    }
    storeSyncCode(code)
    if (code) {
      offerToPasswordManager(code)
    }
  })

  syncCodeToggle?.addEventListener('click', () => {
    const show = syncCodeInput.type === 'password'
    syncCodeInput.type = show ? 'text' : 'password'
    syncCodeToggle.textContent = show ? '隠す' : '表示'
    syncCodeToggle.setAttribute(
      'aria-label',
      show ? '同期コードを隠す' : '同期コードを表示',
    )
  })

  const upload = async (silent: boolean) => {
    if (!isSyncEnabled()) {
      if (!silent) setStatus(syncStatus, SYNC_UI_TEXT.noEndpoint)
      return
    }
    const code = getSyncCode()
    if (!isValidSyncCode(code)) {
      if (!silent) setStatus(syncStatus, SYNC_UI_TEXT.noCode)
      return
    }
    if (!silent) setStatus(syncStatus, SYNC_UI_TEXT.uploading)
    try {
      const updatedAt = new Date().toISOString()
      await pushRemoteProgress(code, {
        updatedAt,
        proficiency: params.getProficiency(),
      })
      writeStorage(PROGRESS_UPDATED_AT_STORAGE_KEY, updatedAt)
      if (!silent) setStatus(syncStatus, SYNC_UI_TEXT.uploaded)
    } catch {
      if (!silent) setStatus(syncStatus, SYNC_UI_TEXT.failed)
    }
  }

  const download = async (interactive: boolean) => {
    if (!isSyncEnabled()) {
      if (interactive) setStatus(syncStatus, SYNC_UI_TEXT.noEndpoint)
      return
    }
    const code = getSyncCode()
    if (!isValidSyncCode(code)) {
      if (interactive) setStatus(syncStatus, SYNC_UI_TEXT.noCode)
      return
    }
    if (interactive) setStatus(syncStatus, SYNC_UI_TEXT.downloading)
    try {
      const payload = await fetchRemoteProgress(code)
      if (!payload) {
        if (interactive) setStatus(syncStatus, SYNC_UI_TEXT.downloadEmpty)
        return
      }
      if (
        !interactive &&
        pickNewerSide(getUpdatedAt(), payload.updatedAt) === 'local'
      ) {
        return
      }
      if (!window.confirm(SYNC_UI_TEXT.downloadConfirm)) {
        return
      }
      params.replaceProficiency(payload.proficiency)
      writeStorage(PROGRESS_UPDATED_AT_STORAGE_KEY, payload.updatedAt)
      if (interactive) {
        setStatus(syncStatus, formatSyncDownloaded(payload.updatedAt))
      }
    } catch {
      if (interactive) setStatus(syncStatus, SYNC_UI_TEXT.failed)
    }
  }

  uploadButton?.addEventListener('click', () => {
    void upload(false)
  })
  downloadRemoteButton?.addEventListener('click', () => {
    void download(true)
  })

  return {
    pullOnStartup: () => download(false),
    pushInBackground: () => {
      void upload(true)
    },
  }
}
