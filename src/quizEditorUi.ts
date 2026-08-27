import { formatClipRef, formatImageKey } from '@/lib/assetKeys'
import { resolveAssetUrl } from '@/lib/assetPath'
import { buildChallengePlans } from '@/lib/challengePlan'
import type { QuizEntry } from '@/lib/interfaces'
import { stripCostume } from '@/lib/jsonUtils'
import { normalizeQuizAnswer } from '@/lib/quizProgress'
import {
  buildQuestionSheetText,
  buildSharedQuizUrl,
  buildTweetIntentUrl,
  decodeSharedQuizPayload,
  encodeSharedQuizPayload,
  extractSharedQuizParam,
  matchPastedStudentNames,
  normalizeSharedQuizPayloadV2,
  parseQuestionSheetText,
  SHARED_QUIZ_CHOICE_MAX_WRONG,
  SHARED_QUIZ_MATCH_MAX_ENTRIES,
  SHARED_QUIZ_MATCH_MIN_ENTRIES,
  SHARED_QUIZ_MAX_QUESTIONS,
  SHARED_QUIZ_VERSION_V2,
  summarizeQuestionTypes,
  type SharedQuizPayloadV2,
  type SharedQuizQuestion,
} from '@/lib/quizShare'
import { readStorageJson, removeStorage, writeStorage } from '@/lib/safeStorage'
import {
  deliverCardImage,
  drawChallengeCard,
  imageDeliveryMessage,
} from '@/lib/shareImage'
import { pickRandomClip } from '@/lib/titleCallClips'
import { setHidden } from '@/lib/uiState'
import { QUIZ_EDITOR_UI_TEXT, QUIZ_SHARE_UI_TEXT } from '@/lib/uiText'
import type { ChallengeDefinition } from '@/quizShareUi'

/**
 * 「作って公開」方式のクイズエディタ(設計書 §5)。
 * 問題を1問ずつ手作りし、共有URL・JSON・シート形式で入出力する。
 * 編集内容は localStorage に自動保存され、閉じても消えない。
 */

const DRAFT_STORAGE_KEY = 'bluaka-title-call-quiz2.quiz-draft.v1'

/**
 * 「同キャラの全フォーム」判定用のベース名。
 * 衣装の（…）に加え、「シロコ＊テラー」のような ＊ 区切りの別形態も同一視する。
 */
const baseFormName = (name: string): string =>
  stripCostume(name).split('＊')[0].trim()

/** 編集中の問題。作成途中(正解未設定など)も表現できるよう null を許す。 */
type EditorQuestion =
  | {
      t: 'c'
      a: number | null
      o: number[]
      /** 挑むたびにランダムに選ぶ誤答の数。 */
      r: number
      clip: string | null
    }
  | { t: 'm'; e: number[] }
  | { t: 'i'; a: number | null; lu: boolean; clip: string | null }

interface EditorState {
  title: string
  author: string
  desc: string
  shuffle: boolean
  q: EditorQuestion[]
}

