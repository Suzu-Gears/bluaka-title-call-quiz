import '@fontsource/kosugi-maru'
import './styles.css'

import type { Student } from '@/lib/interfaces'
import { normalizeQuizAnswer, resolveStudentCategory } from '@/lib/quizProgress'

declare const __APP_VERSION__: string

const DEFAULT_IMAGE = '/default-student-image.webp'
const STORAGE_KEY = 'bluaka-title-call-quiz2.proficiency.v1'
const LEGACY_STORAGE_KEYS = [
  'bluaka-title-call-quiz.proficiency.v1',
  'bluaka-title-call-quiz.proficiency',
  'quizProficiency',
]

const setupPageSwitch = () => {
  const switchButtons = document.querySelectorAll<HTMLButtonElement>('[data-view-target]')
  const allViews = ['card-list', 'quiz-view']
  switchButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-view-target')
      if (!targetId) return
      allViews.forEach((viewId) => {
        const view = document.getElementById(viewId)
        if (view) view.hidden = viewId !== targetId
      })
      switchButtons.forEach((switchButton) =>
        switchButton.classList.toggle('is-active', switchButton === button),
      )
    })
  })
}

const createCard = (student: Student) => {
  const item = document.createElement('div')
  item.className = 'grid-item'
  item.tabIndex = 0
  item.dataset.name = student.Name
  item.dataset.nameKey = normalizeQuizAnswer(student.Name)
  item.dataset.filterCategory = resolveStudentCategory(student.Costume, student.IsCollaboration)
  item.dataset.defaultOrder = String(student.DefaultOrder ?? 0)
  item.dataset.nameSortOrder = String(student.NameSortOrder ?? student.DefaultOrder ?? 0)
  item.innerHTML = `
    <div class="image-container">
      <img loading="lazy" src="/image/${encodeURIComponent(student.Name)}.webp" alt="${student.Name}" />
      <div class="voice-actor-container"><div class="voice-actor">CV.${student.CharacterVoice}</div></div>
    </div>
    <div class="name-container"><div class="name">${student.Name}</div></div>
  `
  const image = item.querySelector('img')
  if (image) {
    image.onerror = () => {
      image.src = DEFAULT_IMAGE
    }
  }
  return item
}

const setupStudentGrid = (students: Student[]) => {
  const grid = document.getElementById('studentGrid')
  if (!grid) return
  students
    .slice()
    .sort((a, b) => (a.DefaultOrder ?? 0) - (b.DefaultOrder ?? 0))
    .forEach((student) => grid.appendChild(createCard(student)))

  const sortSelect = document.getElementById('student-sort-select') as HTMLSelectElement | null
  const filterInput = document.getElementById('student-filter-input') as HTMLInputElement | null
  const normalFilter = document.getElementById('student-filter-normal') as HTMLInputElement | null
  const costumeFilter = document.getElementById('student-filter-costume') as HTMLInputElement | null
  const collaborationFilter = document.getElementById('student-filter-collaboration') as HTMLInputElement | null
  const sortDirectionButton = document.getElementById('student-sort-direction') as HTMLButtonElement | null
  let sortDirection: 'asc' | 'desc' = 'asc'

  const sortCards = (sortMode: string, direction: 'asc' | 'desc') => {
    const cards = [...grid.querySelectorAll<HTMLElement>('.grid-item')]
    const key = sortMode === 'name-order' ? 'nameSortOrder' : 'defaultOrder'
    cards.sort((a, b) => {
      const aValue = Number(a.dataset[key] ?? 0)
      const bValue = Number(b.dataset[key] ?? 0)
      return direction === 'asc' ? aValue - bValue : bValue - aValue
    })
    cards.forEach((card) => grid.appendChild(card))
  }

  const filterCards = (input: string) => {
    const normalized = normalizeQuizAnswer(input)
    grid.querySelectorAll<HTMLElement>('.grid-item').forEach((card) => {
      const category = card.dataset.filterCategory
      const categoryEnabled =
        (category === 'normal' && Boolean(normalFilter?.checked)) ||
        (category === 'costume' && Boolean(costumeFilter?.checked)) ||
        (category === 'collaboration' && Boolean(collaborationFilter?.checked))
      const nameKey = String(card.dataset.nameKey ?? '')
      card.style.display = (!normalized || nameKey.includes(normalized)) && categoryEnabled ? '' : 'none'
    })
  }

  sortSelect?.addEventListener('change', () => sortCards(sortSelect.value, sortDirection))
  sortDirectionButton?.addEventListener('click', () => {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'
    sortDirectionButton.textContent = sortDirection === 'asc' ? '昇順' : '降順'
    if (sortSelect) sortCards(sortSelect.value, sortDirection)
  })
  filterInput?.addEventListener('input', () => filterCards(filterInput.value))
  ;[normalFilter, costumeFilter, collaborationFilter].forEach((checkbox) =>
    checkbox?.addEventListener('change', () => filterCards(filterInput?.value ?? '')),
  )
}

