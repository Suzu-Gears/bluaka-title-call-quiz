import '@fontsource/kosugi-maru'
import fitty, { type FittyInstance } from 'fitty'

import type { Student } from '@/lib/interfaces'
import {
  filterCandidates,
  normalizeQuizAnswer,
  resolveQuestionCount,
  resolveStudentCategory,
} from '@/lib/quizProgress'
import './styles.css'

declare const __APP_VERSION__: string

const DEFAULT_IMAGE = '/default-student-image.webp'
const QUIZ_MODE_MULTIPLE_CHOICE = 'multiple-choice'
const QUIZ_MODE_NAME_INPUT = 'name-input'
const DEFAULT_QUESTION_COUNT = 10
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

const setupPageSwitch = () => {
  const switchButtons = document.querySelectorAll<HTMLButtonElement>(
    '[data-view-target]',
  )
  const allViews = ['card-list', 'quiz-view']
  switchButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-view-target')
      if (!targetId) return
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

const createCard = (student: Student) => {
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
  const nameNode = document.createElement('div')
  nameNode.className = 'name'
  nameNode.textContent = student.Name.includes('（')
    ? `\u00A0${student.Name}`
    : `\u00A0${student.Name}\u00A0`
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

const setupStudentGrid = (students: Student[]) => {
  const grid = document.getElementById('studentGrid')
  if (!grid) return

  students
    .slice()
    .sort((a, b) => (a.DefaultOrder ?? 0) - (b.DefaultOrder ?? 0))
    .forEach((student) => grid.appendChild(createCard(student)))

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

  const startButton = document.getElementById(
    'quiz-start-button',
  ) as HTMLButtonElement | null
  const nextButton = document.getElementById(
    'quiz-next-button',
  ) as HTMLButtonElement | null
  const replayButton = document.getElementById(
    'quiz-play-audio-button',
  ) as HTMLButtonElement | null
  const exportButton = document.getElementById(
    'quiz-export-progress-button',
  ) as HTMLButtonElement | null
  const importButton = document.getElementById(
    'quiz-import-progress-button',
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
  const nameAnswerSubmit = nameAnswerForm?.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  )
  const answerFeedback = document.getElementById('quiz-answer-feedback')
  const answerImage = document.getElementById(
    'quiz-answer-image',
  ) as HTMLImageElement | null
  const answerName = document.getElementById('quiz-answer-name')

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
  const allCandidateNames = new Set(Object.values(candidateGroups).flat())

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
    const rawValue = presetValue === 'custom'
      ? Number(questionCountCustom.value ?? '')
      : Number(presetValue)
    return resolveQuestionCount(rawValue, maxQuestions)
  }

  const updateModeUI = () => {
    currentMode = quizModeSelect.value
    const isNameInputMode = currentMode === QUIZ_MODE_NAME_INPUT
    choicesRoot.hidden = isNameInputMode
    if (nameAnswerForm) {
      nameAnswerForm.hidden = !isNameInputMode
    }
  }

  const updateCostumeHintText = () => {
    if (currentMode !== QUIZ_MODE_NAME_INPUT || !currentAnswer) {
      costumeHintText.textContent = ''
      return
    }
    const costumeName = String(costumeHints[currentAnswer] ?? '').trim()
    costumeHintText.textContent = costumeName ? `ヒント: ${costumeName}` : ''
  }

  const refreshFilterState = () => {
    activeNames = getCandidateNames()
    totalQuestions = getSelectedQuestionCount(activeNames.length)
  }

  const stopAudio = () => {
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
    playAudioForName(currentAnswer)
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

  const finalizeAnswer = (isCorrect: boolean) => {
    if (isCorrect) {
      score += 1
    }
    shouldShowCurrentAnswerStats = true
    hasAnsweredCurrentQuestion = true
    recordAnswer(currentAnswer, isCorrect)
    statusText.textContent = isCorrect ? '正解！' : `不正解… 正解は「${currentAnswer}」`
    updateAnswerFeedback(currentAnswer)
    nextButton.disabled = false
  }

  const renderQuestion = () => {
    choicesRoot.innerHTML = ''
    const available = activeNames.filter((name) => !askedNames.includes(name))
    if (available.length === 0 || questionNumber >= totalQuestions) {
      stopAudio()
      currentAnswer = ''
      shouldShowCurrentAnswerStats = false
      hasAnsweredCurrentQuestion = false
      replayButton.disabled = true
      nextButton.disabled = true
      statusText.textContent = `終了！${score} / ${questionNumber} 問正解`
      startButton.textContent = 'もう一度'
      hideAnswerFeedback()
      updateCostumeHintText()
      updateProficiencyText()
      return
    }

    currentAnswer = available[Math.floor(Math.random() * available.length)]
    askedNames.push(currentAnswer)
    questionNumber += 1
    statusText.textContent = `第${questionNumber}問: このタイトルコールは誰？`
    shouldShowCurrentAnswerStats = false
    hasAnsweredCurrentQuestion = false
    replayButton.disabled = false
    nextButton.disabled = true
    hideAnswerFeedback()
    playCurrentAudio()
    updateCostumeHintText()
    updateProficiencyText()

    if (currentMode === QUIZ_MODE_MULTIPLE_CHOICE) {
      choicesRoot.hidden = false
      if (nameAnswerForm) {
        nameAnswerForm.hidden = true
      }
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
          finalizeAnswer(isCorrect)
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
      nameAnswerInput.focus()
    }
    if (nameAnswerSubmit) {
      nameAnswerSubmit.disabled = false
    }
  }

  startButton.addEventListener('click', () => {
    updateModeUI()
    updateQuestionCountFieldVisibility()
    refreshFilterState()
    if (activeNames.length < 1) {
      statusText.textContent =
        'クイズを開始できません。選択中の条件で生徒データを1件以上用意してください。'
      return
    }
    if (currentMode === QUIZ_MODE_MULTIPLE_CHOICE && activeNames.length < 4) {
      statusText.textContent =
        'クイズを開始できません。選択中の条件で生徒データを4件以上用意してください。'
      return
    }
    askedNames = []
    currentAnswer = ''
    score = 0
    questionNumber = 0
    shouldShowCurrentAnswerStats = false
    hideAnswerFeedback()
    nextButton.disabled = true
    startButton.textContent = 'リスタート'
    renderQuestion()
  })

  nextButton.addEventListener('click', () => {
    if (!hasAnsweredCurrentQuestion) {
      return
    }
    renderQuestion()
  })

  replayButton.addEventListener('click', playCurrentAudio)
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
    finalizeAnswer(isCorrect)
    nameAnswerInput.disabled = true
    nameAnswerSubmit.disabled = true
  })

  exportButton?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(proficiencyMap, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'bluaka-quiz-proficiency.json'
    link.click()
    URL.revokeObjectURL(url)
  })

  importButton?.addEventListener('click', () => {
    const raw = window.prompt(
      '移行するJSONを貼り付けてください（エクスポート済みデータ）',
    )
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      const imported = ensureStudentEntries(migrateLegacyMap(parsed))
      proficiencyMap = {
        ...proficiencyMap,
        ...imported,
      }
      saveProficiency()
      statusText.textContent = '進捗データをインポートしました。'
      updateProficiencyText()
    } catch {
      statusText.textContent = 'JSONの解析に失敗しました。形式を確認してください。'
    }
  })

  loadProficiency()
  updateModeUI()
  updateQuestionCountFieldVisibility()
  refreshFilterState()
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
    status.textContent =
      'データの読み込みに失敗しました。ページを再読み込みしてください。'
  }
})
