import type { Student } from '@/lib/interfaces'
import { buildChoices } from '@/lib/quizEngine'
import {
  buildNameInputSuggestions,
  calculateAccuracy,
  filterCandidates,
  isTransientNameInputQuery,
  mergeWithStudents,
  migrateLegacyProficiency,
  normalizeProficiencyMap,
  normalizeQuizAnswer,
  resolveMultipleChoiceMaxQuestions,
  summarizeQuizResults,
} from '@/lib/quizProgress'
import type { ProficiencyMap } from '@/lib/quizProgress'
import { setupQuizQuestionCountControl } from '@/quizQuestionCountControl'

const DEFAULT_IMAGE = '/default-student-image.webp'
const QUIZ_MODE_MULTIPLE_CHOICE = 'multiple-choice'
const QUIZ_MODE_NAME_INPUT = 'name-input'
const QUIZ_MODE_NAME_INPUT_LUNATIC = 'name-input-lunatic'
const MIN_NAME_SUGGESTION_OVERLAY_WIDTH = 220
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

type QuizResultEntry = {
  questionNumber: number
  correctAnswer: string
  userAnswer: string
  isCorrect: boolean
}

let nameSuggestionOverlayListenersAttached = false

export const setupQuiz = (
  students: Student[],
  setPageSwitchGuard: (guard: ((targetId: string) => boolean) | null) => void,
): void => {
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
  const questionCountInput = document.getElementById(
    'quiz-question-count-input',
  ) as HTMLInputElement | null
  const questionCountMinusButton = document.getElementById(
    'quiz-question-count-minus-button',
  ) as HTMLButtonElement | null
  const questionCountPlusButton = document.getElementById(
    'quiz-question-count-plus-button',
  ) as HTMLButtonElement | null
  const questionCountMinButton = document.getElementById(
    'quiz-question-count-min-button',
  ) as HTMLButtonElement | null
  const questionCountMaxButton = document.getElementById(
    'quiz-question-count-max-button',
  ) as HTMLButtonElement | null
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
  const quizSection = document.querySelector<HTMLElement>('#quiz-view .quiz-section')
  const nameAnswerInput = document.getElementById(
    'quiz-name-answer-input',
  ) as HTMLInputElement | null
  const nameAnswerSuggestionsOverlay = document.getElementById(
    'quiz-name-answer-suggestions-overlay',
  )
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
    !questionCountInput ||
    !questionCountMinusButton ||
    !questionCountPlusButton ||
    !questionCountMinButton ||
    !questionCountMaxButton ||
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

  let usedChoiceNames: Set<string> = new Set()
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
  let isComposingNameInput = false
  const allCandidateNames = new Set(Object.values(candidateGroups).flat())
  const sortedCandidateNames = [...allCandidateNames].sort((a, b) =>
    a.localeCompare(b, 'ja'),
  )

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
    if (!running) {
      nextButton.hidden = true
      replayButton.hidden = true
      resultActions.hidden = true
    }
    if (menuRestartButton) {
      menuRestartButton.disabled = !running
    }
  }

  const allStudentNames = Object.values(candidateGroups).flat()

  const saveProficiency = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(proficiencyMap))
  }

  const loadProficiency = () => {
    const currentRaw = localStorage.getItem(STORAGE_KEY)
    if (currentRaw) {
      proficiencyMap = mergeWithStudents(
        normalizeProficiencyMap(JSON.parse(currentRaw)),
        allStudentNames,
      )
      saveProficiency()
      return
    }

    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacyRaw = localStorage.getItem(legacyKey)
      if (!legacyRaw) continue
      proficiencyMap = mergeWithStudents(
        migrateLegacyProficiency(JSON.parse(legacyRaw)),
        allStudentNames,
      )
      saveProficiency()
      localStorage.removeItem(legacyKey)
      statusText.textContent = '旧セーブデータを移行しました。'
      return
    }
    proficiencyMap = mergeWithStudents({}, allStudentNames)
    saveProficiency()
  }

  const updateProficiencyText = () => {
    const entry = proficiencyMap[currentAnswer] ?? { correct: 0, attempts: 0 }
    const accuracy = calculateAccuracy(entry)
    proficiencyText.textContent =
      currentAnswer && shouldShowCurrentAnswerStats
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

  const getQuestionCountMax = () =>
    currentMode === QUIZ_MODE_MULTIPLE_CHOICE
      ? resolveMultipleChoiceMaxQuestions(activeNames.length)
      : activeNames.length

  const questionCountControl = setupQuizQuestionCountControl({
    elements: {
      input: questionCountInput,
      minusButton: questionCountMinusButton,
      plusButton: questionCountPlusButton,
      minButton: questionCountMinButton,
      maxButton: questionCountMaxButton,
    },
    getQuestionCountMax,
    onChange: () => {
      refreshFilterState()
      statusText.textContent = '問題数を変更しました。「開始」を押してください。'
    },
  })

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
    const maxQuestions = getQuestionCountMax()
    questionCountControl.updateRange(maxQuestions)
    totalQuestions = questionCountControl.getSelectedQuestionCount(maxQuestions)
  }

  const hideNameSuggestions = () => {
    if (nameAnswerSuggestionsOverlay) {
      nameAnswerSuggestionsOverlay.hidden = true
    }
    if (!nameAnswerSuggestions) {
      return
    }
    nameAnswerSuggestions.innerHTML = ''
    nameAnswerSuggestions.hidden = true
  }

  const positionNameSuggestionsOverlay = () => {
    if (
      !nameAnswerSuggestionsOverlay ||
      !nameAnswerInput ||
      !quizSection ||
      nameAnswerSuggestionsOverlay.hidden
    ) {
      return
    }
    const inputRect = nameAnswerInput.getBoundingClientRect()
    const sectionRect = quizSection.getBoundingClientRect()
    const relativeLeft = Math.max(0, inputRect.left - sectionRect.left)
    const relativeTop = Math.max(0, inputRect.bottom - sectionRect.top)
    const maxWidth = Math.max(
      MIN_NAME_SUGGESTION_OVERLAY_WIDTH,
      sectionRect.width - relativeLeft,
    )
    const overlayWidth = Math.max(inputRect.width, MIN_NAME_SUGGESTION_OVERLAY_WIDTH)
    nameAnswerSuggestionsOverlay.style.top = `${relativeTop}px`
    nameAnswerSuggestionsOverlay.style.left = `${relativeLeft}px`
    nameAnswerSuggestionsOverlay.style.width = `${Math.min(overlayWidth, maxWidth)}px`
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
    const isTransientQuery = isTransientNameInputQuery(rawInput)
    if (matches.length === 0) {
      if (
        isTransientQuery &&
        !nameAnswerSuggestions.hidden &&
        nameAnswerSuggestions.childElementCount > 0
      ) {
        if (nameAnswerSuggestionsOverlay) {
          nameAnswerSuggestionsOverlay.hidden = false
          positionNameSuggestionsOverlay()
        }
        return
      }
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
    if (nameAnswerSuggestionsOverlay) {
      nameAnswerSuggestionsOverlay.hidden = false
      positionNameSuggestionsOverlay()
    }
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
    const { correctCount, totalCount, wrongCount, accuracy, isPerfect } =
      summarizeQuizResults(resultEntries)
    resultSummary.textContent = `正解: ${correctCount} / ${totalCount} ・不正解: ${wrongCount} ・正答率: ${accuracy}%`

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
    usedChoiceNames = new Set()
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
    const available = activeNames.filter((name) => !usedChoiceNames.has(name))
    const minAvailable = currentMode === QUIZ_MODE_MULTIPLE_CHOICE ? 4 : 1
    if (available.length < minAvailable || questionNumber >= totalQuestions) {
      showResultScreen()
      return
    }

    currentAnswer = available[Math.floor(Math.random() * available.length)]
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
      const choices = buildChoices(currentAnswer, available)
      choices.forEach((name) => usedChoiceNames.add(name))
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

    usedChoiceNames.add(currentAnswer)
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
    usedChoiceNames = new Set()
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
  ;[normalFilter, costumeFilter, collaborationFilter].forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      refreshFilterState()
      statusText.textContent = '出題対象を変更しました。「開始」を押してください。'
    })
  })

  nameAnswerForm?.addEventListener('submit', (event) => {
    event.preventDefault()
    if (!currentAnswer || !nameAnswerInput || !nameAnswerSubmit) return
    const answer = normalizeQuizAnswer(nameAnswerInput.value)
    const correctAnswer = normalizeQuizAnswer(currentAnswer)
    const isCorrect = answer.length > 0 && answer === correctAnswer
    finalizeAnswer(nameAnswerInput.value.trim(), isCorrect)
    nameAnswerInput.disabled = true
    nameAnswerSubmit.disabled = true
    hideNameSuggestions()
  })

  nameAnswerInput?.addEventListener('focus', showNameSuggestions)
  nameAnswerInput?.addEventListener('compositionstart', () => {
    isComposingNameInput = true
  })
  nameAnswerInput?.addEventListener('compositionend', () => {
    isComposingNameInput = false
    showNameSuggestions()
  })
  nameAnswerInput?.addEventListener('input', (event) => {
    const inputEvent = event as InputEvent
    if (isComposingNameInput || inputEvent.isComposing) {
      return
    }
    showNameSuggestions()
  })
  nameAnswerInput?.addEventListener('blur', () => {
    window.setTimeout(() => {
      hideNameSuggestions()
    }, 120)
  })
  if (!nameSuggestionOverlayListenersAttached) {
    window.addEventListener('resize', positionNameSuggestionsOverlay)
    nameSuggestionOverlayListenersAttached = true
  }

  loadProficiency()
  updateModeUI()
  refreshFilterState()
  setQuizRunning(false)
}