const setupQuiz = (students: Student[]) => {
  const names = students.map((student) => student.Name)
  const status = document.getElementById('quiz-status')
  const start = document.getElementById('quiz-start-button')
  const next = document.getElementById('quiz-next-button') as HTMLButtonElement | null
  const replay = document.getElementById('quiz-play-audio-button') as HTMLButtonElement | null
  const choicesRoot = document.getElementById('quiz-choices')
  if (!status || !start || !next || !replay || !choicesRoot) return

  let answer = ''
  let score = 0
  let asked: string[] = []
  let audio: HTMLAudioElement | null = null
  let hasAnsweredCurrentQuestion = false
  const readMap = (): Record<string, { correct: number; attempts: number }> => {
    for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      try {
        const data = JSON.parse(raw)
        const normalized = Object.fromEntries(
          Object.entries(data).flatMap(([name, value]) => {
            if (typeof value === 'number') return [[name, { correct: value, attempts: value }]]
            if (typeof value === 'object' && value && 'correct' in value && 'attempts' in value) {
              return [[name, { correct: Number(value.correct) || 0, attempts: Number(value.attempts) || 0 }]]
            }
            return []
          }),
        )
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
        return normalized
      } catch {
        continue
      }
    }
    return {}
  }
  const proficiency = readMap()

  const play = (name: string) => {
    audio?.pause()
    audio = new Audio(`/audio/${encodeURIComponent(name)}.mp3`)
    audio.play().catch(() => {
      status.textContent = '音声を再生できませんでした。'
    })
  }

  const render = () => {
    choicesRoot.innerHTML = ''
    hasAnsweredCurrentQuestion = false
    const available = names.filter((name) => !asked.includes(name))
    if (available.length === 0) {
      status.textContent = `終了！${score} / ${asked.length} 問正解`
      next.disabled = true
      replay.disabled = true
      return
    }
    answer = available[Math.floor(Math.random() * available.length)]
    asked.push(answer)
    status.textContent = `第${asked.length}問: このタイトルコールは誰？`
    replay.disabled = false
    next.disabled = true
    play(answer)
    const shuffle = <T>(values: T[]) => {
      const next = [...values]
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[next[i], next[j]] = [next[j], next[i]]
      }
      return next
    }
    const choices = shuffle([
      answer,
      ...shuffle(available.filter((name) => name !== answer)).slice(0, 3),
    ])
    choices.forEach((name) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'quiz-choice-button'
      button.textContent = name
      button.addEventListener('click', () => {
        if (hasAnsweredCurrentQuestion) {
          play(name)
          return
        }
        hasAnsweredCurrentQuestion = true
        const isCorrect = name === answer
        const entry = proficiency[answer] ?? { correct: 0, attempts: 0 }
        entry.attempts += 1
        if (isCorrect) {
          entry.correct += 1
          score += 1
          status.textContent = '正解！'
        } else {
          status.textContent = `不正解… 正解は「${answer}」`
        }
        proficiency[answer] = entry
        localStorage.setItem(STORAGE_KEY, JSON.stringify(proficiency))
        next.disabled = false
        choicesRoot.querySelectorAll<HTMLButtonElement>('button').forEach((choiceButton) => {
          if (choiceButton.textContent === answer) {
            choiceButton.classList.add('correct')
          }
        })
      })
      choicesRoot.appendChild(button)
    })
  }

  start.addEventListener('click', () => {
    asked = []
    score = 0
    render()
  })
  next.addEventListener('click', render)
  replay.addEventListener('click', () => {
    if (answer) play(answer)
  })
}

const setFooterVersion = () => {
  const versionText = document.getElementById('footer-version')
  if (versionText) {
    versionText.textContent = `©2025 ブルアカタイトルコールクイズ ${__APP_VERSION__}`
  }
}

const bootstrap = async () => {
  setupPageSwitch()
  setFooterVersion()
  const response = await fetch('/data/final.json', { cache: 'no-store' })
  const students = (await response.json()) as Student[]
  setupStudentGrid(students)
  setupQuiz(students)
}

bootstrap().catch(() => {
  const status = document.getElementById('quiz-status')
  if (status) {
    status.textContent = 'データの読み込みに失敗しました。'
  }
})
