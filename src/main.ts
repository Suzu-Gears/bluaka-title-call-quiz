import '@/fonts.css'

import fitty from 'fitty'

import { setupStudentGrid } from '@/cardList'
import { setupAnalytics } from '@/lib/analytics'
import {
  applyPendingAppUpdate,
  registerAppServiceWorker,
} from '@/lib/appUpdate'
import { resolveAssetUrl } from '@/lib/assetPath'
import { setupConsoleEasterEgg } from '@/lib/consoleEasterEgg'
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
const setupFontLoadRefit = () => {
  if (!('fonts' in document)) {
    return
  }
  void document.fonts.ready.then(() => {
    fitty.fitAll()
  })
  // Web フォント適用後の測り直しは1回で足りる。フォールバックフォントの
  // 遅延到着まで拾うと、そのたびに全要素の強制再計測が走ってしまう。
  document.fonts.addEventListener(
    'loadingdone',
    () => {
      fitty.fitAll()
    },
    { once: true },
  )
}

const setFooterVersion = () => {
  const versionText = document.getElementById('footer-version')
  if (versionText) {
    // 公開年から現在年までの範囲表記。年が変わっても手直し不要にする。
    const startYear = 2025
    const year = new Date().getFullYear()
    const yearLabel = year > startYear ? `${startYear}-${year}` : `${startYear}`
    versionText.textContent = `©${yearLabel} ブルアカタイトルコールクイズ ${__APP_VERSION__}`
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
  setupFontLoadRefit()
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

  // コアサブセットに無い文字(ユーザーが自作クイズや挑戦状に入力した文字)は
  // クイズ機能の中でしか表示されない。フォールバック定義を先に読み込むと
  // 該当スライスが遅れて届いて字形が差し替わり、レイアウトシフトになるため、
  // クイズ画面を実際に開くときまで読み込まない。
  let fallbackFontsPromise: Promise<unknown> | null = null
  const ensureFallbackFonts = (): Promise<unknown> => {
    fallbackFontsPromise ??= import('@/fonts-fallback.css')
    return fallbackFontsPromise
  }

  const enterQuiz = () => {
    void ensureQuizSetup()
    void ensureFallbackFonts()
    setupConsoleEasterEgg()
  }

  // オプション内の進捗ボタン(エクスポート等)はクイズモジュール側で配線される。
  // オプションを開いた時点で読み込みを始め、最初のクリックから効くようにする。
  document
    .getElementById('settings-open')
    ?.addEventListener('click', () => void ensureQuizSetup())

  // 挑戦状リンク('#c=' は quizShare の SHARED_QUIZ_HASH_KEY)で開かれた・
  // 貼り付けられたときは即座に初期化する(ハッシュの解釈は setupQuizShare が行う)。
  if (window.location.hash.startsWith('#c=')) {
    enterQuiz()
  }
  window.addEventListener('hashchange', () => {
    if (window.location.hash.startsWith('#c=')) {
      enterQuiz()
    }
  })
  document
    .querySelectorAll('[data-view-target="quiz-view"]')
    .forEach((button) =>
      button.addEventListener('click', enterQuiz, { once: true }),
    )

  // クイズのコードだけは、押されなくてもアイドル時に先読みしておく
  // (JS の読み込みは表示に影響しないのでシフトの原因にならない)。
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => void ensureQuizSetup())
  } else {
    window.setTimeout(() => void ensureQuizSetup(), 2000)
  }
}

bootstrap().catch((error: unknown) => {
  console.error(error)
  showAppError(APP_ERROR_TEXT.bootstrapFailed)
})
