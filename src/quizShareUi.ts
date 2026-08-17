import { buildChallengePlans, type QuestionPlan } from '@/lib/challengePlan'
import type { QuizEntry } from '@/lib/interfaces'
import { normalizeQuizAnswer } from '@/lib/quizProgress'
import {
  buildResultShareText,
  buildSharedQuizUrl,
  buildTweetIntentUrl,
  decodeSharedQuizPayload,
  encodeSharedQuizPayload,
  extractSharedQuizParam,
  matchPastedStudentNames,
  SHARED_QUIZ_TITLE_MAX_LENGTH,
  SHARED_QUIZ_VERSION,
  type SharedQuizMode,
} from '@/lib/quizShare'
import { setHidden } from '@/lib/uiState'
import { QUIZ_SHARE_UI_TEXT } from '@/lib/uiText'

/** URL から復元し、手元のデータと突き合わせ済みの「挑戦状」。 */
export interface ChallengeDefinition {
  title: string
  author: string | null
  desc: string | null
  /** 出題プラン(手元のデータに存在し、音声があるもののみ)。 */
  plans: QuestionPlan[]
  /** true なら挑むたびに出題順をシャッフルする。 */
  shuffle: boolean
  skippedCount: number
  /** 形式の内訳(例: 択一6・マッチ3・入力1)。 */
  questionSummary: string
  /** 元のエンコード文字列。結果シェア時に同じ挑戦 URL を組み立て直すために保持。 */
  encoded: string
}

export interface QuizResultShareContext {
  correctCount: number
  totalCount: number
  challenge: ChallengeDefinition | null
}

interface QuizShareOptions {
  /** 音声を1本以上持つ出題可能な生徒。 */
  entries: readonly QuizEntry[]
  onStartChallenge: (challenge: ChallengeDefinition) => void
}

export interface QuizShareController {
  showResultShare: (context: QuizResultShareContext) => void
  hideResultShare: () => void
}

const pageUrl = (): string =>
  `${window.location.origin}${window.location.pathname}`

const clearShareHash = (): void => {
  // 再読み込みや共有時に同じ挑戦状が再表示されないようハッシュだけ消す。
  window.history.replaceState(null, '', pageUrl())
}

const switchToQuizView = (): void => {
  const button = document.querySelector<HTMLButtonElement>(
    '[data-view-target="quiz-view"]',
  )
  button?.click()
}

/** 結果画像(スクショ共有用のスコアカード)を canvas に描く。 */
const drawResultCard = (
  canvas: HTMLCanvasElement,
  context: QuizResultShareContext,
): boolean => {
  const width = 1200
  const height = 630
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return false
  }
  const fontFamily = "'Kosugi Maru', 'Hiragino Sans', sans-serif"

  const background = ctx.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, '#2f86d6')
  background.addColorStop(1, '#164a80')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  // 白いカード面
  const cardX = 60
  const cardY = 60
  const cardWidth = width - cardX * 2
  const cardHeight = height - cardY * 2
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)'
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 28)
  ctx.fill()

  ctx.textAlign = 'center'
  ctx.fillStyle = '#2f86d6'
  ctx.font = `bold 40px ${fontFamily}`
  ctx.fillText(QUIZ_SHARE_UI_TEXT.cardAppName, width / 2, cardY + 84)

  const title = context.challenge?.title
  if (title) {
    ctx.fillStyle = '#333333'
    ctx.font = `bold 44px ${fontFamily}`
    let displayTitle = `「${title}」`
    while (
      ctx.measureText(displayTitle).width > cardWidth - 80 &&
      displayTitle.length > 4
    ) {
      displayTitle = `「${displayTitle.slice(1, -2)}…」`
    }
    ctx.fillText(displayTitle, width / 2, cardY + 160)
  }

  const accuracy =
    context.totalCount > 0
      ? Math.round((context.correctCount / context.totalCount) * 100)
      : 0
  const isPerfect =
    context.totalCount > 0 && context.correctCount === context.totalCount

  ctx.fillStyle = isPerfect ? '#d6642f' : '#1f5e9c'
  ctx.font = `bold 128px ${fontFamily}`
  ctx.fillText(
    `${context.correctCount} / ${context.totalCount}`,
    width / 2,
    cardY + 330,
  )

  ctx.fillStyle = '#555555'
  ctx.font = `bold 44px ${fontFamily}`
  ctx.fillText(
    isPerfect
      ? QUIZ_SHARE_UI_TEXT.cardPerfect
      : `${QUIZ_SHARE_UI_TEXT.cardAccuracyPrefix}${accuracy}%`,
    width / 2,
    cardY + 410,
  )

  ctx.fillStyle = '#888888'
  ctx.font = `28px ${fontFamily}`
  ctx.fillText(window.location.host, width / 2, cardY + cardHeight - 40)
  return true
}

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })

