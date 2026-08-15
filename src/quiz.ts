import { formatImageKey } from '@/lib/assetKeys'
import { resolveAssetUrl } from '@/lib/assetPath'
import type { QuizEntry, TitleCallClip } from '@/lib/interfaces'
import { buildChoices } from '@/lib/quizEngine'
import type { ProficiencyMap } from '@/lib/quizProgress'
import {
  buildNameInputSuggestions,
  calculateAccuracy,
  filterCandidates,
  mergeWithStudents,
  migrateLegacyProficiency,
  normalizeProficiencyMap,
  normalizeQuizAnswer,
  resolveMultipleChoiceMaxQuestions,
  summarizeQuizResults,
} from '@/lib/quizProgress'
import { readStorageJson, removeStorage, writeStorage } from '@/lib/safeStorage'
import {
  hasMultipleGenerations,
  pickRandomClip,
  selectPlayableClips,
} from '@/lib/titleCallClips'
import { setHidden } from '@/lib/uiState'
import {
  formatAnswerClipLabel,
  formatAnswerResultStatus,
  formatQuizFinishedStatus,
  formatQuizQuestionStatus,
  formatResultEntryCorrectAnswer,
  formatResultEntryStatus,
  formatResultEntryUserAnswer,
  formatResultSummary,
  PROGRESS_UI_TEXT,
  QUIZ_UI_TEXT,
} from '@/lib/uiText'
import { setupProgressPanel } from '@/progressPanel'
import { setupQuizQuestionCountControl } from '@/quizQuestionCountControl'

const DEFAULT_IMAGE = resolveAssetUrl('default-student-image.webp')
const QUIZ_MODE_MULTIPLE_CHOICE = 'multiple-choice'
const QUIZ_MODE_NAME_INPUT = 'name-input'
const QUIZ_MODE_NAME_INPUT_LUNATIC = 'name-input-lunatic'
const MIN_NAME_SUGGESTION_OVERLAY_WIDTH = 220
const DEFAULT_QUESTION_COUNT = 10
const INITIAL_STATUS_TEXT = QUIZ_UI_TEXT.initialStatus
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
  /** 出題に使ったクリップ。リザルトから同じ音声を再生するために保持する。 */
  clip: TitleCallClip | null
}

let nameSuggestionOverlayListenersAttached = false

