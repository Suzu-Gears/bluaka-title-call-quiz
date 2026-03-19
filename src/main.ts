import '@fontsource/kosugi-maru'
import fitty, { type FittyInstance } from 'fitty'

import type { Student } from '@/lib/interfaces'
import {
  summarizeQuizResults,
  filterCandidates,
  normalizeQuizAnswer,
  buildNameInputSuggestions,
  resolveQuestionCount,
  resolveStudentCategory,
} from '@/lib/quizProgress'
import './styles.css'

declare const __APP_VERSION__: string

const DEFAULT_IMAGE = '/default-student-image.webp'
const QUIZ_MODE_MULTIPLE_CHOICE = 'multiple-choice'
const QUIZ_MODE_NAME_INPUT = 'name-input'
const QUIZ_MODE_NAME_INPUT_LUNATIC = 'name-input-lunatic'
const DEFAULT_QUESTION_COUNT = 10
const INITIAL_STATUS_TEXT = '「開始」を押すとクイズを開始します。'
const STORAGE_KEY = 'bluaka-title-call-quiz2.proficiency.v1'
const LEGACY_STORAGE_KEYS = [
  'bluaka-title-call-quiz.proficiency.v1',
  'bluaka-title-call-quiz.proficiency',
  'quizProficiency',
]

type CandidateGroups = {
  normal: string[]
  costume: string[]
  collaboration: string[]
}

type ProficiencyMap = Record<string, { correct: number; attempts: number }>
type QuizResultEntry = {
  questionNumber: number
  correctAnswer: string
  userAnswer: string
  isCorrect: boolean
}

let pageSwitchGuard: ((targetId: string) => boolean) | null = null

const setPageSwitchGuard = (guard: ((targetId: string) => boolean) | null) => {
  pageSwitchGuard = guard
}

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

const createCard = (student: Student, hasAudio: boolean) => {
  const item = document.createElement('div')
  item.className = 'grid-item'
  item.tabIndex = 0
  item.dataset.name = student.Name
  item.dataset.nameKey = normalizeQuizAnswer(student.Name)
  item.dataset.filterCategory = resolveStudentCategory(
    student.Costume,
    student.IsCollaboration,
  )
  item.dataset.defaultOrder = String(student.DefaultOrder ?? 0)
  item.dataset.nameSortOrder = String(student.NameSortOrder ?? student.DefaultOrder ?? 0)

  const imageContainer = document.createElement('div')
  imageContainer.className = 'image-container'
  const image = document.createElement('img')
  image.loading = 'lazy'
  image.src = `/image/${encodeURIComponent(student.Name)}.webp`
  image.alt = student.Name
  image.onerror = () => {
    image.src = DEFAULT_IMAGE
  }
  const voiceActorContainer = document.createElement('div')
  voiceActorContainer.className = 'voice-actor-container'
  const voiceActor = document.createElement('div')
  voiceActor.className = 'voice-actor'
  voiceActor.textContent = `\u00A0\u00A0CV.${student.CharacterVoice}\u00A0\u00A0`
  voiceActorContainer.appendChild(voiceActor)
  imageContainer.append(image, voiceActorContainer)

  const nameContainer = document.createElement('div')
  nameContainer.className = 'name-container'
  item.dataset.hasAudio = String(hasAudio)
  const nameNode = document.createElement('div')
  nameNode.className = 'name'
  const baseNameLabel = student.Name.includes('（')
    ? `\u00A0${student.Name}`
    : `\u00A0${student.Name}\u00A0`
  nameNode.textContent = hasAudio ? baseNameLabel : `${baseNameLabel} 🔇`
  nameContainer.appendChild(nameNode)

  item.append(imageContainer, nameContainer)
  return item
}

const setupFitty = () => {
  const getFontSize = (selector: string): number => {
    const element = document.querySelector(selector)
    if (element) {
      const style = window.getComputedStyle(element)
      return parseFloat(style.fontSize)
    }
    return 16
  }
  const selectors = ['.name', '.voice-actor']
  return selectors.map((selector) =>
    fitty(selector, {
      minSize: 8,
      maxSize: getFontSize(selector),
      multiLine: false,
    }),
  )
}

