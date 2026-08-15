import '@fontsource/kosugi-maru'

import { setupStudentGrid } from '@/cardList'
import { resolveAssetUrl } from '@/lib/assetPath'
import {
  FINAL_DATA_SCHEMA_VERSION,
  type FinalData,
  type QuizEntry,
} from '@/lib/interfaces'
import { APP_ERROR_TEXT } from '@/lib/uiText'
import { setupQuiz } from '@/quiz'
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
