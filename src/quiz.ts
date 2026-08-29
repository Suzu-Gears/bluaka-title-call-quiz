import { formatImageKey } from '@/lib/assetKeys'
import { resolveAssetUrl } from '@/lib/assetPath'
import type { QuestionPlan } from '@/lib/challengePlan'
import type { QuizEntry, TitleCallClip } from '@/lib/interfaces'
import { buildChoices, shuffleArray } from '@/lib/quizEngine'
import type { ProficiencyMap } from '@/lib/quizProgress'
import {
  applyAnswerToEntry,
  buildNameInputSuggestions,
  calculateAccuracy,
  filterCandidates,
  mergeWithStudents,
  normalizeProficiencyMap,
  normalizeQuizAnswer,
  resolveMultipleChoiceMaxQuestions,
  selectLearningTargets,
  selectReviewTargets,
  summarizeQuizResults,
} from '@/lib/quizProgress'
import { readStorageJson, writeStorage } from '@/lib/safeStorage'
import { pickRandomClip, selectPlayableClips } from '@/lib/titleCallClips'
import { loadQuizSetupSettings, saveQuizSetupSettings } from '@/lib/uiSettings'
import { setHidden } from '@/lib/uiState'
import {
  formatAnswerClipLabel,
  formatAnswerResultStatus,
  formatClearRate,
  formatMatchInstruction,
  formatQuizFinishedStatus,
  formatQuizQuestionStatus,
  formatResultEntryCorrectAnswer,
  formatResultEntryStatus,
  formatResultEntryUserAnswer,
  formatResultSummary,
  formatReviewTargetCount,
  PROGRESS_UI_TEXT,
  QUIZ_DRAW_MODE_DESCRIPTION,
  QUIZ_MODE_DESCRIPTION,
  QUIZ_UI_TEXT,
} from '@/lib/uiText'
import { setupProgressPanel } from '@/progressPanel'
import { setupQuizEditor } from '@/quizEditorUi'
import { setupQuizQuestionCountControl } from '@/quizQuestionCountControl'
import {
  setupQuizShare,
  type ChallengeDefinition,
  type QuizShareController,
} from '@/quizShareUi'
import './quizModeControl.css'