const setupStudentGrid = (students: Student[], unavailableAudioNames: Set<string>) => {
  const grid = document.getElementById('studentGrid')
  if (!grid) return

  students
    .slice()
    .sort((a, b) => (a.DefaultOrder ?? 0) - (b.DefaultOrder ?? 0))
    .forEach((student) =>
      grid.appendChild(createCard(student, !unavailableAudioNames.has(student.Name))),
    )

  const sortSelect = document.getElementById(
    'student-sort-select',
  ) as HTMLSelectElement | null
  const filterInput = document.getElementById(
    'student-filter-input',
  ) as HTMLInputElement | null
  const normalFilter = document.getElementById(
    'student-filter-normal',
  ) as HTMLInputElement | null
  const costumeFilter = document.getElementById(
    'student-filter-costume',
  ) as HTMLInputElement | null
  const collaborationFilter = document.getElementById(
    'student-filter-collaboration',
  ) as HTMLInputElement | null
  const sortDirectionButton = document.getElementById(
    'student-sort-direction',
  ) as HTMLButtonElement | null

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
      card.style.display = (!normalized || nameKey.includes(normalized)) && categoryEnabled
        ? ''
        : 'none'
    })
  }

  sortSelect?.addEventListener('change', () => sortCards(sortSelect.value, sortDirection))
  sortDirectionButton?.addEventListener('click', () => {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'
    sortDirectionButton.textContent = sortDirection === 'asc' ? '昇順' : '降順'
    if (sortSelect) {
      sortCards(sortSelect.value, sortDirection)
    }
  })
  filterInput?.addEventListener('input', () => filterCards(filterInput.value))
  ;[normalFilter, costumeFilter, collaborationFilter].forEach((checkbox) => {
    checkbox?.addEventListener('change', () => filterCards(filterInput?.value ?? ''))
  })

  let fittyInstances: FittyInstance[] = setupFitty()
  let devicePixelRatio = window.devicePixelRatio
  window.addEventListener('resize', () => {
    if (window.devicePixelRatio !== devicePixelRatio) {
      devicePixelRatio = window.devicePixelRatio
      fittyInstances.forEach((instance) => instance.unsubscribe())
      fittyInstances = setupFitty()
    }
  })

  let sharedAudioPlayer: HTMLAudioElement | null = document.createElement('audio')
  let currentlyPlayingName: string | null = null
  sharedAudioPlayer.hidden = true
  document.body.appendChild(sharedAudioPlayer)

  const resetAudio = () => {
    if (!sharedAudioPlayer || !currentlyPlayingName) return
    sharedAudioPlayer.pause()
    sharedAudioPlayer.currentTime = 0
    const image = document.querySelector(
      `.grid-item[data-name="${currentlyPlayingName}"] img`,
    )
    image?.classList.remove('playing')
    currentlyPlayingName = null
  }

  const playAudio = (name: string) => {
    if (!sharedAudioPlayer) return
    const gridItem = document.querySelector(`.grid-item[data-name="${name}"]`)
    if (!gridItem) return
    if (gridItem instanceof HTMLElement && gridItem.dataset.hasAudio === 'false') {
      return
    }
    const image = gridItem.querySelector('img')
    if (currentlyPlayingName) {
      resetAudio()
    }
    currentlyPlayingName = name
    sharedAudioPlayer.src = `/audio/${name}.mp3`
    sharedAudioPlayer.currentTime = 0
    sharedAudioPlayer.load()
    const playPromise = sharedAudioPlayer.play()
    if (playPromise !== undefined) {
      playPromise
        .then(() => image?.classList.add('playing'))
        .catch(() => resetAudio())
    }
  }

  grid.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    const card = target.closest('.grid-item') as HTMLElement | null
    const name = card?.dataset.name
    if (name) {
      playAudio(name)
    }
  })

  grid.addEventListener('keydown', (event) => {
    const keyboardEvent = event as KeyboardEvent
    if (keyboardEvent.key !== 'Enter') return
    const target = keyboardEvent.target as HTMLElement | null
    if (!target) return
    const card = target.closest('.grid-item') as HTMLElement | null
    const name = card?.dataset.name
    if (name) {
      playAudio(name)
    }
  })

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (!target.closest('.grid-item') && currentlyPlayingName) {
      resetAudio()
    }
  })
  sharedAudioPlayer.addEventListener('ended', resetAudio)
}

