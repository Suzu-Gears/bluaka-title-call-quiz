import { buildChallengePlans, type QuestionPlan } from '@/lib/challengePlan'
import type { QuizEntry } from '@/lib/interfaces'
import {
  buildResultShareText,
  buildSharedQuizUrl,
  buildTweetIntentUrl,
  decodeSharedQuizPayload,
  extractSharedQuizParam,
} from '@/lib/quizShare'
import {
  canShareCardImage,
  copyCardImageToClipboard,
  drawChallengeResultCard,
  drawResultCard,
  imageDeliveryMessage,
  saveCardImage,
  shareCardImageToOs,
  type ImageDeliveryMethod,
  type ResultCardEntry,
} from '@/lib/shareImage'
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
  /** リザルト画像に描く正誤一覧(出題順)。 */
  entries: ResultCardEntry[]
}

interface QuizShareOptions {
  /** 音声を1本以上持つ出題可能な生徒。 */
  entries: readonly QuizEntry[]
  onStartChallenge: (challenge: ChallengeDefinition) => void
}

export interface QuizShareController {
  showResultShare: (context: QuizResultShareContext) => void
  hideResultShare: () => void
  /**
   * 表示中の挑戦状バナーを畳み、URL のハッシュも消す。
   * 挑戦しないまま別のクイズを始めたときに、バナーと共有URLが残り続けないようにする。
   */
  dismissPendingChallenge: () => void
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
  // 生徒リストを下まで見ていた場合などに、画面外へ挑戦状が出て気づけないため
  // 先頭へ戻す。読み込み直後のブラウザによるスクロール復元より後になるよう、
  // 次のフレームでも一度戻す。
  const toTop = () => window.scrollTo({ top: 0, behavior: 'auto' })
  toTop()
  requestAnimationFrame(toTop)
}

export const setupQuizShare = (
  options: QuizShareOptions,
): QuizShareController => {
  const { entries, onStartChallenge } = options
  const entryById = new Map(entries.map((entry) => [entry.PrimaryId, entry]))

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
      author: payload.author ?? null,
      desc: payload.desc ?? null,
      plans,
      shuffle: payload.shuffle === true,
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
  const resultOsShareButton = document.getElementById(
    'quiz-result-share-os-button',
  ) as HTMLButtonElement | null
  const resultCopyButton = document.getElementById(
    'quiz-result-share-copy-button',
  ) as HTMLButtonElement | null
  const resultSaveButton = document.getElementById(
    'quiz-result-share-save-button',
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

  /** その回の結果カードを描く。挑戦状と標準クイズで中身が違う。 */
  const drawCurrentResultCard = async (): Promise<HTMLCanvasElement | null> => {
    if (!currentResult) {
      return null
    }
    const challenge = currentResult.challenge
    // 挑戦状は共有 URL と一緒に出回るので、正誤一覧を載せると答えを配って
    // しまう。アイキャッチにスコアを載せた形にする。
    return challenge
      ? drawChallengeResultCard({
          title: challenge.title,
          author: challenge.author,
          desc: challenge.desc,
          questionCount: currentResult.totalCount,
          questionSummary: challenge.questionSummary,
          correctCount: currentResult.correctCount,
          totalCount: currentResult.totalCount,
        })
      : drawResultCard({
          title: null,
          correctCount: currentResult.correctCount,
          totalCount: currentResult.totalCount,
          entries: currentResult.entries,
        })
  }

  /** 画像を作って、渡し方(共有シート/コピー/保存)だけを差し替える。 */
  const withResultCard = (
    deliver: (canvas: HTMLCanvasElement) => Promise<ImageDeliveryMethod>,
  ): void => {
    void (async () => {
      const canvas = await drawCurrentResultCard()
      if (!canvas) {
        setResultShareStatus(QUIZ_SHARE_UI_TEXT.imageFailed)
        return
      }
      setResultShareStatus(imageDeliveryMessage(await deliver(canvas)))
    })()
  }

  resultOsShareButton?.addEventListener('click', () =>
    withResultCard((canvas) =>
      shareCardImageToOs(
        canvas,
        'quiz-result.png',
        buildCurrentShareText() ?? undefined,
      ),
    ),
  )

  resultCopyButton?.addEventListener('click', () =>
    withResultCard(copyCardImageToClipboard),
  )

  resultSaveButton?.addEventListener('click', () =>
    withResultCard((canvas) => saveCardImage(canvas, 'quiz-result.png')),
  )

  return {
    showResultShare: (context) => {
      currentResult = context
      setResultShareStatus('')
      // 共有シートが使える端末は 1 操作で画像とテキストを渡せるので、
      // コピーと X の投稿画面は出さない(逆もまた然り)。
      const osShare = canShareCardImage()
      setHidden(resultOsShareButton, !osShare)
      setHidden(resultCopyButton, osShare)
      setHidden(resultTweetButton, osShare)
      setHidden(resultShareRow, false)
    },
    hideResultShare: () => {
      currentResult = null
      setResultShareStatus('')
      setHidden(resultShareRow, true)
    },
    dismissPendingChallenge: () => {
      pendingChallenge = null
      hideBanner()
      if (extractSharedQuizParam(window.location.hash)) {
        clearShareHash()
      }
    },
  }
}