const DEFAULT_IMAGE = resolveAssetUrl('default-student-image.webp')
const QUIZ_MODE_MULTIPLE_CHOICE = 'multiple-choice'
const QUIZ_MODE_NAME_INPUT = 'name-input'
const QUIZ_MODE_NAME_INPUT_LUNATIC = 'name-input-lunatic'
const QUIZ_DRAW_MODE_RANDOM = 'random'
const QUIZ_DRAW_MODE_LEARNING = 'learning'
const QUIZ_DRAW_MODE_REVIEW = 'review'
const MIN_NAME_SUGGESTION_OVERLAY_WIDTH = 220
const DEFAULT_QUESTION_COUNT = 10
const INITIAL_STATUS_TEXT = QUIZ_UI_TEXT.initialStatus
const STORAGE_KEY = 'bluaka-title-call-quiz2.proficiency.v1'

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
  const drawModeGroup = document.getElementById(
    'quiz-draw-mode-group',
  ) as HTMLElement | null
  const getDrawModeValue = () =>
    (
      drawModeGroup?.querySelector(
        'input[name="quiz-draw-mode"]:checked',
      ) as HTMLInputElement | null
    )?.value ?? QUIZ_DRAW_MODE_RANDOM
  const quizModeDescription = document.getElementById('quiz-mode-description')
  const drawModeDescription = document.getElementById(
    'quiz-draw-mode-description',
  )
  const drawModeStats = document.getElementById('quiz-draw-mode-stats')
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
  const menuContainer = menuButton?.closest<HTMLElement>('.quiz-menu') ?? null

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
  const matchRoot = document.getElementById('quiz-match')
  const matchInstruction = document.getElementById('quiz-match-instruction')
  const matchCards = document.getElementById('quiz-match-cards')
  const matchClipButtons = document.getElementById('quiz-match-clip-buttons')
  const matchSubmitButton = document.getElementById(
    'quiz-match-submit-button',
  ) as HTMLButtonElement | null
  const skipButton = document.getElementById(
    'quiz-skip-button',
  ) as HTMLButtonElement | null
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

  // 前回のクイズ設定(出題方式・出題対象・問題数)を復元する。
  // ここで DOM に反映しておけば、以降の初期化はそのまま復元後の値を読む。
  const savedSetup = loadQuizSetupSettings()
  if (savedSetup.mode !== undefined) {
    const validModes: string[] = [
      QUIZ_MODE_MULTIPLE_CHOICE,
      QUIZ_MODE_NAME_INPUT,
      QUIZ_MODE_NAME_INPUT_LUNATIC,
    ]
    if (validModes.includes(savedSetup.mode)) {
      const radio = quizModeGroup.querySelector<HTMLInputElement>(
        `input[name="quiz-mode"][value="${savedSetup.mode}"]`,
      )
      if (radio) {
        radio.checked = true
      }
    }
  }
  if (
    savedSetup.drawMode === QUIZ_DRAW_MODE_RANDOM ||
    savedSetup.drawMode === QUIZ_DRAW_MODE_LEARNING ||
    savedSetup.drawMode === QUIZ_DRAW_MODE_REVIEW
  ) {
    const radio = drawModeGroup?.querySelector<HTMLInputElement>(
      `input[name="quiz-draw-mode"][value="${savedSetup.drawMode}"]`,
    )
    if (radio) {
      radio.checked = true
    }
  }
  if (savedSetup.includeNormal !== undefined) {
    normalFilter.checked = savedSetup.includeNormal
  }
  if (savedSetup.includeCostume !== undefined) {
    costumeFilter.checked = savedSetup.includeCostume
  }
  if (savedSetup.includeCollaboration !== undefined) {
    collaborationFilter.checked = savedSetup.includeCollaboration
  }
  if (savedSetup.questionCount !== undefined) {
    questionCountInput.value = String(savedSetup.questionCount)
  }

  const persistQuizSetup = () => {
    const parsedCount = Number(questionCountInput.value)
    saveQuizSetupSettings({
      mode: getQuizModeValue(),
      drawMode: getDrawModeValue(),
      includeNormal: normalFilter.checked,
      includeCostume: costumeFilter.checked,
      includeCollaboration: collaborationFilter.checked,
      questionCount:
        Number.isFinite(parsedCount) && parsedCount >= 1
          ? Math.floor(parsedCount)
          : DEFAULT_QUESTION_COUNT,
    })
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
  let currentDrawMode = getDrawModeValue()
  /** 学習・復習モードで今回のラウンドに出題する生徒(先頭から順に出す)。 */
  let roundQueue: string[] = []
  /**
   * 直近の出題で 1 問目になった生徒(新しい順)。
   * 母数が 142 人(通常生徒)しかないため一様抽選でも連続一致は 1/142 で起き、
   * リスタートを繰り返すと体感的に頻発する。1 問目だけ直近ぶんを避ける。
   */
  let recentFirstAnswers: string[] = []
  let learningPoolNames: string[] = []
  let reviewPoolNames: string[] = []
  let shouldShowCurrentAnswerStats = false
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
  /** 回答直後の連打で選択肢の音声再生が誤発火しないようにするための時刻。 */
  let lastAnswerAt = 0
  /** 共有URLから読み込んだ挑戦状。挑戦中のみ設定される。 */
  let activeChallenge: ChallengeDefinition | null = null
  /** 挑戦状の残り出題プラン(先頭から順に消化する)。 */
  let challengeQueue: QuestionPlan[] = []
  let shareController: QuizShareController | null = null
  // --- マッチング問題の状態 ---
  /** 表示するカードの生徒名(作成順)。 */
  let matchEntryNames: string[] = []
  /** 再生する音声(シャッフル済み)と、その正解カード。 */
  let matchClips: { ownerName: string; clip: TitleCallClip | null }[] = []
  /** 音声ごとの割り当て先カード名。null は未割り当て。 */
  let matchAssignments: (string | null)[] = []
  /** いま再生・割り当て対象になっている音声のスロット。 */
  let matchActiveSlot = 0
  let matchGraded = false
  // 100点満点のときにしか鳴らさないので、再生時まで取得を遅らせる。
  const kokonaAudio: HTMLAudioElement = new Audio()
  kokonaAudio.preload = 'none'
  kokonaAudio.src = resolveAssetUrl('kokona-hanamaru.mp3')
  const allCandidateNames = new Set(Object.values(candidateGroups).flat())
  const sortedCandidateNames = [...allCandidateNames].sort((a, b) =>
    a.localeCompare(b, 'ja'),
  )

  // クイズは常に最新世代のみを出題する(旧声優版などはカード一覧でのみ聴ける)。
  const clipsForName = (name: string): TitleCallClip[] =>
    selectPlayableClips(entryByName.get(name)?.TitleCalls ?? [])

  const imageUrlForName = (name: string): string => {
    const entry = entryByName.get(name)
    return entry
      ? resolveAssetUrl(formatImageKey(entry.PrimaryId))
      : DEFAULT_IMAGE
  }

  /** 流れたクリップの形態(シュエリンならシュエリン)の画像を出す。 */
  const imageUrlForClip = (
    clip: TitleCallClip | null,
    fallbackName: string,
  ): string =>
    clip
      ? resolveAssetUrl(formatImageKey(clip.ownerId))
      : imageUrlForName(fallbackName)

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
      setHidden(skipButton, true)
      setHidden(resultActions, true)
    }
    if (menuRestartButton) {
      menuRestartButton.disabled = !running
    }
    // 中身(リスタート・設定画面に戻る)は出題中とリザルトでしか意味がないので、
    // 設定画面ではメニューごと隠す
    setHidden(menuContainer, !running)
    if (!running) {
      setMenuOpen(false)
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
    proficiencyMap = mergeWithStudents(
      currentRaw !== null ? normalizeProficiencyMap(currentRaw) : {},
      allStudentNames,
    )
    saveProficiency()
  }

  const updateProficiencyText = () => {
    const entry = proficiencyMap[currentAnswer] ?? {
      correct: 0,
      attempts: 0,
      streak: 0,
    }
    const accuracy = calculateAccuracy(entry)
    proficiencyText.textContent =
      currentAnswer && shouldShowCurrentAnswerStats
        ? `${currentAnswer} の正答率: ${accuracy}% (${entry.correct}/${entry.attempts})`
        : ''
  }

  const recordAnswer = (studentName: string, isCorrect: boolean) => {
    proficiencyMap[studentName] = applyAnswerToEntry(
      proficiencyMap[studentName],
      isCorrect,
    )
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
      if (!isQuizRunning) {
        refreshFilterState()
      }
    },
    onOpen: () => setMenuOpen(false),
  })

  const getQuestionCountMax = () => {
    if (currentDrawMode === QUIZ_DRAW_MODE_LEARNING) {
      return learningPoolNames.length
    }
    if (currentDrawMode === QUIZ_DRAW_MODE_REVIEW) {
      return reviewPoolNames.length
    }
    return currentMode === QUIZ_MODE_MULTIPLE_CHOICE
      ? resolveMultipleChoiceMaxQuestions(activeNames.length)
      : activeNames.length
  }

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
      // 表示中の検証エラーがあれば、設定を変えた時点で消す。
      statusText.textContent = ''
      persistQuizSetup()
    },
  })

  const updateModeUI = () => {
    currentMode = getQuizModeValue()
    currentDrawMode = getDrawModeValue()
    const isNameInputMode =
      currentMode === QUIZ_MODE_NAME_INPUT ||
      currentMode === QUIZ_MODE_NAME_INPUT_LUNATIC
    setHidden(choicesRoot, isNameInputMode)
    setHidden(nameAnswerForm, !isNameInputMode || !isQuizRunning)
    if (quizModeDescription) {
      quizModeDescription.textContent = QUIZ_MODE_DESCRIPTION[currentMode] ?? ''
    }
  }

  const drawModeRadio = (value: string) =>
    drawModeGroup?.querySelector<HTMLInputElement>(
      `input[name="quiz-draw-mode"][value="${value}"]`,
    )

  /**
   * 出題モードの選択肢・説明・攻略率を現在の出題対象と進捗から更新する。
   * 学習(未クリア)・復習(要復習)の対象がいないモードは選択肢ごと隠し、
   * 選択中のモードが消えた場合はランダムへ戻す。
   */
  const updateDrawModeInfo = () => {
    learningPoolNames = selectLearningTargets(activeNames, proficiencyMap)
    reviewPoolNames = selectReviewTargets(activeNames, proficiencyMap)

    const setOptionVisible = (value: string, visible: boolean) => {
      const label = drawModeRadio(value)?.closest('label')
      if (label instanceof HTMLElement) {
        setHidden(label, !visible)
      }
    }
    setOptionVisible(QUIZ_DRAW_MODE_LEARNING, learningPoolNames.length > 0)
    setOptionVisible(QUIZ_DRAW_MODE_REVIEW, reviewPoolNames.length > 0)

    const selected = getDrawModeValue()
    const isSelectable =
      selected === QUIZ_DRAW_MODE_LEARNING
        ? learningPoolNames.length > 0
        : selected === QUIZ_DRAW_MODE_REVIEW
          ? reviewPoolNames.length > 0
          : true
    if (!isSelectable) {
      const randomRadio = drawModeRadio(QUIZ_DRAW_MODE_RANDOM)
      if (randomRadio) {
        randomRadio.checked = true
      }
    }
    currentDrawMode = getDrawModeValue()

    if (drawModeDescription) {
      drawModeDescription.textContent =
        QUIZ_DRAW_MODE_DESCRIPTION[currentDrawMode] ?? ''
    }
    if (drawModeStats) {
      const clearedCount = activeNames.length - learningPoolNames.length
      drawModeStats.textContent =
        currentDrawMode === QUIZ_DRAW_MODE_LEARNING
          ? formatClearRate(clearedCount, activeNames.length)
          : currentDrawMode === QUIZ_DRAW_MODE_REVIEW
            ? formatReviewTargetCount(
                reviewPoolNames.length,
                activeNames.length,
              )
            : ''
    }
  }

  const updateCostumeHintText = () => {
    costumeHintText.textContent = ''
  }

  const refreshFilterState = () => {
    activeNames = getCandidateNames()
    updateDrawModeInfo()
    const maxQuestions = getQuestionCountMax()
    questionCountControl.updateRange(maxQuestions)
    totalQuestions = questionCountControl.getSelectedQuestionCount(maxQuestions)
    // 出題対象が空のときは開始できない(押しても始まらないボタンを出さない)
    startButton.disabled = activeNames.length === 0
  }

  /** 矢印キーで選択中の候補。-1 は未選択(Enter は通常送信になる)。 */
  let highlightedSuggestionIndex = -1

  const getSuggestionButtons = (): HTMLButtonElement[] =>
    nameAnswerSuggestions
      ? [
          ...nameAnswerSuggestions.querySelectorAll<HTMLButtonElement>(
            '.quiz-name-answer-suggestion',
          ),
        ]
      : []

  const applySuggestionHighlight = () => {
    const buttons = getSuggestionButtons()
    buttons.forEach((button, index) => {
      button.classList.toggle(
        'is-highlighted',
        index === highlightedSuggestionIndex,
      )
    })
    buttons[highlightedSuggestionIndex]?.scrollIntoView({ block: 'nearest' })
  }

  const moveSuggestionHighlight = (delta: number) => {
    const count = getSuggestionButtons().length
    if (count === 0) {
      return
    }
    highlightedSuggestionIndex =
      highlightedSuggestionIndex === -1
        ? delta > 0
          ? 0
          : count - 1
        : (highlightedSuggestionIndex + delta + count) % count
    applySuggestionHighlight()
  }

  const hideNameSuggestions = () => {
    highlightedSuggestionIndex = -1
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
    highlightedSuggestionIndex = -1
    matches.forEach((name) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'quiz-name-answer-suggestion'
      button.dataset.suggestionName = name
      // 同名で複数フォームを持つ生徒(シュン（水着）等)は全フォームの画像を並べる。
      const imageIds = entryByName.get(name)?.ImageIds ?? []
      const imageUrls =
        imageIds.length > 0
          ? imageIds.map((id) => resolveAssetUrl(formatImageKey(id)))
          : [imageUrlForName(name)]
      imageUrls.forEach((url) => {
        const image = document.createElement('img')
        image.src = url
        image.alt = name
        image.onerror = () => {
          image.src = DEFAULT_IMAGE
        }
        button.appendChild(image)
      })
      const label = document.createElement('span')
      label.textContent = name
      button.appendChild(label)
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

  const stopKokonaAudio = () => {
    if (kokonaAudioTimer !== null) {
      window.clearTimeout(kokonaAudioTimer)
      kokonaAudioTimer = null
    }
    kokonaAudio.pause()
    kokonaAudio.currentTime = 0
  }

  const updateAnswerFeedback = (name: string) => {
    if (!answerFeedback || !answerImage || !answerName || !name) return
    answerImage.src = imageUrlForClip(currentQuestionClip, name)
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
    shareController?.hideResultShare()
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
    setHidden(skipButton, hasAnsweredCurrentQuestion)
    setHidden(resultActions, true)
  }

  const showResultActions = () => {
    setHidden(nextButton, true)
    setHidden(replayButton, true)
    setHidden(skipButton, true)
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
      image.src = imageUrlForClip(entry.clip, entry.correctAnswer)
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
    stopKokonaAudio()
    if (activeChallenge) {
      activeChallenge = null
      challengeQueue = []
      // 問題ごとに切り替えていた回答方式をユーザーのラジオ選択へ戻す。
      updateModeUI()
    }
    setHidden(matchRoot, true)
    shareController?.hideResultShare()
    usedChoiceNames = new Set()
    currentAnswer = ''
    currentQuestionClip = null
    questionNumber = 0
    roundQueue = []
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
    // 直前のラウンドの成績で攻略率・学習/復習の選択肢を更新する
    refreshFilterState()
    statusText.textContent = INITIAL_STATUS_TEXT
    setHidden(nextButton, true)
    setHidden(replayButton, true)
    setHidden(skipButton, true)
    setHidden(resultActions, true)
    nextButton.textContent = QUIZ_UI_TEXT.next
    replayButton.disabled = true
    nextButton.disabled = true
    startButton.textContent = QUIZ_UI_TEXT.start
    setQuizRunning(false)
    setMenuOpen(false)
  }

  const hasRemainingQuestions = () =>
    activeChallenge
      ? challengeQueue.length > 0
      : isPoolDrawMode()
        ? roundQueue.length > 0
        : questionNumber < totalQuestions

  /** 回答確定後のボタン状態(次へ/リザルト・聴き直し)を整える。全形式で共通。 */
  const finishCurrentQuestion = () => {
    hasAnsweredCurrentQuestion = true
    lastAnswerAt = Date.now()
    awaitingResult = !hasRemainingQuestions()
    nextButton.textContent = awaitingResult
      ? QUIZ_UI_TEXT.result
      : QUIZ_UI_TEXT.next
    replayButton.disabled = awaitingResult
    setHidden(replayButton, awaitingResult)
    setHidden(skipButton, true)
    setHidden(nextButton, false)
    nextButton.disabled = false
  }

  const finalizeAnswer = (userAnswer: string, isCorrect: boolean) => {
    resultEntries.push({
      questionNumber,
      correctAnswer: currentAnswer,
      userAnswer,
      isCorrect,
      clip: currentQuestionClip,
    })
    shouldShowCurrentAnswerStats = true
    recordAnswer(currentAnswer, isCorrect)
    statusText.textContent = formatAnswerResultStatus(isCorrect, currentAnswer)
    // 4択は選択肢に正解の画像が既にあり緑色で示されるので、
    // フィードバック画像は名前入力系モードのときだけ出す。
    if (currentMode !== QUIZ_MODE_MULTIPLE_CHOICE) {
      updateAnswerFeedback(currentAnswer)
    }
    finishCurrentQuestion()
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
    setHidden(matchRoot, true)
    hideNameSuggestions()
    statusText.textContent = formatQuizFinishedStatus(
      summarizeQuizResults(resultEntries).correctCount,
      questionNumber,
    )
    startButton.textContent = QUIZ_UI_TEXT.playAgain
    hideAnswerFeedback()
    renderResult()
    const { correctCount, totalCount } = summarizeQuizResults(resultEntries)
    shareController?.showResultShare({
      correctCount,
      totalCount,
      challenge: activeChallenge,
      entries: resultEntries.map((entry) => ({
        questionNumber: entry.questionNumber,
        correctLabel: formatResultEntryCorrectAnswer(entry.correctAnswer),
        answerLabel: formatResultEntryUserAnswer(entry.userAnswer),
        isCorrect: entry.isCorrect,
        imageUrl: imageUrlForClip(entry.clip, entry.correctAnswer),
      })),
    })
    showResultActions()
    updateCostumeHintText()
    updateProficiencyText()
    // クラウド同期は 1 回のクイズが終わったタイミングだけに絞る。
    progressPanel.pushInBackground()
  }

  const isPoolDrawMode = () =>
    currentDrawMode === QUIZ_DRAW_MODE_LEARNING ||
    currentDrawMode === QUIZ_DRAW_MODE_REVIEW

  /** 直近何回ぶんの 1 問目を避けるか。 */
  const RECENT_FIRST_ANSWER_LIMIT = 2

  /**
   * 1 問目の抽選から直近の 1 問目を外した候補を返す。
   *
   * 母数が小さいと全部外れて選択の余地が無くなり、毎回同じ順序で巡回する
   * だけになってしまう(3 人だと完全な 3 周期になる)。候補が 2 件を
   * 下回らない範囲でだけ外し、足りなければ古いものから諦める。
   * 選択肢に使う候補は減らさないこと(4 択は 4 人必要なため)。
   */
  const excludeRecentFirstAnswers = (
    names: readonly string[],
  ): readonly string[] => {
    let excluded = recentFirstAnswers
    let remaining = names.filter((name) => !excluded.includes(name))
    while (remaining.length < 2 && excluded.length > 0) {
      excluded = excluded.slice(0, -1)
      remaining = names.filter((name) => !excluded.includes(name))
    }
    return remaining.length > 0 ? remaining : names
  }

  const rememberFirstAnswer = (name: string) => {
    recentFirstAnswers = [
      name,
      ...recentFirstAnswers.filter((value) => value !== name),
    ].slice(0, RECENT_FIRST_ANSWER_LIMIT)
  }

  /** 問題の種類によらない出題時の共通処理(問番号・ボタン状態・表示リセット)。 */
  const prepareQuestionView = () => {
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
    updateCostumeHintText()
    updateProficiencyText()
  }

  const renderChoiceButtons = (choices: readonly string[]) => {
    setHidden(choicesRoot, false)
    setHidden(nameAnswerForm, true)
    hideNameSuggestions()
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
          // 回答確定直後のダブルタップを聴き直し操作として扱わない。
          if (Date.now() - lastAnswerAt < 350) {
            return
          }
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
  }

  const showNameInputForm = () => {
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

  // --- マッチング問題 -------------------------------------------------------

  /** matchActiveSlot 以降で最初の未割り当てスロット。無ければ -1。 */
  const nextUnassignedMatchSlot = () => {
    const total = matchAssignments.length
    for (let offset = 1; offset <= total; offset++) {
      const slot = (matchActiveSlot + offset) % total
      if (matchAssignments[slot] === null) {
        return slot
      }
    }
    return matchAssignments[matchActiveSlot] === null ? matchActiveSlot : -1
  }

  const updateMatchCards = () => {
    matchCards
      ?.querySelectorAll<HTMLButtonElement>('button')
      .forEach((button) => {
        const name = button.dataset.matchName ?? ''
        const assignedIndex = matchAssignments.indexOf(name)
        const badge = button.querySelector('.quiz-match-badge')
        if (badge) {
          badge.textContent = assignedIndex >= 0 ? `♪${assignedIndex + 1}` : ''
        }
        button.classList.toggle('is-assigned', assignedIndex >= 0)
      })
    matchClipButtons
      ?.querySelectorAll<HTMLButtonElement>('button')
      .forEach((button, index) => {
        button.classList.toggle(
          'is-active',
          !matchGraded && index === matchActiveSlot,
        )
        button.classList.toggle(
          'is-assigned',
          !matchGraded && matchAssignments[index] !== null,
        )
      })
    if (matchSubmitButton && !matchGraded) {
      matchSubmitButton.disabled = matchAssignments.some(
        (assigned) => assigned === null,
      )
    }
  }

  /** ♪スロットを選択して再生する。番号ボタン・カード操作の両方から使う。 */
  const selectMatchSlot = (slot: number) => {
    matchActiveSlot = slot
    currentQuestionClip = matchClips[slot].clip
    if (matchInstruction) {
      matchInstruction.textContent = matchAssignments.some(
        (assigned) => assigned === null,
      )
        ? formatMatchInstruction(slot + 1, matchClips.length)
        : QUIZ_UI_TEXT.matchAllAssignedInstruction
    }
    updateMatchCards()
    playCurrentAudio()
  }

  const gradeMatchQuestion = () => {
    matchGraded = true
    stopAudio()
    let allCorrect = true
    const wrongPairs: string[] = []
    matchClips.forEach((item, index) => {
      const assigned = matchAssignments[index]
      const isPairCorrect = assigned === item.ownerName
      if (!isPairCorrect) {
        allCorrect = false
        wrongPairs.push(
          `♪${index + 1} ${item.ownerName}（回答: ${assigned ?? QUIZ_UI_TEXT.unanswered}）`,
        )
      }
      // 習熟度はペアごとの正誤で記録する(設計書 §4-4)。
      recordAnswer(item.ownerName, isPairCorrect)
    })
    matchCards
      ?.querySelectorAll<HTMLButtonElement>('button')
      .forEach((button) => {
        const name = button.dataset.matchName ?? ''
        const correctIndex = matchClips.findIndex(
          (item) => item.ownerName === name,
        )
        const badge = button.querySelector('.quiz-match-badge')
        if (badge) {
          badge.textContent = `♪${correctIndex + 1}`
        }
        button.classList.remove('is-assigned')
        button.classList.add(
          matchAssignments.indexOf(name) === correctIndex
            ? 'correct'
            : 'wrong-selected',
        )
      })
    matchClipButtons
      ?.querySelectorAll<HTMLButtonElement>('button')
      .forEach((button) => {
        button.classList.remove('is-active', 'is-assigned')
      })
    if (matchSubmitButton) {
      matchSubmitButton.disabled = true
    }
    setHidden(matchSubmitButton, true)
    if (matchInstruction) {
      matchInstruction.textContent = QUIZ_UI_TEXT.matchGradedInstruction
    }
    const answerLabel = matchEntryNames.join(' / ')
    resultEntries.push({
      questionNumber,
      correctAnswer: answerLabel,
      userAnswer: allCorrect
        ? QUIZ_UI_TEXT.matchAllPairsCorrect
        : wrongPairs.join('、'),
      isCorrect: allCorrect,
      // 連結名では画像を解決できずグレーになるため、1本目のクリップを持たせて
      // リザルトで形態の画像表示と聴き直しを効かせる。
      clip: matchClips[0]?.clip ?? null,
    })
    statusText.textContent = formatAnswerResultStatus(allCorrect, answerLabel)
    finishCurrentQuestion()
  }

  const onMatchCardTap = (name: string) => {
    if (matchGraded) {
      // 答え合わせ後はカードの正解音声を聴き直せる。
      const pair = matchClips.find((item) => item.ownerName === name)
      if (pair?.clip) {
        playClip(pair.clip)
      }
      return
    }
    const assignedIndex = matchAssignments.indexOf(name)
    if (assignedIndex >= 0) {
      // 割り当て済みカードをタップで解除し、その音声を選択し直す。
      matchAssignments[assignedIndex] = null
      selectMatchSlot(assignedIndex)
      return
    }
    matchAssignments[matchActiveSlot] = name
    const next = nextUnassignedMatchSlot()
    if (next >= 0) {
      selectMatchSlot(next)
    } else {
      // 全部割り当て済み。自動では送信せず「回答する」を待つ。
      if (matchInstruction) {
        matchInstruction.textContent = QUIZ_UI_TEXT.matchAllAssignedInstruction
      }
      updateMatchCards()
    }
  }

  const renderMatchQuestion = (
    plan: Extract<QuestionPlan, { kind: 'match' }>,
  ) => {
    matchEntryNames = plan.entryNames
    matchClips = shuffleArray(plan.entryNames).map((name) => ({
      ownerName: name,
      clip: pickRandomClip(clipsForName(name)),
    }))
    matchAssignments = matchClips.map(() => null)
    matchActiveSlot = 0
    matchGraded = false
    currentAnswer = ''
    prepareQuestionView()
    setHidden(choicesRoot, true)
    setHidden(nameAnswerForm, true)
    hideNameSuggestions()
    setHidden(matchRoot, false)
    setHidden(matchSubmitButton, false)
    if (matchSubmitButton) {
      matchSubmitButton.disabled = true
    }
    if (matchClipButtons) {
      matchClipButtons.innerHTML = ''
      matchClips.forEach((_, index) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'quiz-match-clip-button'
        button.textContent = `♪${index + 1}`
        // 番号タップで順番に関係なくその音声を聴ける(答え合わせ後も再生できる)。
        button.addEventListener('click', () => {
          if (matchGraded) {
            const clip = matchClips[index].clip
            if (clip) {
              playClip(clip)
            }
            return
          }
          selectMatchSlot(index)
        })
        matchClipButtons.appendChild(button)
      })
    }
    if (matchCards) {
      matchCards.innerHTML = ''
      matchEntryNames.forEach((name) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'quiz-choice-button quiz-match-card'
        button.dataset.matchName = name
        const image = document.createElement('img')
        image.src = imageUrlForName(name)
        image.alt = ''
        image.onerror = () => {
          image.src = DEFAULT_IMAGE
        }
        const label = document.createElement('span')
        label.textContent = name
        const badge = document.createElement('span')
        badge.className = 'quiz-match-badge'
        button.append(image, label, badge)
        button.addEventListener('click', () => onMatchCardTap(name))
        matchCards.appendChild(button)
      })
    }
    selectMatchSlot(0)
  }

  matchSubmitButton?.addEventListener('click', () => {
    if (matchGraded || matchAssignments.some((assigned) => assigned === null)) {
      return
    }
    gradeMatchQuestion()
  })

  // スキップも1回の回答として扱う(未回答=不正解で記録し、正解を見せて次へ)。
  skipButton?.addEventListener('click', () => {
    if (hasAnsweredCurrentQuestion || !isQuizRunning) {
      return
    }
    if (matchRoot && !matchRoot.hidden) {
      if (!matchGraded) {
        // 未割り当てのペアは不正解として、その場で答え合わせする。
        gradeMatchQuestion()
      }
      return
    }
    if (!currentAnswer) {
      return
    }
    const wasChoiceMode = currentMode === QUIZ_MODE_MULTIPLE_CHOICE
    finalizeAnswer('', false)
    if (wasChoiceMode) {
      // 正解した時の見た目(緑1枚)と区別できるよう、正解以外は誤答の赤にする。
      choicesRoot
        .querySelectorAll<HTMLButtonElement>('button')
        .forEach((choiceButton) => {
          choiceButton.classList.add(
            choiceButton.dataset.choiceName === currentAnswer
              ? 'correct'
              : 'wrong-selected',
          )
        })
    } else {
      if (nameAnswerInput) {
        nameAnswerInput.disabled = true
      }
      if (nameAnswerSubmit) {
        nameAnswerSubmit.disabled = true
      }
      hideNameSuggestions()
    }
  })

  /** 挑戦状の1問を、プランの形式(択一・入力・マッチ)に応じて出題する。 */
  const renderPlannedQuestion = (plan: QuestionPlan) => {
    if (plan.kind === 'match') {
      renderMatchQuestion(plan)
      return
    }
    // 回答方式は問題単位で切り替える(ラジオの選択は変更しない)。
    currentMode =
      plan.kind === 'choice'
        ? QUIZ_MODE_MULTIPLE_CHOICE
        : plan.lunatic
          ? QUIZ_MODE_NAME_INPUT_LUNATIC
          : QUIZ_MODE_NAME_INPUT
    currentAnswer = plan.answerName
    currentQuestionClip =
      plan.fixedClip ?? pickRandomClip(clipsForName(currentAnswer))
    prepareQuestionView()
    playCurrentAudio()
    if (plan.kind === 'choice') {
      // ランダム枠は挑むたびに全生徒から引き直す(正解・固定誤答とは重複させない)。
      const randomWrongs = shuffleArray(
        sortedCandidateNames.filter(
          (name) => name !== plan.answerName && !plan.wrongNames.includes(name),
        ),
      ).slice(0, plan.randomWrongCount)
      renderChoiceButtons(
        shuffleArray([plan.answerName, ...plan.wrongNames, ...randomWrongs]),
      )
      return
    }
    showNameInputForm()
  }

  const renderQuestion = () => {
    choicesRoot.innerHTML = ''
    setHidden(matchRoot, true)
    if (activeChallenge) {
      const plan = challengeQueue.shift()
      if (plan === undefined) {
        showResultScreen()
        return
      }
      renderPlannedQuestion(plan)
      return
    }
    // 4択の選択肢に使う候補。ランダムモードでは使用済みを除いた available、
    // 学習・復習モードでは全候補(選択肢としての再登場を許す)。
    let choicePool: readonly string[] = activeNames
    // prepareQuestionView() で加算されるため、抽選時点の 1 問目は 0。
    const isFirstQuestion = questionNumber === 0
    if (isPoolDrawMode()) {
      const nextAnswer = roundQueue.shift()
      if (nextAnswer === undefined) {
        showResultScreen()
        return
      }
      currentAnswer = nextAnswer
    } else {
      const available = activeNames.filter((name) => !usedChoiceNames.has(name))
      const minAvailable = currentMode === QUIZ_MODE_MULTIPLE_CHOICE ? 4 : 1
      if (available.length < minAvailable || questionNumber >= totalQuestions) {
        showResultScreen()
        return
      }
      // 答えの抽選だけ直近の 1 問目を避ける。choicePool は available のまま
      // 減らさない(4 択に必要な 4 人を割らないため)。
      const answerPool = isFirstQuestion
        ? excludeRecentFirstAnswers(available)
        : available
      currentAnswer = answerPool[Math.floor(Math.random() * answerPool.length)]
      choicePool = available
    }
    if (isFirstQuestion) {
      rememberFirstAnswer(currentAnswer)
    }
    currentQuestionClip = pickRandomClip(clipsForName(currentAnswer))
    prepareQuestionView()
    playCurrentAudio()

    if (currentMode === QUIZ_MODE_MULTIPLE_CHOICE) {
      const choices = buildChoices(currentAnswer, choicePool)
      if (!isPoolDrawMode()) {
        choices.forEach((name) => usedChoiceNames.add(name))
      }
      renderChoiceButtons(choices)
      return
    }

    if (!isPoolDrawMode()) {
      usedChoiceNames.add(currentAnswer)
    }
    showNameInputForm()
  }

  const startQuiz = () => {
    // 挑戦中のリスタートは同じ挑戦状をやり直す。
    if (activeChallenge) {
      startChallengeQuiz(activeChallenge)
      return true
    }
    // 届いていた挑戦状に乗らず普通に始めたら、バナーと共有URLハッシュを片付ける。
    shareController?.dismissPendingChallenge()
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
    questionNumber = 0
    resultEntries = []
    roundQueue = []
    if (isPoolDrawMode()) {
      const pool =
        currentDrawMode === QUIZ_DRAW_MODE_LEARNING
          ? learningPoolNames
          : reviewPoolNames
      roundQueue = shuffleArray(pool).slice(0, totalQuestions)
      // 先頭(1 問目)が直近の 1 問目と同じなら、そうでない要素と入れ替える。
      // 全部が直近と同じ場合(候補が極端に少ないとき)は何もしない。
      if (recentFirstAnswers.includes(roundQueue[0])) {
        const swapIndex = roundQueue.findIndex(
          (name) => !recentFirstAnswers.includes(name),
        )
        if (swapIndex > 0) {
          ;[roundQueue[0], roundQueue[swapIndex]] = [
            roundQueue[swapIndex],
            roundQueue[0],
          ]
        }
      }
    }
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

  /** 共有URLから読み込んだ挑戦状を、定義どおりの出題プランで開始する。 */
  const startChallengeQuiz = (challenge: ChallengeDefinition) => {
    stopAudio()
    stopKokonaAudio()
    // バナー・ハッシュは開始した時点で役目を終える(結果シェアは encoded から組み直す)。
    shareController?.dismissPendingChallenge()
    activeChallenge = challenge
    usedChoiceNames = new Set()
    currentAnswer = ''
    currentQuestionClip = null
    questionNumber = 0
    resultEntries = []
    roundQueue = []
    challengeQueue = challenge.shuffle
      ? shuffleArray(challenge.plans)
      : [...challenge.plans]
    totalQuestions = challengeQueue.length
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
    if (!isNavigatingToCardList) {
      return true
    }
    const isShowingResult = Boolean(resultSection && !resultSection.hidden)
    if (!isQuizRunning || isShowingResult) {
      // リザルトの聴き直しなど、クイズ側の音声を鳴らしたまま移動させない。
      stopAudio()
      stopKokonaAudio()
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
  const blurRadioOnPointerClick = (event: MouseEvent) => {
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
  }
  const handleModeGroupChange = () => {
    updateModeUI()
    refreshFilterState()
    statusText.textContent = ''
    persistQuizSetup()
  }
  ;[quizModeGroup, drawModeGroup].forEach((group) => {
    group?.addEventListener('click', blurRadioOnPointerClick)
    group?.addEventListener('change', handleModeGroupChange)
  })
  ;[normalFilter, costumeFilter, collaborationFilter].forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      refreshFilterState()
      statusText.textContent = ''
      persistQuizSetup()
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

  // 候補のキーボード操作: ↑↓で選択、Enterで入力欄へ反映(もう一度Enterで送信)。
  nameAnswerInput?.addEventListener('keydown', (event) => {
    if (currentMode !== QUIZ_MODE_NAME_INPUT) {
      return
    }
    // IME 変換中の Enter/矢印は変換操作なので触らない
    if (event.isComposing || event.keyCode === 229) {
      return
    }
    const suggestionsVisible = Boolean(
      nameAnswerSuggestionsOverlay && !nameAnswerSuggestionsOverlay.hidden,
    )
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!suggestionsVisible) {
        showNameSuggestions()
      }
      event.preventDefault()
      moveSuggestionHighlight(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'Enter') {
      if (!suggestionsVisible || highlightedSuggestionIndex === -1) {
        return
      }
      const selected = getSuggestionButtons()[highlightedSuggestionIndex]
      if (!selected) {
        return
      }
      // 1回目の Enter は候補の確定のみ。送信(form submit)はさせない。
      event.preventDefault()
      nameAnswerInput.value = selected.dataset.suggestionName ?? ''
      hideNameSuggestions()
      return
    }
    if (event.key === 'Escape' && suggestionsVisible) {
      event.preventDefault()
      hideNameSuggestions()
    }
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
  window.addEventListener('resize', positionNameSuggestionsOverlay)

  shareController = setupQuizShare({
    entries: playableEntries,
    onStartChallenge: startChallengeQuiz,
  })
  setupQuizEditor({
    entries: playableEntries,
    onStartChallenge: startChallengeQuiz,
  })

  loadProficiency()
  updateModeUI()
  refreshFilterState()
  setQuizRunning(false)
  void progressPanel.pullOnStartup()
}
