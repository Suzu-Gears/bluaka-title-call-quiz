import '@fontsource/kosugi-maru'

import type { Student } from '@/lib/interfaces'
import { setupStudentGrid } from '@/cardList'
import { setupQuiz } from '@/quiz'
import './styles.css'

declare const __APP_VERSION__: string

let pageSwitchGuard: ((targetId: string) => boolean) | null = null

const setupPageSwitch = () => {
  const switchButtons = document.querySelectorAll<HTMLButtonElement>(
    '[data-view-target]',
  )
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

const bootstrap = async () => {
  const hasAudioFile = async (studentName: string) => {
    try {
      const response = await fetch(`/audio/${encodeURIComponent(studentName)}.mp3`, {
        method: 'HEAD',
      })
      const contentType = response.headers.get('content-type') ?? ''
      return response.ok && contentType.startsWith('audio/')
    } catch {
      return false
    }
  }

  setupPageSwitch()
  setFooterVersion()
  const response = await fetch('/data/final.json', { cache: 'no-store' })
  const students = (await response.json()) as Student[]
  const audioAvailability = await Promise.all(
    students.map(async ({ Name }) => ({
      name: Name,
      hasAudio: await hasAudioFile(Name),
    })),
  )
  const unavailableAudioNames = new Set(
    audioAvailability
      .filter(({ hasAudio }) => !hasAudio)
      .map(({ name }) => name),
  )
  setupStudentGrid(students, unavailableAudioNames)
  setupQuiz(
    students.filter(({ Name }) => !unavailableAudioNames.has(Name)),
    (guard) => { pageSwitchGuard = guard },
  )
}

bootstrap().catch(() => {
  const status = document.getElementById('quiz-status')
  if (status) {
    status.textContent =
      'データの読み込みに失敗しました。ページを再読み込みしてください。'
  }
})
