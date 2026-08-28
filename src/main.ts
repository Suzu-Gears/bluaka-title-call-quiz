import '@fontsource/kosugi-maru'

import fitty from 'fitty'

import { setupStudentGrid } from '@/cardList'
import {
  applyPendingAppUpdate,
  registerAppServiceWorker,
} from '@/lib/appUpdate'
import { setupAnalytics } from '@/lib/analytics'
import { resolveAssetUrl } from '@/lib/assetPath'
import {
  FINAL_DATA_SCHEMA_VERSION,
  type FinalData,
  type QuizEntry,
} from '@/lib/interfaces'
import { APP_ERROR_TEXT } from '@/lib/uiText'
import { setupQuiz } from '@/quiz'
import { isPwaMode, setupSettings } from '@/settings'
import './quizModeControl.css'
import './quizQuestionCountControl.css'
import './styles.css'

declare const __APP_VERSION__: string

let pageSwitchGuard: ((targetId: string) => boolean) | null = null

const setupPageSwitch = () => {
  const switchButtons =
    document.querySelectorAll<HTMLButtonElement>('[data-view-target]')
  const allViews = ['card-list', 'quiz-view']
  switchButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-view-target')
      if (!targetId) return
      if (pageSwitchGuard && !pageSwitchGuard(targetId)) {
        return
      }
      allViews.forEach((viewId) => {
        const view = document.getElementById(viewId)
        if (view) {
          view.hidden = viewId !== targetId
        }
      })
      switchButtons.forEach((switchButton) =>
        switchButton.classList.toggle('is-active', switchButton === button),
      )
    })
  })
}

/** タイトルは改行させず、設定アイコンが入りきらない幅では文字を縮める。 */
const setupTitleFit = () => {
  const title = document.getElementById('app-title')
  if (!title) return
  const maxSize = parseFloat(window.getComputedStyle(title).fontSize)
  const instance = fitty(title, { minSize: 12, maxSize, multiLine: false })

  // 初期化直後はレイアウトや Web フォント(Kosugi Maru)適用前の幅で
  // 計測されることがあり、そのままだとタイトルがヘッダーからはみ出す。
  // 描画確定後とフォント読み込み完了時に測り直して防ぐ。
  const refit = () => {
    instance.fit()
  }
  requestAnimationFrame(refit)
  window.setTimeout(refit, 300)
  window.addEventListener('load', refit)
  if ('fonts' in document) {
    void document.fonts.ready.then(() => {
      fitty.fitAll()
    })
    document.fonts.addEventListener('loadingdone', () => {
      fitty.fitAll()
    })
  }
}

const setFooterVersion = () => {
  const versionText = document.getElementById('footer-version')
  if (versionText) {
    versionText.textContent = `©2025 ブルアカタイトルコールクイズ ${__APP_VERSION__}`
  }
}

/**
 * 両方のビューより上にあるバナーへ出す。
 * 初期表示はカード一覧なので、クイズ画面の中に出すと誰にも見えない。
 */
const showAppError = (message: string) => {
  const banner = document.getElementById('app-error')
  if (banner) {
    banner.textContent = message
    banner.hidden = false
  }
}

const loadEntries = async (): Promise<QuizEntry[]> => {
  const response = await fetch(resolveAssetUrl('data/final.json'), {
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`final.json を取得できません (${response.status})`)
  }
  const data = (await response.json()) as Partial<FinalData>
  if (data?.schemaVersion !== FINAL_DATA_SCHEMA_VERSION) {
    throw new Error(
      `final.json のスキーマ版が想定と異なります (期待: ${FINAL_DATA_SCHEMA_VERSION}, 実際: ${String(data?.schemaVersion)})`,
    )
  }
  const entries = Array.isArray(data.entries) ? data.entries : []
  if (entries.length === 0) {
    throw new Error('final.json に生徒データが入っていません')
  }
  return entries
}

// iOS Safari では空の touchstart リスナーが存在しないと :active 疑似クラスが発火しない
document.addEventListener('touchstart', () => {}, { passive: true })

const bootstrap = async () => {
  // 通常のブラウザタブでは黙って自動更新する。
  // PWA(スタンドアロン)では設定画面からの手動更新+バッジ表示に切り替える。
  if (!isPwaMode()) {
    void applyPendingAppUpdate()
  } else {
    // PWA では SW が音声・画像のキャッシュ配信とオフライン起動を担う。
    // 通常のブラウザタブは従来どおり SW なしで動かす。
    registerAppServiceWorker()
  }
  setupAnalytics()
  setupSettings()
  setupTitleFit()
  setupPageSwitch()
  setFooterVersion()
  const entries = await loadEntries()
  setupStudentGrid(entries)
  setupQuiz(entries, (guard) => {
    pageSwitchGuard = guard
  })
}

bootstrap().catch((error: unknown) => {
  console.error(error)
  showAppError(APP_ERROR_TEXT.bootstrapFailed)
})