export const setupQuiz = (
  entries: readonly QuizEntry[],
  setPageSwitchGuard: (guard: ((targetId: string) => boolean) | null) => void,
): void => {
  const entryByName = new Map(entries.map((entry) => [entry.Name, entry]))
  // 音声が 1 本も無い生徒は出題できない(ビルド時点で確定している)。
  const playableEntries = entries.filter((entry) => entry.TitleCalls.length > 0)

  const baseCandidates = playableEntries.map((entry) => ({
    name: entry.Name,
    costume: entry.Costume,
    isCollaboration: entry.IsCollaboration,
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

  const quizModeGroup = document.getElementById(
    'quiz-mode-group',
  ) as HTMLElement | null
  const getQuizModeValue = () =>
    (
      quizModeGroup?.querySelector(
        'input[name="quiz-mode"]:checked',
      ) as HTMLInputElement | null
    )?.value ?? QUIZ_MODE_MULTIPLE_CHOICE
  const normalFilter = document.getElementById(
    'quiz-filter-normal',
  ) as HTMLInputElement | null
  const costumeFilter = document.getElementById(
    'quiz-filter-costume',
  ) as HTMLInputElement | null
  const collaborationFilter = document.getElementById(
    'quiz-filter-collaboration',
  ) as HTMLInputElement | null
  const oldGenerationWrapper = document.getElementById(
    'quiz-old-generation-wrapper',
  )
  const oldGenerationCheckbox = document.getElementById(
    'quiz-include-old-generations',
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
  const quizSection = document.querySelector<HTMLElement>(
    '#quiz-view .quiz-section',
  )
  const nameAnswerInput = document.getElementById(
    'quiz-name-answer-input',
  ) as HTMLInputElement | null
  const nameAnswerSuggestionsOverlay = document.getElementById(
    'quiz-name-answer-suggestions-overlay',
  )
  const nameAnswerSuggestions = document.getElementById(
    'quiz-name-answer-suggestions',
  )
  const nameAnswerSubmit = nameAnswerForm?.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  )
  const answerFeedback = document.getElementById('quiz-answer-feedback')
  const answerImage = document.getElementById(
    'quiz-answer-image',
  ) as HTMLImageElement | null
  const answerName = document.getElementById('quiz-answer-name')
  const answerClipLabel = document.getElementById('quiz-answer-clip-label')
  const resultSection = document.getElementById('quiz-result')
  const resultSummary = document.getElementById('quiz-result-summary')
  const resultPerfectStamp = document.getElementById(
    'quiz-result-perfect-stamp',
  ) as HTMLImageElement | null
  const resultPerfectMessage = document.getElementById(
    'quiz-result-perfect-message',
  )
  const resultPerfectRow = document.getElementById('quiz-result-perfect-row')
  const resultList = document.getElementById('quiz-result-list')

  if (
    !quizModeGroup ||
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
  let currentQuestionClip: TitleCallClip | null = null
  let currentMode = getQuizModeValue()
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
  let kokonaAudioTimer: number | null = null
  let storageWarningShown = false
  const kokonaAudio: HTMLAudioElement = new Audio(
    resolveAssetUrl('kokona-hanamaru.mp3'),
  )
  const allCandidateNames = new Set(Object.values(candidateGroups).flat())
  const sortedCandidateNames = [...allCandidateNames].sort((a, b) =>
    a.localeCompare(b, 'ja'),
  )

  const includeOldGenerations = () => Boolean(oldGenerationCheckbox?.checked)

  const clipsForName = (name: string): TitleCallClip[] =>
    selectPlayableClips(
      entryByName.get(name)?.TitleCalls ?? [],
      includeOldGenerations(),
    )

  const imageUrlForName = (name: string): string => {
    const entry = entryByName.get(name)
    return entry
      ? resolveAssetUrl(formatImageKey(entry.PrimaryId))
      : DEFAULT_IMAGE
  }

  // 旧世代の音声が 1 本も無いうちは、設定項目自体を出さない。
  if (oldGenerationWrapper) {
    const hasAnyOldGeneration = playableEntries.some((entry) =>
      hasMultipleGenerations(entry.TitleCalls),
    )
    setHidden(oldGenerationWrapper, !hasAnyOldGeneration)
  }

  const setMenuOpen = (isOpen: boolean) => {
    if (!menuPanel || !menuButton) {
      return
    }
    setHidden(menuPanel, !isOpen)
    menuButton.setAttribute('aria-expanded', String(isOpen))
  }

  const setQuizRunning = (running: boolean) => {
    isQuizRunning = running
    setHidden(setupControls, running)
    setHidden(startButton, running)
    if (!running) {
      setHidden(nextButton, true)
      setHidden(replayButton, true)
      setHidden(resultActions, true)
    }
    if (menuRestartButton) {
      menuRestartButton.disabled = !running
    }
  }

  const allStudentNames = Object.values(candidateGroups).flat()

  const saveProficiency = () => {
    const saved = writeStorage(STORAGE_KEY, JSON.stringify(proficiencyMap))
    if (!saved && !storageWarningShown) {
      storageWarningShown = true
      proficiencyText.textContent = PROGRESS_UI_TEXT.storageWriteFailed
    }
  }

  const loadProficiency = () => {
    const currentRaw = readStorageJson(STORAGE_KEY)
    if (currentRaw !== null) {
      proficiencyMap = mergeWithStudents(
        normalizeProficiencyMap(currentRaw),
        allStudentNames,
      )
      saveProficiency()
      return
    }

    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacyRaw = readStorageJson(legacyKey)
      if (legacyRaw === null) continue
      proficiencyMap = mergeWithStudents(
        migrateLegacyProficiency(legacyRaw),
        allStudentNames,
      )
      saveProficiency()
      removeStorage(legacyKey)
      statusText.textContent = QUIZ_UI_TEXT.migratedLegacySave
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

  const progressPanel = setupProgressPanel({
    getProficiency: () => proficiencyMap,
    replaceProficiency: (map) => {
      proficiencyMap = mergeWithStudents(
        normalizeProficiencyMap(map),
        allStudentNames,
      )
      saveProficiency()
      updateProficiencyText()
    },
    onOpen: () => setMenuOpen(false),
  })

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
      statusText.textContent = QUIZ_UI_TEXT.questionCountChanged
    },
  })

  const updateModeUI = () => {
    currentMode = getQuizModeValue()
    const isNameInputMode =
      currentMode === QUIZ_MODE_NAME_INPUT ||
      currentMode === QUIZ_MODE_NAME_INPUT_LUNATIC
    setHidden(choicesRoot, isNameInputMode)
    setHidden(nameAnswerForm, !isNameInputMode || !isQuizRunning)
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
    setHidden(nameAnswerSuggestionsOverlay, true)
    if (!nameAnswerSuggestions) {
      return
    }
    nameAnswerSuggestions.innerHTML = ''
    setHidden(nameAnswerSuggestions, true)
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
    const overlayWidth = Math.max(
      inputRect.width,
      MIN_NAME_SUGGESTION_OVERLAY_WIDTH,
    )
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
    const matches = buildNameInputSuggestions(
      sortedCandidateNames,
      activeNames,
      rawInput,
      8,
    )
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
      image.src = imageUrlForName(name)
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
    setHidden(nameAnswerSuggestions, false)
    if (nameAnswerSuggestionsOverlay) {
      setHidden(nameAnswerSuggestionsOverlay, false)
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

  const playClip = (clip: TitleCallClip | null) => {
    if (!clip) return
    stopAudio()
    currentAudio = new Audio(resolveAssetUrl(clip.file))
    currentAudio.play().catch(() => {
      statusText.textContent = QUIZ_UI_TEXT.audioPlaybackFailed
    })
  }

  /** 選択肢やリザルトから「その生徒の声」を聴くとき用。どのクリップでもよい。 */
  const playAnyClipForName = (name: string) => {
    playClip(pickRandomClip(clipsForName(name)))
  }

  const playCurrentAudio = () => {
    if (!currentQuestionClip) {
      return
    }
    if (playAudioDelayTimer !== null) {
      window.clearTimeout(playAudioDelayTimer)
      playAudioDelayTimer = null
    }
    playAudioDelayTimer = window.setTimeout(() => {
      playAudioDelayTimer = null
      playClip(currentQuestionClip)
    }, 500)
  }

  const playKokonaAudio = () => {
    kokonaAudio.pause()
    kokonaAudio.currentTime = 0
    kokonaAudio.play().catch(() => {})
  }

  const updateAnswerFeedback = (name: string) => {
    if (!answerFeedback || !answerImage || !answerName || !name) return
    answerImage.src = imageUrlForName(name)
    answerImage.onerror = () => {
      answerImage.src = DEFAULT_IMAGE
    }
    answerName.textContent = name
    if (answerClipLabel) {
      // 出題中は伏せておき、答え合わせの後にどのバージョンだったかを示す。
      answerClipLabel.textContent = formatAnswerClipLabel(
        currentQuestionClip?.label,
      )
    }
    setHidden(answerFeedback, false)
  }

  const hideAnswerFeedback = () => {
    setHidden(answerFeedback, true)
    if (answerClipLabel) {
      answerClipLabel.textContent = ''
    }
  }

  const hideResult = () => {
    setHidden(resultSection, true)
    setHidden(resultPerfectStamp, true)
    setHidden(resultPerfectMessage, true)
    setHidden(resultPerfectRow, true)
    if (resultList) {
      resultList.innerHTML = ''
    }
    if (resultSummary) {
      resultSummary.textContent = ''
    }
  }

  const showQuizProgressActions = () => {
    setHidden(nextButton, !hasAnsweredCurrentQuestion)
    setHidden(replayButton, false)
    setHidden(resultActions, true)
  }

  const showResultActions = () => {
    setHidden(nextButton, true)
    setHidden(replayButton, true)
    setHidden(resultActions, false)
  }

  const renderResult = () => {
    if (!resultSection || !resultSummary || !resultList) {
      return
    }
    const { correctCount, totalCount, wrongCount, accuracy, isPerfect } =
      summarizeQuizResults(resultEntries)
    resultSummary.textContent = formatResultSummary(
      correctCount,
      totalCount,
      wrongCount,
      accuracy,
    )

    if (resultPerfectStamp) {
      setHidden(resultPerfectStamp, !isPerfect)
    }
    if (resultPerfectMessage) {
      setHidden(resultPerfectMessage, !isPerfect)
    }
    if (resultPerfectRow) {
      setHidden(resultPerfectRow, !isPerfect)
    }

    if (isPerfect) {
      if (kokonaAudioTimer !== null) {
        window.clearTimeout(kokonaAudioTimer)
      }
      kokonaAudioTimer = window.setTimeout(() => {
        kokonaAudioTimer = null
        playKokonaAudio()
      }, 500)
    }

    resultList.innerHTML = ''
    resultEntries.forEach((entry) => {
      const item = document.createElement('article')
      item.className = `quiz-result-item ${entry.isCorrect ? 'correct' : 'wrong'}`
      const image = document.createElement('img')
      image.src = imageUrlForName(entry.correctAnswer)
      image.alt = entry.correctAnswer
      image.onerror = () => {
        image.src = DEFAULT_IMAGE
      }
      image.addEventListener('click', () => {
        // 出題されたクリップそのものを聴き直せるようにする。
        if (entry.clip) {
          playClip(entry.clip)
        } else {
          playAnyClipForName(entry.correctAnswer)
        }
      })

      const text = document.createElement('div')
      text.className = 'quiz-result-item-text'
      const status = document.createElement('div')
      status.className = 'quiz-result-item-status'
      status.textContent = formatResultEntryStatus(
        entry.questionNumber,
        entry.isCorrect,
      )
      const correct = document.createElement('div')
      correct.textContent = formatResultEntryCorrectAnswer(entry.correctAnswer)
      const answer = document.createElement('div')
      answer.textContent = formatResultEntryUserAnswer(entry.userAnswer)
      text.append(status, correct, answer)
      if (entry.clip?.label) {
        const clipLabel = document.createElement('div')
        clipLabel.className = 'quiz-result-item-clip-label'
        clipLabel.textContent = formatAnswerClipLabel(entry.clip.label)
        text.appendChild(clipLabel)
      }
      item.append(image, text)
      resultList.appendChild(item)
    })

    setHidden(resultSection, false)
  }

  const resetToStartScreen = () => {
    stopAudio()
    if (kokonaAudioTimer !== null) {
      window.clearTimeout(kokonaAudioTimer)
      kokonaAudioTimer = null
    }
    usedChoiceNames = new Set()
    currentAnswer = ''
    currentQuestionClip = null
    score = 0
    questionNumber = 0
    shouldShowCurrentAnswerStats = false
    hasAnsweredCurrentQuestion = false
    awaitingResult = false
    resultEntries = []
    choicesRoot.innerHTML = ''
    setHidden(choicesRoot, true)
    setHidden(nameAnswerForm, true)
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
    setHidden(nextButton, true)
    setHidden(replayButton, true)
    setHidden(resultActions, true)
    nextButton.textContent = QUIZ_UI_TEXT.next
    replayButton.disabled = true
    nextButton.disabled = true
    startButton.textContent = QUIZ_UI_TEXT.start
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
      clip: currentQuestionClip,
    })
    shouldShowCurrentAnswerStats = true
    hasAnsweredCurrentQuestion = true
    recordAnswer(currentAnswer, isCorrect)
    statusText.textContent = formatAnswerResultStatus(isCorrect, currentAnswer)
    updateAnswerFeedback(currentAnswer)
    const hasRemainingQuestion = questionNumber < totalQuestions
    awaitingResult = !hasRemainingQuestion
    nextButton.textContent = awaitingResult
      ? QUIZ_UI_TEXT.result
      : QUIZ_UI_TEXT.next
    replayButton.disabled = awaitingResult
    setHidden(replayButton, awaitingResult)
    setHidden(nextButton, false)
    nextButton.disabled = false
  }

  const showResultScreen = () => {
    stopAudio()
    currentAnswer = ''
    currentQuestionClip = null
    shouldShowCurrentAnswerStats = false
    hasAnsweredCurrentQuestion = false
    awaitingResult = false
    choicesRoot.innerHTML = ''
    setHidden(choicesRoot, true)
    setHidden(nameAnswerForm, true)
    hideNameSuggestions()
    statusText.textContent = formatQuizFinishedStatus(score, questionNumber)
    startButton.textContent = QUIZ_UI_TEXT.playAgain
    hideAnswerFeedback()
    renderResult()
    showResultActions()
    updateCostumeHintText()
    updateProficiencyText()
    // クラウド同期は 1 回のクイズが終わったタイミングだけに絞る。
    progressPanel.pushInBackground()
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
    currentQuestionClip = pickRandomClip(clipsForName(currentAnswer))
    questionNumber += 1
    statusText.textContent = formatQuizQuestionStatus(questionNumber)
    shouldShowCurrentAnswerStats = false
    hasAnsweredCurrentQuestion = false
    awaitingResult = false
    nextButton.textContent = QUIZ_UI_TEXT.next
    showQuizProgressActions()
    replayButton.disabled = false
    nextButton.disabled = true
    hideAnswerFeedback()
    hideResult()
    playCurrentAudio()
    updateCostumeHintText()
    updateProficiencyText()

    if (currentMode === QUIZ_MODE_MULTIPLE_CHOICE) {
      setHidden(choicesRoot, false)
      setHidden(nameAnswerForm, true)
      hideNameSuggestions()
      const choices = buildChoices(currentAnswer, available)
      choices.forEach((name) => usedChoiceNames.add(name))
      choices.forEach((name) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'quiz-choice-button'
        button.dataset.choiceName = name
        const image = document.createElement('img')
        image.src = imageUrlForName(name)
        image.alt = ''
        image.onerror = () => {
          image.src = DEFAULT_IMAGE
        }
        const label = document.createElement('span')
        label.textContent = name
        button.append(image, label)
        button.addEventListener('click', () => {
          if (hasAnsweredCurrentQuestion) {
            playAnyClipForName(name)
            return
          }
          const isCorrect = name === currentAnswer
          finalizeAnswer(name, isCorrect)
          choicesRoot
            .querySelectorAll<HTMLButtonElement>('button')
            .forEach((choiceButton) => {
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
    setHidden(choicesRoot, true)
    setHidden(nameAnswerForm, false)
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
      statusText.textContent = QUIZ_UI_TEXT.startValidationNeedOneCandidate
      return false
    }
    if (currentMode === QUIZ_MODE_MULTIPLE_CHOICE && activeNames.length < 4) {
      statusText.textContent = QUIZ_UI_TEXT.startValidationNeedFourCandidates
      return false
    }
    usedChoiceNames = new Set()
    currentAnswer = ''
    currentQuestionClip = null
    score = 0
    questionNumber = 0
    resultEntries = []
    shouldShowCurrentAnswerStats = false
    awaitingResult = false
    hideAnswerFeedback()
    hideResult()
    showQuizProgressActions()
    nextButton.textContent = QUIZ_UI_TEXT.next
    nextButton.disabled = true
    setQuizRunning(true)
    startButton.textContent = QUIZ_UI_TEXT.restart
    renderQuestion()
    return true
  }

  startButton.addEventListener('click', startQuiz)

  answerImage?.addEventListener('click', () => {
    if (!answerFeedback || answerFeedback.hidden) return
    if (!currentAnswer) return
    if (currentQuestionClip) {
      playClip(currentQuestionClip)
      return
    }
    playAnyClipForName(currentAnswer)
  })

  resultPerfectStamp?.addEventListener('click', playKokonaAudio)
  resultPerfectMessage?.addEventListener('click', playKokonaAudio)

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
    const shouldMove = window.confirm(QUIZ_UI_TEXT.pageLeaveConfirm)
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
  quizModeGroup.addEventListener('click', (event) => {
    if (event.detail === 0) {
      return
    }
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }
    target
      .closest('label.para')
      ?.querySelector<HTMLInputElement>('.radio-input')
      ?.blur()
  })
  quizModeGroup.addEventListener('change', () => {
    updateModeUI()
    refreshFilterState()
    statusText.textContent = QUIZ_UI_TEXT.modeChanged
  })
  ;[normalFilter, costumeFilter, collaborationFilter].forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      refreshFilterState()
      statusText.textContent = QUIZ_UI_TEXT.candidateFilterChanged
    })
  })
  oldGenerationCheckbox?.addEventListener('change', () => {
    statusText.textContent = QUIZ_UI_TEXT.audioVersionChanged
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
  nameAnswerInput?.addEventListener('compositionupdate', () => {
    showNameSuggestions()
  })
  nameAnswerInput?.addEventListener('compositionend', () => {
    showNameSuggestions()
  })
  nameAnswerInput?.addEventListener('input', () => {
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
  void progressPanel.pullOnStartup()
}