const setupQuiz = (students: Student[]) => {
  const baseCandidates = students.map(({ Name, Costume, IsCollaboration }) => ({
    name: Name,
    costume: Costume ?? '',
    isCollaboration: Boolean(IsCollaboration),
  }))
  const candidateGroups: CandidateGroups = {
    normal: filterCandidates(baseCandidates, {
      includeNormal: true,
      includeCostume: false,
      includeCollaboration: false,
    }).map(({ name }) => name),
    costume: filterCandidates(baseCandidates, {
      includeNormal: false,
      includeCostume: true,
      includeCollaboration: false,
    }).map(({ name }) => name),
    collaboration: filterCandidates(baseCandidates, {
      includeNormal: false,
      includeCostume: false,
      includeCollaboration: true,
    }).map(({ name }) => name),
  }
  const costumeHints = Object.fromEntries(
    baseCandidates.map(({ name, costume }) => [name, costume]),
  )

  const quizModeSelect = document.getElementById(
    'quiz-mode-select',
  ) as HTMLSelectElement | null
  const normalFilter = document.getElementById(
    'quiz-filter-normal',
  ) as HTMLInputElement | null
  const costumeFilter = document.getElementById(
    'quiz-filter-costume',
  ) as HTMLInputElement | null
  const collaborationFilter = document.getElementById(
    'quiz-filter-collaboration',
  ) as HTMLInputElement | null
  const questionCountPreset = document.getElementById(
    'quiz-question-count-preset',
  ) as HTMLSelectElement | null
  const questionCountCustom = document.getElementById(
    'quiz-question-count-custom',
  ) as HTMLInputElement | null
  const setupControls = document.getElementById('quiz-setup-controls')
  const menuButton = document.getElementById(
    'quiz-menu-button',
  ) as HTMLButtonElement | null
  const menuPanel = document.getElementById('quiz-menu-panel')
  const menuRestartButton = document.getElementById(
    'quiz-menu-restart-button',
  ) as HTMLButtonElement | null
  const menuResetScreenButton = document.getElementById(
    'quiz-menu-reset-screen-button',
  ) as HTMLButtonElement | null

  const startButton = document.getElementById(
    'quiz-start-button',
  ) as HTMLButtonElement | null
  const nextButton = document.getElementById(
    'quiz-next-button',
  ) as HTMLButtonElement | null
  const replayButton = document.getElementById(
    'quiz-play-audio-button',
  ) as HTMLButtonElement | null
  const resultActions = document.getElementById('quiz-result-actions')
  const resultRestartButton = document.getElementById(
    'quiz-result-restart-button',
  ) as HTMLButtonElement | null
  const resultBackButton = document.getElementById(
    'quiz-result-back-button',
  ) as HTMLButtonElement | null
  const statusText = document.getElementById('quiz-status')
  const proficiencyText = document.getElementById('quiz-proficiency-text')
  const costumeHintText = document.getElementById('quiz-costume-hint-text')
  const choicesRoot = document.getElementById('quiz-choices')
  const nameAnswerForm = document.getElementById(
    'quiz-name-answer-form',
  ) as HTMLFormElement | null
  const nameAnswerInput = document.getElementById(
    'quiz-name-answer-input',
  ) as HTMLInputElement | null
  const nameAnswerSuggestions = document.getElementById('quiz-name-answer-suggestions')
  const nameAnswerSubmit = nameAnswerForm?.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  )
  const answerFeedback = document.getElementById('quiz-answer-feedback')
  const answerImage = document.getElementById(
    'quiz-answer-image',
  ) as HTMLImageElement | null
  const answerName = document.getElementById('quiz-answer-name')
  const resultSection = document.getElementById('quiz-result')
  const resultSummary = document.getElementById('quiz-result-summary')
  const resultPerfectStamp = document.getElementById(
    'quiz-result-perfect-stamp',
  ) as HTMLImageElement | null
  const resultPerfectMessage = document.getElementById('quiz-result-perfect-message')
  const resultPerfectRow = document.getElementById('quiz-result-perfect-row')
  const resultList = document.getElementById('quiz-result-list')

  if (
    !quizModeSelect ||
    !normalFilter ||
    !costumeFilter ||
    !collaborationFilter ||
    !questionCountPreset ||
    !questionCountCustom ||
    !startButton ||
    !nextButton ||
    !replayButton ||
    !resultActions ||
    !resultRestartButton ||
    !resultBackButton ||
    !statusText ||
    !proficiencyText ||
    !costumeHintText ||
    !choicesRoot
  ) {
    return
  }

  const getCandidateNames = () => {
    const selected = new Set<string>()
    if (normalFilter.checked) {
      candidateGroups.normal.forEach((name) => selected.add(name))
    }
    if (costumeFilter.checked) {
      candidateGroups.costume.forEach((name) => selected.add(name))
    }
    if (collaborationFilter.checked) {
      candidateGroups.collaboration.forEach((name) => selected.add(name))
    }
    return [...selected]
  }
  const normalizeAnswer = (value: string) => normalizeQuizAnswer(value)
  const shuffleArray = <T>(values: T[]) => {
    const next = [...values]
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[next[i], next[j]] = [next[j], next[i]]
    }
    return next
  }
  const buildChoices = (correctName: string, allNames: string[]) => {
    const distractors = allNames.filter((name) => name !== correctName)
    const pickedDistractors = shuffleArray(distractors).slice(0, 3)
    return shuffleArray([correctName, ...pickedDistractors])
  }

  let askedNames: string[] = []
  let currentAnswer = ''
  let currentMode = quizModeSelect.value
  let shouldShowCurrentAnswerStats = false
  let score = 0
  let questionNumber = 0
  let currentAudio: HTMLAudioElement | null = null
  let proficiencyMap: ProficiencyMap = {}
  let activeNames = getCandidateNames()
  let totalQuestions = Math.min(DEFAULT_QUESTION_COUNT, activeNames.length)
  let hasAnsweredCurrentQuestion = false
  let awaitingResult = false
  let isQuizRunning = false
  let resultEntries: QuizResultEntry[] = []
  let playAudioDelayTimer: number | null = null
  const allCandidateNames = new Set(Object.values(candidateGroups).flat())
  const sortedCandidateNames = [...allCandidateNames].sort((a, b) => a.localeCompare(b, 'ja'))

  const setMenuOpen = (isOpen: boolean) => {
    if (!menuPanel || !menuButton) {
      return
    }
    menuPanel.hidden = !isOpen
    menuButton.setAttribute('aria-expanded', String(isOpen))
  }

  const setQuizRunning = (running: boolean) => {
    isQuizRunning = running
    if (setupControls) {
      setupControls.hidden = running
    }
    startButton.hidden = running
    if (menuRestartButton) {
      menuRestartButton.disabled = !running
    }
  }

  const normalizeMap = (rawMap: unknown): ProficiencyMap => {
    const result: ProficiencyMap = {}
    if (!rawMap || typeof rawMap !== 'object') {
      return result
    }
    Object.entries(
      rawMap as Record<string, { correct: unknown; attempts: unknown }>,
    ).forEach(([name, entry]) => {
      if (!entry || typeof entry !== 'object') {
        return
      }
      const correct = Number(entry.correct)
      const attempts = Number(entry.attempts)
      if (!Number.isFinite(correct) || !Number.isFinite(attempts)) {
        return
      }
      result[name] = {
        correct: Math.max(0, Math.floor(correct)),
        attempts: Math.max(0, Math.floor(attempts)),
      }
    })
    return result
  }

  const migrateLegacyMap = (rawMap: unknown): ProficiencyMap => {
    const normalized = normalizeMap(rawMap)
    if (Object.keys(normalized).length > 0) {
      return normalized
    }
    const result: ProficiencyMap = {}
    if (!rawMap || typeof rawMap !== 'object') {
      return result
    }
    Object.entries(rawMap as Record<string, unknown>).forEach(([name, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        const correct = Math.max(0, Math.floor(value))
        result[name] = { correct, attempts: correct }
      }
    })
    return result
  }

  const ensureStudentEntries = (map: ProficiencyMap) => {
    const next = { ...map }
    Object.values(candidateGroups)
      .flat()
      .forEach((name) => {
        if (!next[name]) {
          next[name] = { correct: 0, attempts: 0 }
        }
      })
    return next
  }

  const saveProficiency = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(proficiencyMap))
  }

  const loadProficiency = () => {
    const currentRaw = localStorage.getItem(STORAGE_KEY)
    if (currentRaw) {
      proficiencyMap = ensureStudentEntries(normalizeMap(JSON.parse(currentRaw)))
      saveProficiency()
      return
    }

    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacyRaw = localStorage.getItem(legacyKey)
      if (!legacyRaw) continue
      proficiencyMap = ensureStudentEntries(migrateLegacyMap(JSON.parse(legacyRaw)))
      saveProficiency()
      localStorage.removeItem(legacyKey)
      statusText.textContent = '旧セーブデータを移行しました。'
      return
    }
    proficiencyMap = ensureStudentEntries({})
    saveProficiency()
  }

  const calculateAccuracy = (entry: { correct: number; attempts: number }) => {
    if (!entry || entry.attempts <= 0) {
      return 0
    }
    return Math.round((entry.correct / entry.attempts) * 1000) / 10
  }

  const updateProficiencyText = () => {
    const entry = proficiencyMap[currentAnswer] ?? { correct: 0, attempts: 0 }
    const accuracy = calculateAccuracy(entry)
    proficiencyText.textContent = currentAnswer && shouldShowCurrentAnswerStats
      ? `${currentAnswer} の正答率: ${accuracy}% (${entry.correct}/${entry.attempts})`
      : ''
  }

  const recordAnswer = (studentName: string, isCorrect: boolean) => {
    const entry = proficiencyMap[studentName] ?? { correct: 0, attempts: 0 }
    entry.attempts += 1
    if (isCorrect) {
      entry.correct += 1
    }
    proficiencyMap[studentName] = entry
    saveProficiency()
    updateProficiencyText()
  }

  const updateQuestionCountFieldVisibility = () => {
    questionCountCustom.hidden = questionCountPreset.value !== 'custom'
  }

  const getSelectedQuestionCount = (maxQuestions: number) => {
    if (maxQuestions <= 0) {
      return 0
    }
    const presetValue = questionCountPreset.value
    const rawValue = presetValue === 'all'
      ? maxQuestions
      : presetValue === 'custom'
      ? Number(questionCountCustom.value ?? '')
      : Number(presetValue)
    return resolveQuestionCount(rawValue, maxQuestions)
  }

  const updateAllQuestionOptionLabel = (maxQuestions: number) => {
    const allOption = questionCountPreset.querySelector<HTMLOptionElement>(
      'option[value="all"]',
    )
    if (!allOption) {
      return
    }
    allOption.textContent = `${maxQuestions}(全部)`
  }

  const updateModeUI = () => {
    currentMode = quizModeSelect.value
    const isNameInputMode =
      currentMode === QUIZ_MODE_NAME_INPUT || currentMode === QUIZ_MODE_NAME_INPUT_LUNATIC
    choicesRoot.hidden = isNameInputMode
    if (nameAnswerForm) {
      nameAnswerForm.hidden = !isNameInputMode || !isQuizRunning
    }
  }

  const updateCostumeHintText = () => {
    costumeHintText.textContent = ''
  }

  const refreshFilterState = () => {
    activeNames = getCandidateNames()
    updateAllQuestionOptionLabel(activeNames.length)
    totalQuestions = getSelectedQuestionCount(activeNames.length)
  }

  const hideNameSuggestions = () => {
    if (!nameAnswerSuggestions) {
      return
    }
    nameAnswerSuggestions.innerHTML = ''
    nameAnswerSuggestions.hidden = true
  }

  const showNameSuggestions = () => {
    if (!nameAnswerSuggestions || !nameAnswerInput || !isQuizRunning) {
      return
    }
    if (currentMode !== QUIZ_MODE_NAME_INPUT) {
      hideNameSuggestions()
      return
    }
    const rawInput = nameAnswerInput.value.trim()
    if (!rawInput) {
      hideNameSuggestions()
      return
    }
    const matches = buildNameInputSuggestions(sortedCandidateNames, activeNames, rawInput, 8)
    if (matches.length === 0) {
      hideNameSuggestions()
      return
    }
    nameAnswerSuggestions.innerHTML = ''
    matches.forEach((name) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'quiz-name-answer-suggestion'
      const image = document.createElement('img')
      image.src = `/image/${encodeURIComponent(name)}.webp`
      image.alt = name
      image.onerror = () => {
        image.src = DEFAULT_IMAGE
      }
      const label = document.createElement('span')
      label.textContent = name
      button.append(image, label)
      button.addEventListener('click', () => {
        nameAnswerInput.value = name
        hideNameSuggestions()
        nameAnswerInput.focus()
      })
      nameAnswerSuggestions.appendChild(button)
    })
    nameAnswerSuggestions.hidden = false
  }

  const stopAudio = () => {
    if (playAudioDelayTimer !== null) {
      window.clearTimeout(playAudioDelayTimer)
      playAudioDelayTimer = null
    }
    if (!currentAudio) return
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
  }

  const playAudioForName = (studentName: string) => {
    if (!studentName || !allCandidateNames.has(studentName)) return
    stopAudio()
    currentAudio = new Audio(`/audio/${encodeURIComponent(studentName)}.mp3`)
    currentAudio.play().catch(() => {
      statusText.textContent = '音声を再生できませんでした。もう一度お試しください。'
    })
  }

  const playCurrentAudio = () => {
    if (!activeNames.includes(currentAnswer)) {
      return
    }
    if (playAudioDelayTimer !== null) {
      window.clearTimeout(playAudioDelayTimer)
      playAudioDelayTimer = null
    }
    playAudioDelayTimer = window.setTimeout(() => {
      playAudioDelayTimer = null
      playAudioForName(currentAnswer)
    }, 500)
  }

  const updateAnswerFeedback = (name: string) => {
    if (!answerFeedback || !answerImage || !answerName || !name) return
    answerImage.src = `/image/${encodeURIComponent(name)}.webp`
    answerImage.onerror = () => {
      answerImage.src = DEFAULT_IMAGE
    }
    answerName.textContent = name
    answerFeedback.hidden = false
  }

  const hideAnswerFeedback = () => {
    if (answerFeedback) {
      answerFeedback.hidden = true
    }
  }

  const hideResult = () => {
    if (resultSection) {
      resultSection.hidden = true
    }
    if (resultPerfectStamp) {
      resultPerfectStamp.hidden = true
    }
    if (resultPerfectMessage) {
      resultPerfectMessage.hidden = true
    }
    if (resultPerfectRow) {
      resultPerfectRow.hidden = true
    }
    if (resultList) {
      resultList.innerHTML = ''
    }
    if (resultSummary) {
      resultSummary.textContent = ''
    }
  }

  const showQuizProgressActions = () => {
    nextButton.hidden = !hasAnsweredCurrentQuestion
    replayButton.hidden = false
    resultActions.hidden = true
  }

  const showResultActions = () => {
    nextButton.hidden = true
    replayButton.hidden = true
    resultActions.hidden = false
  }

  const renderResult = () => {
    if (!resultSection || !resultSummary || !resultList) {
      return
    }
    const { correctCount, totalCount, wrongCount, accuracy, isPerfect } = summarizeQuizResults(
      resultEntries,
    )
    resultSummary.textContent =
      `正解: ${correctCount} / ${totalCount} ・不正解: ${wrongCount} ・正答率: ${accuracy}%`

    if (resultPerfectStamp) {
      resultPerfectStamp.hidden = !isPerfect
    }
    if (resultPerfectMessage) {
      resultPerfectMessage.hidden = !isPerfect
    }
    if (resultPerfectRow) {
      resultPerfectRow.hidden = !isPerfect
    }

    resultList.innerHTML = ''
    resultEntries.forEach((entry) => {
      const item = document.createElement('article')
      item.className = `quiz-result-item ${entry.isCorrect ? 'correct' : 'wrong'}`
      const image = document.createElement('img')
      image.src = `/image/${encodeURIComponent(entry.correctAnswer)}.webp`
      image.alt = entry.correctAnswer
      image.onerror = () => {
        image.src = DEFAULT_IMAGE
      }

      const text = document.createElement('div')
      text.className = 'quiz-result-item-text'
      const status = document.createElement('div')
      status.className = 'quiz-result-item-status'
      status.textContent = `第${entry.questionNumber}問 ${entry.isCorrect ? '正解' : '不正解'}`
      const correct = document.createElement('div')
      correct.textContent = `正答: ${entry.correctAnswer}`
      const answer = document.createElement('div')
      answer.textContent = `回答: ${entry.userAnswer || '（未回答）'}`
      text.append(status, correct, answer)
      item.append(image, text)
      resultList.appendChild(item)
    })

    resultSection.hidden = false
  }

  const resetToStartScreen = () => {
    stopAudio()
    askedNames = []
    currentAnswer = ''
    score = 0
    questionNumber = 0
    shouldShowCurrentAnswerStats = false
    hasAnsweredCurrentQuestion = false
    awaitingResult = false
    resultEntries = []
    choicesRoot.innerHTML = ''
    choicesRoot.hidden = true
    if (nameAnswerForm) {
      nameAnswerForm.hidden = true
    }
    if (nameAnswerInput) {
      nameAnswerInput.value = ''
      nameAnswerInput.disabled = false
    }
    hideNameSuggestions()
    if (nameAnswerSubmit) {
      nameAnswerSubmit.disabled = false
    }
    hideAnswerFeedback()
    hideResult()
    updateCostumeHintText()
    updateProficiencyText()
    statusText.textContent = INITIAL_STATUS_TEXT
    nextButton.hidden = true
    replayButton.hidden = true
    resultActions.hidden = true
    nextButton.textContent = '次へ'
    replayButton.disabled = true
    nextButton.disabled = true
    startButton.textContent = '開始'
    setQuizRunning(false)
    setMenuOpen(false)
  }

  const finalizeAnswer = (userAnswer: string, isCorrect: boolean) => {
    if (isCorrect) {
      score += 1
    }
    resultEntries.push({
      questionNumber,
      correctAnswer: currentAnswer,
      userAnswer,
      isCorrect,
    })
    shouldShowCurrentAnswerStats = true
    hasAnsweredCurrentQuestion = true
    recordAnswer(currentAnswer, isCorrect)
    statusText.textContent = isCorrect ? '正解！' : `不正解… 正解は「${currentAnswer}」`
    updateAnswerFeedback(currentAnswer)
    const hasRemainingQuestion = questionNumber < totalQuestions
    awaitingResult = !hasRemainingQuestion
    nextButton.textContent = awaitingResult ? 'リザルト' : '次へ'
    replayButton.disabled = awaitingResult
    nextButton.hidden = false
    nextButton.disabled = false
  }

  const showResultScreen = () => {
    stopAudio()
    currentAnswer = ''
    shouldShowCurrentAnswerStats = false
    hasAnsweredCurrentQuestion = false
    awaitingResult = false
    choicesRoot.innerHTML = ''
    choicesRoot.hidden = true
    if (nameAnswerForm) {
      nameAnswerForm.hidden = true
    }
    hideNameSuggestions()
    statusText.textContent = `終了！${score} / ${questionNumber} 問正解`
    startButton.textContent = 'もう一度'
    hideAnswerFeedback()
    renderResult()
    showResultActions()
    updateCostumeHintText()
    updateProficiencyText()
  }

  const renderQuestion = () => {
    choicesRoot.innerHTML = ''
    const available = activeNames.filter((name) => !askedNames.includes(name))
    if (available.length === 0 || questionNumber >= totalQuestions) {
      showResultScreen()
      return
    }

    currentAnswer = available[Math.floor(Math.random() * available.length)]
    askedNames.push(currentAnswer)
    questionNumber += 1
    statusText.textContent = `第${questionNumber}問: このタイトルコールは誰？`
    shouldShowCurrentAnswerStats = false
    hasAnsweredCurrentQuestion = false
    awaitingResult = false
    nextButton.textContent = '次へ'
    showQuizProgressActions()
    replayButton.disabled = false
    nextButton.disabled = true
    hideAnswerFeedback()
    hideResult()
    playCurrentAudio()
    updateCostumeHintText()
    updateProficiencyText()

    if (currentMode === QUIZ_MODE_MULTIPLE_CHOICE) {
      choicesRoot.hidden = false
      if (nameAnswerForm) {
        nameAnswerForm.hidden = true
      }
      hideNameSuggestions()
      const choices = buildChoices(currentAnswer, activeNames)
      choices.forEach((name) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'quiz-choice-button'
        button.dataset.choiceName = name
        const image = document.createElement('img')
        image.src = `/image/${encodeURIComponent(name)}.webp`
        image.alt = ''
        image.onerror = () => {
          image.src = DEFAULT_IMAGE
        }
        const label = document.createElement('span')
        label.textContent = name
        button.append(image, label)
        button.addEventListener('click', () => {
          if (hasAnsweredCurrentQuestion) {
            playAudioForName(name)
            return
          }
          const isCorrect = name === currentAnswer
          finalizeAnswer(name, isCorrect)
          choicesRoot.querySelectorAll<HTMLButtonElement>('button').forEach((choiceButton) => {
            const choiceName = choiceButton.dataset.choiceName
            if (choiceName === currentAnswer) {
              choiceButton.classList.add('correct')
            }
            if (!isCorrect && choiceName === name) {
              choiceButton.classList.add('wrong-selected')
            }
          })
        })
        choicesRoot.appendChild(button)
      })
      return
    }

    choicesRoot.hidden = true
    if (nameAnswerForm) {
      nameAnswerForm.hidden = false
    }
    if (nameAnswerInput) {
      nameAnswerInput.value = ''
      nameAnswerInput.disabled = false
    }
    hideNameSuggestions()
    if (nameAnswerSubmit) {
      nameAnswerSubmit.disabled = false
    }
  }

  const startQuiz = () => {
    updateModeUI()
    updateQuestionCountFieldVisibility()
    refreshFilterState()
    if (activeNames.length < 1) {
      statusText.textContent =
        'クイズを開始できません。選択中の条件で生徒データを1件以上用意してください。'
      return false
    }
    if (currentMode === QUIZ_MODE_MULTIPLE_CHOICE && activeNames.length < 4) {
      statusText.textContent =
        'クイズを開始できません。選択中の条件で生徒データを4件以上用意してください。'
      return false
    }
    askedNames = []
    currentAnswer = ''
    score = 0
    questionNumber = 0
    resultEntries = []
    shouldShowCurrentAnswerStats = false
    awaitingResult = false
    hideAnswerFeedback()
    hideResult()
    showQuizProgressActions()
    nextButton.textContent = '次へ'
    nextButton.disabled = true
    setQuizRunning(true)
    startButton.textContent = 'リスタート'
    renderQuestion()
    return true
  }

  startButton.addEventListener('click', startQuiz)

  nextButton.addEventListener('click', () => {
    if (!hasAnsweredCurrentQuestion) {
      return
    }
    if (awaitingResult) {
      showResultScreen()
      return
    }
    renderQuestion()
  })

  replayButton.addEventListener('click', playCurrentAudio)
  setPageSwitchGuard((targetId) => {
    const isNavigatingToCardList = targetId === 'card-list'
    const isShowingResult = Boolean(resultSection && !resultSection.hidden)
    if (!isNavigatingToCardList || !isQuizRunning || isShowingResult) {
      return true
    }
    const shouldMove = window.confirm(
      '現在クイズ中です。進行中のデータは保存されません。\nクイズを中断してカード一覧に移動しますか？',
    )
    if (!shouldMove) {
      return false
    }
    resetToStartScreen()
    return true
  })
  menuButton?.addEventListener('click', () => {
    setMenuOpen(menuPanel?.hidden ?? true)
  })
  menuRestartButton?.addEventListener('click', () => {
    if (!isQuizRunning) {
      return
    }
    setMenuOpen(false)
    startQuiz()
  })
  menuResetScreenButton?.addEventListener('click', resetToStartScreen)
  resultRestartButton.addEventListener('click', startQuiz)
  resultBackButton.addEventListener('click', resetToStartScreen)
  document.addEventListener('click', (event) => {
    if (!menuPanel || menuPanel.hidden) {
      return
    }
    const target = event.target
    if (!(target instanceof Node)) {
      return
    }
    if (menuPanel.contains(target) || menuButton?.contains(target)) {
      return
    }
    setMenuOpen(false)
  })
  quizModeSelect.addEventListener('change', () => {
    updateModeUI()
    refreshFilterState()
    statusText.textContent = '出題方式を変更しました。「開始」を押してください。'
  })
  questionCountPreset.addEventListener('change', () => {
    updateQuestionCountFieldVisibility()
    refreshFilterState()
    statusText.textContent = '問題数を変更しました。「開始」を押してください。'
  })
  questionCountCustom.addEventListener('input', refreshFilterState)
  ;[normalFilter, costumeFilter, collaborationFilter].forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      refreshFilterState()
      statusText.textContent = '出題対象を変更しました。「開始」を押してください。'
    })
  })

  nameAnswerForm?.addEventListener('submit', (event) => {
    event.preventDefault()
    if (!currentAnswer || !nameAnswerInput || !nameAnswerSubmit) return
    const answer = normalizeAnswer(nameAnswerInput.value)
    const correctAnswer = normalizeAnswer(currentAnswer)
    const isCorrect = answer.length > 0 && answer === correctAnswer
    finalizeAnswer(nameAnswerInput.value.trim(), isCorrect)
    nameAnswerInput.disabled = true
    nameAnswerSubmit.disabled = true
    hideNameSuggestions()
  })

  nameAnswerInput?.addEventListener('input', showNameSuggestions)
  nameAnswerInput?.addEventListener('focus', showNameSuggestions)
  nameAnswerInput?.addEventListener('blur', () => {
    window.setTimeout(() => {
      hideNameSuggestions()
    }, 120)
  })

  loadProficiency()
  updateModeUI()
  updateQuestionCountFieldVisibility()
  refreshFilterState()
  setQuizRunning(false)
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
  setupQuiz(students.filter(({ Name }) => !unavailableAudioNames.has(Name)))
}

bootstrap().catch(() => {
  const status = document.getElementById('quiz-status')
  if (status) {
    status.textContent =
      'データの読み込みに失敗しました。ページを再読み込みしてください。'
  }
})