export const setupQuizShare = (
  options: QuizShareOptions,
): QuizShareController => {
  const { entries, onStartChallenge } = options
  const entryById = new Map(entries.map((entry) => [entry.PrimaryId, entry]))
  const sortedEntries = [...entries].sort(
    (a, b) => a.DefaultOrder - b.DefaultOrder,
  )

  // --- クイズ作成ダイアログ ---
  const openButton = document.getElementById(
    'quiz-share-open-button',
  ) as HTMLButtonElement | null
  const dialog = document.getElementById(
    'quiz-share-dialog',
  ) as HTMLDialogElement | null
  const titleInput = document.getElementById(
    'quiz-share-title-input',
  ) as HTMLInputElement | null
  const modeSelect = document.getElementById(
    'quiz-share-mode-select',
  ) as HTMLSelectElement | null
  const searchInput = document.getElementById(
    'quiz-share-search-input',
  ) as HTMLInputElement | null
  const studentList = document.getElementById('quiz-share-student-list')
  const selectedCountText = document.getElementById('quiz-share-selected-count')
  const selectVisibleButton = document.getElementById(
    'quiz-share-select-visible-button',
  ) as HTMLButtonElement | null
  const clearButton = document.getElementById(
    'quiz-share-clear-button',
  ) as HTMLButtonElement | null
  const pasteTextarea = document.getElementById(
    'quiz-share-paste-textarea',
  ) as HTMLTextAreaElement | null
  const pasteApplyButton = document.getElementById(
    'quiz-share-paste-apply-button',
  ) as HTMLButtonElement | null
  const generateButton = document.getElementById(
    'quiz-share-generate-button',
  ) as HTMLButtonElement | null
  const urlOutput = document.getElementById(
    'quiz-share-url-output',
  ) as HTMLInputElement | null
  const urlActions = document.getElementById('quiz-share-url-actions')
  const copyButton = document.getElementById(
    'quiz-share-copy-button',
  ) as HTMLButtonElement | null
  const tweetButton = document.getElementById(
    'quiz-share-tweet-button',
  ) as HTMLButtonElement | null
  const shareStatus = document.getElementById('quiz-share-status')
  const closeButton = document.getElementById(
    'quiz-share-close-button',
  ) as HTMLButtonElement | null

  const selectedNames = new Set<string>()

  const setShareStatus = (message: string) => {
    if (shareStatus) {
      shareStatus.textContent = message
    }
  }

  const updateSelectedCount = () => {
    if (selectedCountText) {
      selectedCountText.textContent = `${selectedNames.size}${QUIZ_SHARE_UI_TEXT.selectedCountSuffix}`
    }
  }

  const checkboxByName = new Map<string, HTMLInputElement>()

  const renderStudentList = () => {
    if (!studentList) {
      return
    }
    studentList.innerHTML = ''
    checkboxByName.clear()
    sortedEntries.forEach((entry) => {
      const label = document.createElement('label')
      label.className = 'quiz-share-student-item'
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.checked = selectedNames.has(entry.Name)
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectedNames.add(entry.Name)
        } else {
          selectedNames.delete(entry.Name)
        }
        updateSelectedCount()
      })
      const nameText = document.createElement('span')
      nameText.textContent = entry.Name
      label.append(checkbox, nameText)
      label.dataset.studentName = entry.Name
      studentList.appendChild(label)
      checkboxByName.set(entry.Name, checkbox)
    })
  }

  const applySearchFilter = () => {
    if (!studentList) {
      return
    }
    const query = normalizeQuizAnswer(searchInput?.value ?? '')
    studentList
      .querySelectorAll<HTMLElement>('.quiz-share-student-item')
      .forEach((item) => {
        const name = item.dataset.studentName ?? ''
        setHidden(
          item,
          query.length > 0 && !normalizeQuizAnswer(name).includes(query),
        )
      })
  }

  const syncCheckboxes = () => {
    checkboxByName.forEach((checkbox, name) => {
      checkbox.checked = selectedNames.has(name)
    })
    updateSelectedCount()
  }

  const resetUrlOutput = () => {
    if (urlOutput) {
      urlOutput.value = ''
    }
    setHidden(urlOutput, true)
    setHidden(urlActions, true)
  }

  openButton?.addEventListener('click', () => {
    if (!dialog) {
      return
    }
    renderStudentList()
    applySearchFilter()
    updateSelectedCount()
    setShareStatus('')
    resetUrlOutput()
    dialog.showModal()
    dialog.scrollTop = 0
  })
  closeButton?.addEventListener('click', () => dialog?.close())

  searchInput?.addEventListener('input', applySearchFilter)

  selectVisibleButton?.addEventListener('click', () => {
    studentList
      ?.querySelectorAll<HTMLElement>('.quiz-share-student-item')
      .forEach((item) => {
        if (!item.hidden && item.dataset.studentName) {
          selectedNames.add(item.dataset.studentName)
        }
      })
    syncCheckboxes()
  })

  clearButton?.addEventListener('click', () => {
    selectedNames.clear()
    syncCheckboxes()
  })

  pasteApplyButton?.addEventListener('click', () => {
    const text = pasteTextarea?.value ?? ''
    if (!text.trim()) {
      setShareStatus(QUIZ_SHARE_UI_TEXT.pasteEmpty)
      return
    }
    const { matched, unmatched } = matchPastedStudentNames(
      text,
      sortedEntries.map((entry) => entry.Name),
    )
    matched.forEach((name) => selectedNames.add(name))
    syncCheckboxes()
    setShareStatus(
      unmatched.length > 0
        ? `${matched.length}${QUIZ_SHARE_UI_TEXT.pasteMatchedSuffix} / ${QUIZ_SHARE_UI_TEXT.pasteUnmatchedPrefix}: ${unmatched.slice(0, 5).join('、')}${unmatched.length > 5 ? ' ほか' : ''}`
        : `${matched.length}${QUIZ_SHARE_UI_TEXT.pasteMatchedSuffix}`,
    )
  })

  generateButton?.addEventListener('click', () => {
    if (selectedNames.size === 0) {
      setShareStatus(QUIZ_SHARE_UI_TEXT.generateNeedsSelection)
      return
    }
    const nameToId = new Map(
      sortedEntries.map((entry) => [entry.Name, entry.PrimaryId]),
    )
    const ids = [...selectedNames]
      .map((name) => nameToId.get(name))
      .filter((id): id is number => id !== undefined)
    const modeValue = modeSelect?.value
    const mode: SharedQuizMode =
      modeValue === 'name-input' || modeValue === 'name-input-lunatic'
        ? modeValue
        : 'multiple-choice'
    void encodeSharedQuizPayload({
      v: SHARED_QUIZ_VERSION,
      title: (titleInput?.value ?? '')
        .trim()
        .slice(0, SHARED_QUIZ_TITLE_MAX_LENGTH),
      mode,
      ids,
    })
      .then((encoded) => {
        const url = buildSharedQuizUrl(pageUrl(), encoded)
        if (urlOutput) {
          urlOutput.value = url
        }
        setHidden(urlOutput, false)
        setHidden(urlActions, false)
        setShareStatus(QUIZ_SHARE_UI_TEXT.generateSucceeded)
      })
      .catch(() => {
        setShareStatus(QUIZ_SHARE_UI_TEXT.generateFailed)
      })
  })

  copyButton?.addEventListener('click', () => {
    const url = urlOutput?.value
    if (!url) {
      return
    }
    navigator.clipboard
      .writeText(url)
      .then(() => setShareStatus(QUIZ_SHARE_UI_TEXT.copySucceeded))
      .catch(() => {
        // クリップボードが使えない環境では選択して手動コピーしてもらう。
        urlOutput?.select()
        setShareStatus(QUIZ_SHARE_UI_TEXT.copyFailed)
      })
  })

  tweetButton?.addEventListener('click', () => {
    const url = urlOutput?.value
    if (!url) {
      return
    }
    const title = (titleInput?.value ?? '').trim()
    const text = `${title ? `「${title}」` : QUIZ_SHARE_UI_TEXT.tweetDefaultQuizName}${QUIZ_SHARE_UI_TEXT.tweetInviteSuffix}\n${url}`
    window.open(buildTweetIntentUrl(text), '_blank', 'noopener')
  })

  // --- 挑戦状バナー(URL からのインポート) ---
  const banner = document.getElementById('quiz-challenge-banner')
  const bannerText = document.getElementById('quiz-challenge-banner-text')
  const bannerStartButton = document.getElementById(
    'quiz-challenge-start-button',
  ) as HTMLButtonElement | null
  const bannerDismissButton = document.getElementById(
    'quiz-challenge-dismiss-button',
  ) as HTMLButtonElement | null

  let pendingChallenge: ChallengeDefinition | null = null

  const hideBanner = () => {
    setHidden(banner, true)
  }

  const showChallengeBanner = (challenge: ChallengeDefinition) => {
    pendingChallenge = challenge
    if (bannerText) {
      const title = challenge.title || QUIZ_SHARE_UI_TEXT.tweetDefaultQuizName
      const lines = [
        `「${title}」(全${challenge.plans.length}問・${challenge.questionSummary})${QUIZ_SHARE_UI_TEXT.challengeArrivedSuffix}`,
      ]
      if (challenge.author) {
        lines.push(
          `${QUIZ_SHARE_UI_TEXT.challengeAuthorPrefix}${challenge.author}`,
        )
      }
      if (challenge.desc) {
        lines.push(challenge.desc)
      }
      if (challenge.skippedCount > 0) {
        lines.push(
          `※${challenge.skippedCount}${QUIZ_SHARE_UI_TEXT.challengeSkippedSuffix}`,
        )
      }
      bannerText.textContent = lines.join('\n')
    }
    setHidden(banner, false)
    switchToQuizView()
  }

  bannerStartButton?.addEventListener('click', () => {
    if (!pendingChallenge) {
      return
    }
    hideBanner()
    onStartChallenge(pendingChallenge)
  })
  bannerDismissButton?.addEventListener('click', () => {
    pendingChallenge = null
    hideBanner()
    clearShareHash()
  })

  /**
   * エンコード文字列を検証して挑戦状バナーを出す。
   * 成功なら null、失敗なら利用者向けのエラーメッセージを返す。
   */
  const importEncodedChallenge = async (
    encoded: string,
  ): Promise<string | null> => {
    const payload = await decodeSharedQuizPayload(encoded)
    if (!payload) {
      return QUIZ_SHARE_UI_TEXT.importBrokenUrl
    }
    const { plans, skippedCount, questionSummary } = buildChallengePlans(
      payload,
      entryById,
    )
    if (plans.length === 0) {
      return QUIZ_SHARE_UI_TEXT.importNoPlayableStudents
    }
    showChallengeBanner({
      title: payload.title,
      author: payload.v === 2 ? (payload.author ?? null) : null,
      desc: payload.v === 2 ? (payload.desc ?? null) : null,
      plans,
      // v1 は従来どおり毎回シャッフル。v2 は作者の指定に従う。
      shuffle: payload.v === 2 ? payload.shuffle === true : true,
      skippedCount,
      questionSummary,
      encoded,
    })
    return null
  }

  const importFromLocation = async () => {
    const encoded = extractSharedQuizParam(window.location.hash)
    if (!encoded) {
      return
    }
    const error = await importEncodedChallenge(encoded)
    if (error) {
      setShareStatus('')
      window.alert(error)
      clearShareHash()
    }
  }
  void importFromLocation()
  // 開いているタブに共有URLを貼り付けた場合はハッシュだけが変わりリロードされない。
  window.addEventListener('hashchange', () => void importFromLocation())

  // --- 挑戦状URLの貼り付けインポート ---
  // ホーム画面起動の PWA は共有リンクをタップしてもアプリ側で開けない
  // (ブラウザが開き、進捗の保存先も別になる)ため、アプリ内に貼り付け口を用意する。
  const pasteButton = document.getElementById(
    'quiz-challenge-paste-button',
  ) as HTMLButtonElement | null
  const importDialog = document.getElementById(
    'quiz-challenge-import-dialog',
  ) as HTMLDialogElement | null
  const importInput = document.getElementById(
    'quiz-challenge-import-input',
  ) as HTMLInputElement | null
  const importStatus = document.getElementById('quiz-challenge-import-status')
  const importOpenButton = document.getElementById(
    'quiz-challenge-import-open-button',
  ) as HTMLButtonElement | null
  const importCloseButton = document.getElementById(
    'quiz-challenge-import-close-button',
  ) as HTMLButtonElement | null

  /** URL・「#c=…」・エンコード文字列そのもの、どの形の貼り付けでも受ける。 */
  const extractEncodedFromText = (text: string): string | null => {
    const trimmed = text.trim()
    if (!trimmed) {
      return null
    }
    if (/^[01]\./.test(trimmed)) {
      return trimmed
    }
    const hashIndex = trimmed.indexOf('#')
    return extractSharedQuizParam(
      hashIndex >= 0 ? trimmed.slice(hashIndex) : `#${trimmed}`,
    )
  }

  const setImportStatus = (message: string) => {
    if (importStatus) {
      importStatus.textContent = message
    }
  }

  pasteButton?.addEventListener('click', () => {
    if (!importDialog) {
      return
    }
    if (importInput) {
      importInput.value = ''
    }
    setImportStatus('')
    importDialog.showModal()
    importDialog.focus({ preventScroll: true })
  })
  importCloseButton?.addEventListener('click', () => importDialog?.close())
  importOpenButton?.addEventListener('click', () => {
    void (async () => {
      const encoded = extractEncodedFromText(importInput?.value ?? '')
      if (!encoded) {
        setImportStatus(QUIZ_SHARE_UI_TEXT.importBrokenUrl)
        return
      }
      const error = await importEncodedChallenge(encoded)
      if (error) {
        setImportStatus(error)
        return
      }
      importDialog?.close()
    })()
  })

  // --- リザルトの SNS シェア ---
  const resultShareRow = document.getElementById('quiz-result-share')
  const resultTweetButton = document.getElementById(
    'quiz-result-share-x-button',
  ) as HTMLButtonElement | null
  const resultImageButton = document.getElementById(
    'quiz-result-share-image-button',
  ) as HTMLButtonElement | null
  const resultCopyButton = document.getElementById(
    'quiz-result-share-copy-button',
  ) as HTMLButtonElement | null
  const resultShareStatus = document.getElementById('quiz-result-share-status')

  let currentResult: QuizResultShareContext | null = null

  const setResultShareStatus = (message: string) => {
    if (resultShareStatus) {
      resultShareStatus.textContent = message
    }
  }

  const buildCurrentShareText = (): string | null => {
    if (!currentResult) {
      return null
    }
    const url = currentResult.challenge
      ? buildSharedQuizUrl(pageUrl(), currentResult.challenge.encoded)
      : pageUrl()
    return buildResultShareText({
      title: currentResult.challenge?.title || null,
      correctCount: currentResult.correctCount,
      totalCount: currentResult.totalCount,
      url,
    })
  }

  resultTweetButton?.addEventListener('click', () => {
    const text = buildCurrentShareText()
    if (text) {
      window.open(buildTweetIntentUrl(text), '_blank', 'noopener')
    }
  })

  resultCopyButton?.addEventListener('click', () => {
    const text = buildCurrentShareText()
    if (!text) {
      return
    }
    navigator.clipboard
      .writeText(text)
      .then(() => setResultShareStatus(QUIZ_SHARE_UI_TEXT.copySucceeded))
      .catch(() => setResultShareStatus(QUIZ_SHARE_UI_TEXT.copyFailed))
  })

  resultImageButton?.addEventListener('click', () => {
    if (!currentResult) {
      return
    }
    const canvas = document.createElement('canvas')
    if (!drawResultCard(canvas, currentResult)) {
      setResultShareStatus(QUIZ_SHARE_UI_TEXT.imageFailed)
      return
    }
    void canvasToBlob(canvas).then(async (blob) => {
      if (!blob) {
        setResultShareStatus(QUIZ_SHARE_UI_TEXT.imageFailed)
        return
      }
      const file = new File([blob], 'quiz-result.png', { type: 'image/png' })
      // モバイルでは共有シート(スクショと同じ感覚で SNS に流せる)を優先し、
      // 使えない環境ではダウンロードにフォールバックする。
      if (
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({
            files: [file],
            text: buildCurrentShareText() ?? undefined,
          })
          return
        } catch {
          // 共有キャンセル時などはダウンロードへ切り替えず黙って終わる。
          return
        }
      }
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = 'quiz-result.png'
      link.click()
      URL.revokeObjectURL(link.href)
      setResultShareStatus(QUIZ_SHARE_UI_TEXT.imageDownloaded)
    })
  })

  return {
    showResultShare: (context) => {
      currentResult = context
      setResultShareStatus('')
      setHidden(resultShareRow, false)
    },
    hideResultShare: () => {
      currentResult = null
      setResultShareStatus('')
      setHidden(resultShareRow, true)
    },
  }
}