const emptyState = (): EditorState => ({
  title: '',
  author: '',
  desc: '',
  shuffle: false,
  q: [],
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** localStorage の下書きを検証しながら読み込む。壊れていれば空の状態。 */
const loadDraft = (validIds: ReadonlySet<number>): EditorState => {
  const raw = readStorageJson(DRAFT_STORAGE_KEY)
  if (!isRecord(raw)) {
    return emptyState()
  }
  const id = (value: unknown): number | null =>
    typeof value === 'number' && validIds.has(value) ? value : null
  const ids = (value: unknown): number[] =>
    Array.isArray(value)
      ? value.filter(
          (v): v is number => typeof v === 'number' && validIds.has(v),
        )
      : []
  const questions: EditorQuestion[] = []
  if (Array.isArray(raw.q)) {
    for (const item of raw.q) {
      if (!isRecord(item)) {
        continue
      }
      if (item.t === 'c') {
        const o = ids(item.o)
        questions.push({
          t: 'c',
          a: id(item.a),
          o,
          r:
            typeof item.r === 'number' && Number.isInteger(item.r) && item.r > 0
              ? Math.min(item.r, SHARED_QUIZ_CHOICE_MAX_WRONG - o.length)
              : 0,
          clip: typeof item.clip === 'string' ? item.clip : null,
        })
      } else if (item.t === 'm') {
        questions.push({ t: 'm', e: ids(item.e) })
      } else if (item.t === 'i') {
        questions.push({
          t: 'i',
          a: id(item.a),
          lu: item.lu === true,
          clip: typeof item.clip === 'string' ? item.clip : null,
        })
      }
    }
  }
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    author: typeof raw.author === 'string' ? raw.author : '',
    desc: typeof raw.desc === 'string' ? raw.desc : '',
    shuffle: raw.shuffle === true,
    q: questions.slice(0, SHARED_QUIZ_MAX_QUESTIONS),
  }
}

interface QuizEditorOptions {
  /** 音声を1本以上持つ出題可能な生徒。 */
  entries: readonly QuizEntry[]
  onStartChallenge: (challenge: ChallengeDefinition) => void
}

export const setupQuizEditor = (options: QuizEditorOptions): void => {
  const { entries, onStartChallenge } = options
  const entryById = new Map(entries.map((entry) => [entry.PrimaryId, entry]))
  const sortedEntries = [...entries].sort(
    (a, b) => a.DefaultOrder - b.DefaultOrder,
  )
  const validIds = new Set(entryById.keys())

  const el = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T | null
  const openButton = el<HTMLButtonElement>('quiz-editor-open-button')
  const dialog = el<HTMLDialogElement>('quiz-editor-dialog')
  const closeButton = el<HTMLButtonElement>('quiz-editor-close-button')
  const titleInput = el<HTMLInputElement>('quiz-editor-title-input')
  const authorInput = el<HTMLInputElement>('quiz-editor-author-input')
  const descInput = el<HTMLInputElement>('quiz-editor-desc-input')
  const shuffleCheckbox = el<HTMLInputElement>('quiz-editor-shuffle-checkbox')
  const questionsRoot = el<HTMLDivElement>('quiz-editor-questions')
  const addChoiceButton = el<HTMLButtonElement>('quiz-editor-add-choice-button')
  const addMatchButton = el<HTMLButtonElement>('quiz-editor-add-match-button')
  const addInputButton = el<HTMLButtonElement>('quiz-editor-add-input-button')
  const sheetTextarea = el<HTMLTextAreaElement>('quiz-editor-sheet-textarea')
  const sheetImportButton = el<HTMLButtonElement>(
    'quiz-editor-sheet-import-button',
  )
  const sheetExportButton = el<HTMLButtonElement>(
    'quiz-editor-sheet-export-button',
  )
  const jsonTextarea = el<HTMLTextAreaElement>('quiz-editor-json-textarea')
  const jsonImportButton = el<HTMLButtonElement>(
    'quiz-editor-json-import-button',
  )
  const jsonExportButton = el<HTMLButtonElement>(
    'quiz-editor-json-export-button',
  )
  const generateButton = el<HTMLButtonElement>('quiz-editor-generate-button')
  const clearButton = el<HTMLButtonElement>('quiz-editor-clear-button')
  const urlOutput = el<HTMLInputElement>('quiz-editor-url-output')
  const urlCopyButton = el<HTMLButtonElement>('quiz-editor-url-copy-button')
  const urlTestButton = el<HTMLButtonElement>('quiz-editor-url-test-button')
  const urlTweetButton = el<HTMLButtonElement>('quiz-editor-url-tweet-button')
  const urlImageButton = el<HTMLButtonElement>('quiz-editor-url-image-button')
  const statusText = el<HTMLParagraphElement>('quiz-editor-status')
  const pickerDialog = el<HTMLDialogElement>('quiz-editor-picker-dialog')
  const pickerTitle = el<HTMLHeadingElement>('quiz-editor-picker-title')
  const pickerCloseButton = el<HTMLButtonElement>(
    'quiz-editor-picker-close-button',
  )
  const pickerSearch = el<HTMLInputElement>('quiz-editor-picker-search')
  const pickerList = el<HTMLDivElement>('quiz-editor-picker-list')

  if (!openButton || !dialog || !questionsRoot) {
    return
  }

  let state = loadDraft(validIds)
  /** 最後に生成した共有URLのエンコード文字列(テスト挑戦・シェア用)。 */
  let lastEncoded: string | null = null

  const setStatus = (message: string) => {
    if (statusText) {
      statusText.textContent = message
    }
  }

  const saveDraft = () => {
    writeStorage(DRAFT_STORAGE_KEY, JSON.stringify(state))
  }

  const resetUrlOutput = () => {
    lastEncoded = null
    if (urlOutput) {
      urlOutput.value = ''
    }
    setHidden(urlOutput, true)
  }

  const mutate = (change: () => void) => {
    change()
    saveDraft()
    resetUrlOutput()
    renderQuestions()
  }

  // --- 試聴 -----------------------------------------------------------------

  const previewAudio = new Audio()
  const playPreview = (entry: QuizEntry) => {
    const clip = pickRandomClip(entry.TitleCalls)
    if (!clip) {
      return
    }
    previewAudio.src = resolveAssetUrl(clip.file)
    void previewAudio.play().catch(() => {})
  }

  // --- 生徒ピッカー -----------------------------------------------------------

  let pickerOnPick: ((entry: QuizEntry) => void) | null = null
  let pickerExcluded: ReadonlySet<number> = new Set()

  const renderPickerList = () => {
    if (!pickerList) {
      return
    }
    const query = normalizeQuizAnswer(pickerSearch?.value ?? '')
    pickerList.innerHTML = ''
    sortedEntries.forEach((entry) => {
      if (pickerExcluded.has(entry.PrimaryId)) {
        return
      }
      if (
        query.length > 0 &&
        !normalizeQuizAnswer(entry.Name).includes(query) &&
        !normalizeQuizAnswer(entry.CharacterVoice).includes(query)
      ) {
        return
      }
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'quiz-editor-picker-row'
      const image = document.createElement('img')
      image.loading = 'lazy'
      image.src = resolveAssetUrl(formatImageKey(entry.PrimaryId))
      image.alt = ''
      const text = document.createElement('span')
      text.className = 'quiz-editor-picker-row-text'
      const name = document.createElement('span')
      name.textContent = entry.Name
      const voice = document.createElement('span')
      voice.className = 'quiz-editor-picker-row-voice'
      voice.textContent = `CV. ${entry.CharacterVoice}`
      text.append(name, voice)
      const listen = document.createElement('span')
      listen.className = 'quiz-editor-picker-listen'
      listen.textContent = '♪'
      listen.title = QUIZ_EDITOR_UI_TEXT.listen
      listen.addEventListener('click', (event) => {
        event.stopPropagation()
        playPreview(entry)
      })
      row.append(image, text, listen)
      row.addEventListener('click', () => {
        pickerDialog?.close()
        pickerOnPick?.(entry)
      })
      pickerList.appendChild(row)
    })
  }

  const openPicker = (
    title: string,
    excludeIds: ReadonlySet<number>,
    onPick: (entry: QuizEntry) => void,
  ) => {
    if (!pickerDialog) {
      return
    }
    pickerOnPick = onPick
    pickerExcluded = excludeIds
    if (pickerTitle) {
      pickerTitle.textContent = title
    }
    if (pickerSearch) {
      pickerSearch.value = ''
    }
    renderPickerList()
    pickerDialog.showModal()
    pickerDialog.focus({ preventScroll: true })
    pickerDialog.scrollTop = 0
  }

  pickerSearch?.addEventListener('input', renderPickerList)
  pickerCloseButton?.addEventListener('click', () => pickerDialog?.close())

  // --- 問題リストの描画 --------------------------------------------------------

  const entryName = (id: number | null): string =>
    (id !== null ? entryById.get(id)?.Name : undefined) ??
    QUIZ_EDITOR_UI_TEXT.unset

  const makeSmallButton = (label: string, onClick: () => void) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'quiz-editor-mini-button'
    button.textContent = label
    button.addEventListener('click', onClick)
    return button
  }

  /** 生徒チップ。onRemove があれば×付き、なければタップで差し替え。 */
  const makeStudentChip = (
    id: number,
    onReplace: (() => void) | null,
    onRemove: (() => void) | null,
  ) => {
    const chip = document.createElement('span')
    chip.className = 'quiz-editor-chip'
    const body = document.createElement('button')
    body.type = 'button'
    body.className = 'quiz-editor-chip-body'
    const image = document.createElement('img')
    image.loading = 'lazy'
    image.src = resolveAssetUrl(formatImageKey(id))
    image.alt = ''
    const name = document.createElement('span')
    name.textContent = entryName(id)
    body.append(image, name)
    if (onReplace) {
      body.addEventListener('click', onReplace)
    } else {
      body.disabled = true
    }
    chip.appendChild(body)
    if (onRemove) {
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'quiz-editor-chip-remove'
      remove.textContent = '×'
      remove.setAttribute('aria-label', QUIZ_EDITOR_UI_TEXT.remove)
      remove.addEventListener('click', onRemove)
      chip.appendChild(remove)
    }
    return chip
  }

  /** クリップ固定セレクト。対象生徒のクリップが2本以上あるときだけ出す。 */
  const makeClipSelect = (
    answerId: number | null,
    currentClip: string | null,
    onChange: (clip: string | null) => void,
  ): HTMLElement | null => {
    const entry = answerId !== null ? entryById.get(answerId) : undefined
    if (!entry || entry.TitleCalls.length < 2) {
      return null
    }
    const label = document.createElement('label')
    label.className = 'quiz-editor-clip-label'
    label.append(QUIZ_EDITOR_UI_TEXT.clipLabel)
    const select = document.createElement('select')
    const randomOption = document.createElement('option')
    randomOption.value = ''
    randomOption.textContent = QUIZ_EDITOR_UI_TEXT.clipRandom
    select.appendChild(randomOption)
    entry.TitleCalls.forEach((clip) => {
      const ref = formatClipRef(clip.clipId, clip.generation)
      const option = document.createElement('option')
      option.value = ref
      option.textContent = clip.label ? `${ref}（${clip.label}）` : ref
      select.appendChild(option)
    })
    select.value =
      currentClip !== null &&
      [...select.options].some((option) => option.value === currentClip)
        ? currentClip
        : ''
    select.addEventListener('change', () => {
      onChange(select.value || null)
    })
    label.appendChild(select)
    return label
  }

  const questionTypeLabel = (question: EditorQuestion): string => {
    if (question.t === 'c') {
      return `${QUIZ_EDITOR_UI_TEXT.typeChoice}（${question.o.length + question.r + 1}択）`
    }
    if (question.t === 'm') {
      return `${QUIZ_EDITOR_UI_TEXT.typeMatch}（${question.e.length}人）`
    }
    return question.lu
      ? `${QUIZ_EDITOR_UI_TEXT.typeInput}（Lunatic）`
      : QUIZ_EDITOR_UI_TEXT.typeInput
  }

  const renderQuestionCard = (question: EditorQuestion, index: number) => {
    const card = document.createElement('div')
    card.className = 'quiz-editor-question'

    const head = document.createElement('div')
    head.className = 'quiz-editor-question-head'
    const title = document.createElement('span')
    title.className = 'quiz-editor-question-title'
    title.textContent = `${index + 1}. ${questionTypeLabel(question)}`
    const actions = document.createElement('span')
    actions.className = 'quiz-editor-question-actions'
    actions.append(
      makeSmallButton('▲', () =>
        mutate(() => {
          if (index > 0) {
            ;[state.q[index - 1], state.q[index]] = [
              state.q[index],
              state.q[index - 1],
            ]
          }
        }),
      ),
      makeSmallButton('▼', () =>
        mutate(() => {
          if (index < state.q.length - 1) {
            ;[state.q[index + 1], state.q[index]] = [
              state.q[index],
              state.q[index + 1],
            ]
          }
        }),
      ),
      makeSmallButton(QUIZ_EDITOR_UI_TEXT.duplicate, () =>
        mutate(() => {
          state.q.splice(
            index + 1,
            0,
            JSON.parse(JSON.stringify(question)) as EditorQuestion,
          )
        }),
      ),
      makeSmallButton(QUIZ_EDITOR_UI_TEXT.delete, () =>
        mutate(() => {
          state.q.splice(index, 1)
        }),
      ),
    )
    head.append(title, actions)
    card.appendChild(head)

    const body = document.createElement('div')
    body.className = 'quiz-editor-question-body'

    if (question.t === 'c' || question.t === 'i') {
      const answerRow = document.createElement('div')
      answerRow.className = 'quiz-editor-row'
      answerRow.append(`${QUIZ_EDITOR_UI_TEXT.answerLabel}: `)
      const pickAnswer = () =>
        openPicker(
          QUIZ_EDITOR_UI_TEXT.pickAnswerTitle,
          new Set(question.t === 'c' ? question.o : []),
          (entry) =>
            mutate(() => {
              question.a = entry.PrimaryId
              question.clip = null
            }),
        )
      if (question.a !== null) {
        answerRow.appendChild(makeStudentChip(question.a, pickAnswer, null))
      } else {
        answerRow.appendChild(
          makeSmallButton(QUIZ_EDITOR_UI_TEXT.pickStudent, pickAnswer),
        )
      }
      const clipSelect = makeClipSelect(question.a, question.clip, (clip) =>
        mutate(() => {
          question.clip = clip
        }),
      )
      if (clipSelect) {
        answerRow.appendChild(clipSelect)
      }
      body.appendChild(answerRow)
    }

    if (question.t === 'c') {
      const wrongRow = document.createElement('div')
      wrongRow.className = 'quiz-editor-row'
      wrongRow.append(`${QUIZ_EDITOR_UI_TEXT.wrongLabel}: `)
      question.o.forEach((id, wrongIndex) => {
        wrongRow.appendChild(
          makeStudentChip(id, null, () =>
            mutate(() => {
              question.o.splice(wrongIndex, 1)
            }),
          ),
        )
      })
      // ランダム枠のチップ。挑むたびに全生徒から選び直される誤答。
      for (let i = 0; i < question.r; i++) {
        const chip = document.createElement('span')
        chip.className = 'quiz-editor-chip quiz-editor-chip-random'
        const body_ = document.createElement('span')
        body_.className = 'quiz-editor-chip-body'
        body_.append(QUIZ_EDITOR_UI_TEXT.randomWrongChip)
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'quiz-editor-chip-remove'
        remove.textContent = '×'
        remove.setAttribute('aria-label', QUIZ_EDITOR_UI_TEXT.remove)
        remove.addEventListener('click', () =>
          mutate(() => {
            question.r -= 1
          }),
        )
        chip.append(body_, remove)
        wrongRow.appendChild(chip)
      }
      if (question.o.length + question.r < SHARED_QUIZ_CHOICE_MAX_WRONG) {
        wrongRow.appendChild(
          makeSmallButton(QUIZ_EDITOR_UI_TEXT.addWrong, () =>
            openPicker(
              QUIZ_EDITOR_UI_TEXT.pickWrongTitle,
              new Set([
                ...(question.a !== null ? [question.a] : []),
                ...question.o,
              ]),
              (entry) =>
                mutate(() => {
                  question.o.push(entry.PrimaryId)
                }),
            ),
          ),
        )
        wrongRow.appendChild(
          makeSmallButton(QUIZ_EDITOR_UI_TEXT.addRandomWrong, () =>
            mutate(() => {
              question.r += 1
            }),
          ),
        )
      }
      body.appendChild(wrongRow)
    }

    if (question.t === 'm') {
      const memberRow = document.createElement('div')
      memberRow.className = 'quiz-editor-row'
      memberRow.append(`${QUIZ_EDITOR_UI_TEXT.matchLabel}: `)
      question.e.forEach((id, memberIndex) => {
        memberRow.appendChild(
          makeStudentChip(id, null, () =>
            mutate(() => {
              question.e.splice(memberIndex, 1)
            }),
          ),
        )
      })
      if (question.e.length < SHARED_QUIZ_MATCH_MAX_ENTRIES) {
        memberRow.appendChild(
          makeSmallButton(QUIZ_EDITOR_UI_TEXT.addMatchMember, () =>
            openPicker(
              QUIZ_EDITOR_UI_TEXT.pickMatchTitle,
              new Set(question.e),
              (entry) =>
                mutate(() => {
                  question.e.push(entry.PrimaryId)
                }),
            ),
          ),
        )
        if (question.e.length > 0) {
          // 選択済みの生徒と同じベース名(衣装違い)を一括で加える。
          memberRow.appendChild(
            makeSmallButton(QUIZ_EDITOR_UI_TEXT.addAllForms, () =>
              mutate(() => {
                const baseNames = new Set(
                  question.e
                    .map((id) => entryById.get(id))
                    .filter((entry): entry is QuizEntry => entry !== undefined)
                    .map((entry) => baseFormName(entry.Name)),
                )
                for (const entry of sortedEntries) {
                  if (question.e.length >= SHARED_QUIZ_MATCH_MAX_ENTRIES) {
                    break
                  }
                  if (
                    baseNames.has(baseFormName(entry.Name)) &&
                    !question.e.includes(entry.PrimaryId)
                  ) {
                    question.e.push(entry.PrimaryId)
                  }
                }
              }),
            ),
          )
        }
      }
      body.appendChild(memberRow)
    }

    if (question.t === 'i') {
      const luLabel = document.createElement('label')
      luLabel.className = 'quiz-editor-lunatic-label'
      const luCheckbox = document.createElement('input')
      luCheckbox.type = 'checkbox'
      luCheckbox.checked = question.lu
      luCheckbox.addEventListener('change', () =>
        mutate(() => {
          question.lu = luCheckbox.checked
        }),
      )
      luLabel.append(luCheckbox, QUIZ_EDITOR_UI_TEXT.lunaticLabel)
      body.appendChild(luLabel)
    }

    card.appendChild(body)
    return card
  }

  const renderQuestions = () => {
    questionsRoot.innerHTML = ''
    if (state.q.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'settings-note'
      empty.textContent = QUIZ_EDITOR_UI_TEXT.emptyQuestions
      questionsRoot.appendChild(empty)
      return
    }
    state.q.forEach((question, index) => {
      questionsRoot.appendChild(renderQuestionCard(question, index))
    })
  }

  // --- 入出力 -----------------------------------------------------------------

  /** 完成している問題だけを共有ペイロード形式へ変換する。 */
  const completedQuestions = (): {
    questions: SharedQuizQuestion[]
    problems: string[]
  } => {
    const questions: SharedQuizQuestion[] = []
    const problems: string[] = []
    state.q.forEach((question, index) => {
      const label = `${QUIZ_EDITOR_UI_TEXT.questionPrefix}${index + 1}`
      if (question.t === 'c') {
        if (question.a === null) {
          problems.push(`${label}: ${QUIZ_EDITOR_UI_TEXT.problemNoAnswer}`)
          return
        }
        if (question.o.length + question.r === 0) {
          problems.push(`${label}: ${QUIZ_EDITOR_UI_TEXT.problemNoWrong}`)
          return
        }
        questions.push({
          t: 'c',
          a: question.a,
          o: [...question.o],
          ...(question.r > 0 ? { r: question.r } : {}),
          ...(question.clip ? { clip: question.clip } : {}),
        })
        return
      }
      if (question.t === 'm') {
        if (question.e.length < SHARED_QUIZ_MATCH_MIN_ENTRIES) {
          problems.push(`${label}: ${QUIZ_EDITOR_UI_TEXT.problemMatchTooFew}`)
          return
        }
        questions.push({ t: 'm', e: [...question.e] })
        return
      }
      if (question.a === null) {
        problems.push(`${label}: ${QUIZ_EDITOR_UI_TEXT.problemNoAnswer}`)
        return
      }
      questions.push({
        t: 'i',
        a: question.a,
        ...(question.lu ? { lu: true } : {}),
        ...(question.clip ? { clip: question.clip } : {}),
      })
    })
    return { questions, problems }
  }

  const buildPayload = (): SharedQuizPayloadV2 | null => {
    const { questions, problems } = completedQuestions()
    if (problems.length > 0) {
      setStatus(problems.slice(0, 3).join('\n'))
      return null
    }
    if (questions.length === 0) {
      setStatus(QUIZ_EDITOR_UI_TEXT.problemNoQuestions)
      return null
    }
    const author = state.author.trim()
    const desc = state.desc.trim()
    return {
      v: SHARED_QUIZ_VERSION_V2,
      title: state.title.trim(),
      ...(author ? { author } : {}),
      ...(desc ? { desc } : {}),
      ...(state.shuffle ? { shuffle: true } : {}),
      q: questions,
    }
  }

  /**
   * 共有URLを用意する(未生成なら作成を挟む)。シェア系ボタンはURL作成前から
   * 押せるようにし、問題に不備があればステータスにエラーを出して null を返す。
   */
  const ensureShareUrl = async (): Promise<{
    url: string
    payload: SharedQuizPayloadV2
  } | null> => {
    const payload = buildPayload()
    if (!payload) {
      // buildPayload が不備の内容をステータスに表示済み
      return null
    }
    if (lastEncoded === null) {
      try {
        lastEncoded = await encodeSharedQuizPayload(payload)
      } catch {
        setStatus(QUIZ_SHARE_UI_TEXT.generateFailed)
        return null
      }
    }
    const url = buildSharedQuizUrl(
      `${window.location.origin}${window.location.pathname}`,
      lastEncoded,
    )
    if (urlOutput) {
      urlOutput.value = url
    }
    setHidden(urlOutput, false)
    return { url, payload }
  }

  const shareInviteText = (title: string, url: string): string =>
    `${title ? `「${title}」` : QUIZ_SHARE_UI_TEXT.tweetDefaultQuizName}${QUIZ_SHARE_UI_TEXT.tweetInviteSuffix}\n${url}`

  generateButton?.addEventListener('click', () => {
    void ensureShareUrl().then((result) => {
      if (result) {
        setStatus(QUIZ_SHARE_UI_TEXT.generateSucceeded)
      }
    })
  })

  urlCopyButton?.addEventListener('click', () => {
    void ensureShareUrl().then((result) => {
      if (!result) {
        return
      }
      navigator.clipboard
        .writeText(result.url)
        .then(() => setStatus(QUIZ_SHARE_UI_TEXT.copySucceeded))
        .catch(() => {
          urlOutput?.select()
          setStatus(QUIZ_SHARE_UI_TEXT.copyFailed)
        })
    })
  })

  urlTweetButton?.addEventListener('click', () => {
    void ensureShareUrl().then((result) => {
      if (!result) {
        return
      }
      window.open(
        buildTweetIntentUrl(shareInviteText(result.payload.title, result.url)),
        '_blank',
        'noopener',
      )
    })
  })

  // アイキャッチ画像: 共有シート(モバイル) / コピー(PC) / ダウンロードで渡す
  urlImageButton?.addEventListener('click', () => {
    void ensureShareUrl().then((result) => {
      if (!result) {
        return
      }
      const { payload, url } = result
      const canvas = drawChallengeCard({
        title: payload.title,
        author: payload.author ?? null,
        desc: payload.desc ?? null,
        questionCount: payload.q.length,
        questionSummary: summarizeQuestionTypes(payload.q),
      })
      if (!canvas) {
        setStatus(QUIZ_SHARE_UI_TEXT.imageFailed)
        return
      }
      void deliverCardImage(
        canvas,
        'quiz-invite.png',
        shareInviteText(payload.title, url),
      ).then((method) => setStatus(imageDeliveryMessage(method)))
    })
  })

  // 作った本人がその場で通しプレイして確認できるようにする。
  urlTestButton?.addEventListener('click', () => {
    void ensureShareUrl().then((result) => {
      if (!result || lastEncoded === null) {
        return
      }
      const { payload } = result
      const { plans, skippedCount, questionSummary } = buildChallengePlans(
        payload,
        entryById,
      )
      if (plans.length === 0) {
        setStatus(QUIZ_SHARE_UI_TEXT.importNoPlayableStudents)
        return
      }
      dialog.close()
      onStartChallenge({
        title: payload.title,
        author: payload.author ?? null,
        desc: payload.desc ?? null,
        plans,
        shuffle: payload.shuffle === true,
        skippedCount,
        questionSummary,
        encoded: lastEncoded,
      })
    })
  })

  sheetImportButton?.addEventListener('click', () => {
    const text = sheetTextarea?.value ?? ''
    if (!text.trim()) {
      setStatus(QUIZ_SHARE_UI_TEXT.pasteEmpty)
      return
    }
    const { questions, errors } = parseQuestionSheetText(text, sortedEntries)
    mutate(() => {
      for (const question of questions) {
        if (state.q.length >= SHARED_QUIZ_MAX_QUESTIONS) {
          break
        }
        state.q.push(
          question.t === 'c'
            ? {
                t: 'c',
                a: question.a,
                o: [...question.o],
                r: question.r ?? 0,
                clip: null,
              }
            : question.t === 'm'
              ? { t: 'm', e: [...question.e] }
              : { t: 'i', a: question.a, lu: question.lu === true, clip: null },
        )
      }
    })
    setStatus(
      [
        `${questions.length}${QUIZ_EDITOR_UI_TEXT.sheetImportedSuffix}`,
        ...errors.slice(0, 3),
      ].join('\n'),
    )
  })

  sheetExportButton?.addEventListener('click', () => {
    const { questions } = completedQuestions()
    if (sheetTextarea) {
      sheetTextarea.value = buildQuestionSheetText(questions, sortedEntries)
    }
    setStatus(`${questions.length}${QUIZ_EDITOR_UI_TEXT.sheetExportedSuffix}`)
  })

  jsonExportButton?.addEventListener('click', () => {
    const payload = buildPayload()
    if (!payload || !jsonTextarea) {
      return
    }
    jsonTextarea.value = JSON.stringify(payload, null, 2)
    setStatus(QUIZ_EDITOR_UI_TEXT.jsonExported)
  })

  jsonImportButton?.addEventListener('click', () => {
    void (async () => {
      const text = (jsonTextarea?.value ?? '').trim()
      if (!text) {
        setStatus(QUIZ_SHARE_UI_TEXT.pasteEmpty)
        return
      }
      let payload: SharedQuizPayloadV2 | null = null
      const encoded = extractSharedQuizParam(
        text.includes('#') ? text.slice(text.indexOf('#')) : '',
      )
      if (encoded) {
        const decoded = await decodeSharedQuizPayload(encoded)
        payload = decoded?.v === SHARED_QUIZ_VERSION_V2 ? decoded : null
      } else {
        try {
          payload = normalizeSharedQuizPayloadV2(JSON.parse(text))
        } catch {
          payload = null
        }
      }
      if (!payload) {
        setStatus(QUIZ_EDITOR_UI_TEXT.jsonImportFailed)
        return
      }
      const loaded = payload
      mutate(() => {
        state = {
          title: loaded.title,
          author: loaded.author ?? '',
          desc: loaded.desc ?? '',
          shuffle: loaded.shuffle === true,
          q: loaded.q.map(
            (question): EditorQuestion =>
              question.t === 'c'
                ? {
                    t: 'c',
                    a: question.a,
                    o: [...question.o],
                    r: question.r ?? 0,
                    clip: question.clip ?? null,
                  }
                : question.t === 'm'
                  ? { t: 'm', e: [...question.e] }
                  : {
                      t: 'i',
                      a: question.a,
                      lu: question.lu === true,
                      clip: question.clip ?? null,
                    },
          ),
        }
      })
      syncMetaInputs()
      setStatus(QUIZ_EDITOR_UI_TEXT.jsonImported)
    })()
  })

  clearButton?.addEventListener('click', () => {
    if (!window.confirm(QUIZ_EDITOR_UI_TEXT.clearConfirm)) {
      return
    }
    mutate(() => {
      state = emptyState()
    })
    syncMetaInputs()
    removeStorage(DRAFT_STORAGE_KEY)
    setStatus('')
  })

  // --- クイズ情報の入力 ---------------------------------------------------------

  const syncMetaInputs = () => {
    if (titleInput) {
      titleInput.value = state.title
    }
    if (authorInput) {
      authorInput.value = state.author
    }
    if (descInput) {
      descInput.value = state.desc
    }
    if (shuffleCheckbox) {
      shuffleCheckbox.checked = state.shuffle
    }
  }

  titleInput?.addEventListener('input', () => {
    state.title = titleInput.value
    saveDraft()
    resetUrlOutput()
  })
  authorInput?.addEventListener('input', () => {
    state.author = authorInput.value
    saveDraft()
    resetUrlOutput()
  })
  descInput?.addEventListener('input', () => {
    state.desc = descInput.value
    saveDraft()
    resetUrlOutput()
  })
  shuffleCheckbox?.addEventListener('change', () => {
    state.shuffle = shuffleCheckbox.checked
    saveDraft()
    resetUrlOutput()
  })

  const addQuestion = (question: EditorQuestion) => {
    if (state.q.length >= SHARED_QUIZ_MAX_QUESTIONS) {
      setStatus(QUIZ_EDITOR_UI_TEXT.tooManyQuestions)
      return
    }
    mutate(() => {
      state.q.push(question)
    })
  }
  // 択一は「ランダム誤答3つ」から始める(正解を選ぶだけで普通の4択になる)。
  addChoiceButton?.addEventListener('click', () =>
    addQuestion({ t: 'c', a: null, o: [], r: 3, clip: null }),
  )
  addMatchButton?.addEventListener('click', () =>
    addQuestion({ t: 'm', e: [] }),
  )
  addInputButton?.addEventListener('click', () =>
    addQuestion({ t: 'i', a: null, lu: false, clip: null }),
  )

  // --- 生徒を選んでまとめて追加(旧「おまかせ作成」の後継) ------------------------
  // 選んだ生徒を1人1問ずつ問題リストへ変換する。4択の誤答はここでランダムに
  // 確定させる(挑戦のたびに変わらず、追加後に個別編集もできる)。

  const bulkButton = el<HTMLButtonElement>('quiz-editor-bulk-button')
  const bulkDialog = el<HTMLDialogElement>('quiz-editor-bulk-dialog')
  const bulkCloseButton = el<HTMLButtonElement>('quiz-editor-bulk-close-button')
  const bulkModeSelect = el<HTMLSelectElement>('quiz-editor-bulk-mode-select')
  const bulkSearchInput = el<HTMLInputElement>('quiz-editor-bulk-search-input')
  const bulkList = el<HTMLDivElement>('quiz-editor-bulk-student-list')
  const bulkSelectedCount = el<HTMLParagraphElement>(
    'quiz-editor-bulk-selected-count',
  )
  const bulkSelectVisibleButton = el<HTMLButtonElement>(
    'quiz-editor-bulk-select-visible-button',
  )
  const bulkClearButton = el<HTMLButtonElement>('quiz-editor-bulk-clear-button')
  const bulkPasteTextarea = el<HTMLTextAreaElement>(
    'quiz-editor-bulk-paste-textarea',
  )
  const bulkPasteApplyButton = el<HTMLButtonElement>(
    'quiz-editor-bulk-paste-apply-button',
  )
  const bulkAddButton = el<HTMLButtonElement>('quiz-editor-bulk-add-button')
  const bulkStatus = el<HTMLParagraphElement>('quiz-editor-bulk-status')

  const bulkSelectedIds = new Set<number>()
  const bulkCheckboxById = new Map<number, HTMLInputElement>()

  const setBulkStatus = (message: string) => {
    if (bulkStatus) {
      bulkStatus.textContent = message
    }
  }

  const updateBulkSelectedCount = () => {
    if (bulkSelectedCount) {
      bulkSelectedCount.textContent = `${bulkSelectedIds.size}${QUIZ_SHARE_UI_TEXT.selectedCountSuffix}`
    }
  }

  const renderBulkList = () => {
    if (!bulkList) {
      return
    }
    bulkList.innerHTML = ''
    bulkCheckboxById.clear()
    sortedEntries.forEach((entry) => {
      const label = document.createElement('label')
      label.className = 'quiz-share-student-item'
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.checked = bulkSelectedIds.has(entry.PrimaryId)
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          bulkSelectedIds.add(entry.PrimaryId)
        } else {
          bulkSelectedIds.delete(entry.PrimaryId)
        }
        updateBulkSelectedCount()
      })
      const nameText = document.createElement('span')
      nameText.textContent = entry.Name
      label.append(checkbox, nameText)
      label.dataset.studentId = String(entry.PrimaryId)
      label.dataset.nameKey = normalizeQuizAnswer(entry.Name)
      bulkList.appendChild(label)
      bulkCheckboxById.set(entry.PrimaryId, checkbox)
    })
  }

  const applyBulkSearchFilter = () => {
    const query = normalizeQuizAnswer(bulkSearchInput?.value ?? '')
    bulkList
      ?.querySelectorAll<HTMLElement>('.quiz-share-student-item')
      .forEach((item) => {
        setHidden(
          item,
          query.length > 0 && !(item.dataset.nameKey ?? '').includes(query),
        )
      })
  }

  const syncBulkCheckboxes = () => {
    bulkCheckboxById.forEach((checkbox, id) => {
      checkbox.checked = bulkSelectedIds.has(id)
    })
    updateBulkSelectedCount()
  }

  bulkButton?.addEventListener('click', () => {
    if (!bulkDialog) {
      return
    }
    bulkSelectedIds.clear()
    if (bulkSearchInput) {
      bulkSearchInput.value = ''
    }
    if (bulkPasteTextarea) {
      bulkPasteTextarea.value = ''
    }
    renderBulkList()
    updateBulkSelectedCount()
    setBulkStatus('')
    bulkDialog.showModal()
    bulkDialog.focus({ preventScroll: true })
    bulkDialog.scrollTop = 0
  })
  bulkCloseButton?.addEventListener('click', () => bulkDialog?.close())
  bulkSearchInput?.addEventListener('input', applyBulkSearchFilter)

  bulkSelectVisibleButton?.addEventListener('click', () => {
    bulkList
      ?.querySelectorAll<HTMLElement>('.quiz-share-student-item')
      .forEach((item) => {
        if (!item.hidden && item.dataset.studentId) {
          bulkSelectedIds.add(Number(item.dataset.studentId))
        }
      })
    syncBulkCheckboxes()
  })

  bulkClearButton?.addEventListener('click', () => {
    bulkSelectedIds.clear()
    syncBulkCheckboxes()
  })

  bulkPasteApplyButton?.addEventListener('click', () => {
    const text = bulkPasteTextarea?.value ?? ''
    if (!text.trim()) {
      setBulkStatus(QUIZ_SHARE_UI_TEXT.pasteEmpty)
      return
    }
    const { matched, unmatched } = matchPastedStudentNames(
      text,
      sortedEntries.map((entry) => entry.Name),
    )
    const idByName = new Map(
      sortedEntries.map((entry) => [entry.Name, entry.PrimaryId]),
    )
    matched.forEach((name) => {
      const id = idByName.get(name)
      if (id !== undefined) {
        bulkSelectedIds.add(id)
      }
    })
    syncBulkCheckboxes()
    setBulkStatus(
      unmatched.length > 0
        ? `${matched.length}${QUIZ_SHARE_UI_TEXT.pasteMatchedSuffix} / ${QUIZ_SHARE_UI_TEXT.pasteUnmatchedPrefix}: ${unmatched.slice(0, 5).join('、')}${unmatched.length > 5 ? ' ほか' : ''}`
        : `${matched.length}${QUIZ_SHARE_UI_TEXT.pasteMatchedSuffix}`,
    )
  })

  bulkAddButton?.addEventListener('click', () => {
    if (bulkSelectedIds.size === 0) {
      setBulkStatus(QUIZ_SHARE_UI_TEXT.generateNeedsSelection)
      return
    }
    const mode = bulkModeSelect?.value
    const selected = sortedEntries.filter((entry) =>
      bulkSelectedIds.has(entry.PrimaryId),
    )
    let added = 0
    mutate(() => {
      for (const entry of selected) {
        if (state.q.length >= SHARED_QUIZ_MAX_QUESTIONS) {
          break
        }
        if (mode === 'name-input' || mode === 'name-input-lunatic') {
          state.q.push({
            t: 'i',
            a: entry.PrimaryId,
            lu: mode === 'name-input-lunatic',
            clip: null,
          })
        } else {
          // 誤答はランダム枠3つ=通常の4択と同じく挑むたびに変わる。
          state.q.push({ t: 'c', a: entry.PrimaryId, o: [], r: 3, clip: null })
        }
        added += 1
      }
    })
    bulkDialog?.close()
    setStatus(
      added < selected.length
        ? `${added}${QUIZ_EDITOR_UI_TEXT.bulkAddedSuffix}\n${QUIZ_EDITOR_UI_TEXT.tooManyQuestions}`
        : `${added}${QUIZ_EDITOR_UI_TEXT.bulkAddedSuffix}`,
    )
  })

  openButton.addEventListener('click', () => {
    syncMetaInputs()
    renderQuestions()
    setStatus('')
    resetUrlOutput()
    dialog.showModal()
    dialog.focus({ preventScroll: true })
    dialog.scrollTop = 0
  })
  closeButton?.addEventListener('click', () => dialog.close())
  // 閉じたら試聴音声も止める(ピッカーごと閉じた場合も含む)
  dialog.addEventListener('close', () => previewAudio.pause())
  pickerDialog?.addEventListener('close', () => previewAudio.pause())
}
