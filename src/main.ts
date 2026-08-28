import '@/fonts.css'

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
import { isPwaMode, setupSettings } from '@/settings'
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
  // no-cache: サーバーの max-age=0, must-revalidate と合わせて鮮度は保ちつつ、
  // 再訪時は 304 で済むようにする(no-store だと毎回全量ダウンロードになる)。
  const response = await fetch(resolveAssetUrl('data/final.json'), {
    cache: 'no-cache',
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

  // クイズ関連コード(バンドルの過半)は初期表示に不要なので動的 import で分割し、
  // カード一覧の表示・操作をブロックしないようにする。
  let quizSetupPromise: Promise<void> | null = null
  const ensureQuizSetup = (): Promise<void> => {
    quizSetupPromise ??= import('@/quiz')
      .then(({ setupQuiz }) => {
        setupQuiz(entries, (guard) => {
          pageSwitchGuard = guard
        })
      })
      .catch((error: unknown) => {
        // 読み込み失敗(オフライン等)は次の操作で再試行できるようにする。
        quizSetupPromise = null
        console.error(error)
        showAppError(APP_ERROR_TEXT.bootstrapFailed)
      })
    return quizSetupPromise
  }

  // 挑戦状リンク('#c=' は quizShare の SHARED_QUIZ_HASH_KEY)で開かれた・
  // 貼り付けられたときは即座に初期化する(ハッシュの解釈は setupQuizShare が行う)。
  if (window.location.hash.startsWith('#c=')) {
    void ensureQuizSetup()
  }
  window.addEventListener('hashchange', () => {
    if (window.location.hash.startsWith('#c=')) {
      void ensureQuizSetup()
    }
  })
  // クイズタブが押されたら確実に、押されなくてもアイドル時に先読みしておく。
  document
    .querySelectorAll('[data-view-target="quiz-view"]')
    .forEach((button) =>
      button.addEventListener('click', () => void ensureQuizSetup(), {
        once: true,
      }),
    )
  // コアサブセットに無い文字用のフォールバックフォント定義も、
  // 初期表示を妨げないようアイドル時に読み込む。
  const prefetchDeferred = () => {
    void ensureQuizSetup()
    void import('@/fonts-fallback.css')
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(prefetchDeferred)
  } else {
    window.setTimeout(prefetchDeferred, 2000)
  }
}

bootstrap().catch((error: unknown) => {
  console.error(error)
  showAppError(APP_ERROR_TEXT.bootstrapFailed)
})
