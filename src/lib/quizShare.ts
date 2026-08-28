import { normalizeQuizAnswer } from '@/lib/quizProgress'

/**
 * 自作クイズの共有機能。
 * クイズ定義(タイトル・回答方式・出題する生徒)を URL のハッシュに埋め込み、
 * サーバーを介さずに共有・インポートできるようにする。
 *
 * URL 形式: https://example.com/#c=<エンコード済み定義>
 * エンコード: JSON → UTF-8 → deflate-raw 圧縮 → base64url。
 * 圧縮方式を示すプレフィックス('1.'=deflate, '0.'=無圧縮)を付け、
 * CompressionStream が使えない環境でも読み書きできるようにする。
 */

export const SHARED_QUIZ_VERSION_V2 = 2
export const SHARED_QUIZ_HASH_KEY = 'c'
export const SHARED_QUIZ_TITLE_MAX_LENGTH = 40
export const SHARED_QUIZ_AUTHOR_MAX_LENGTH = 20
export const SHARED_QUIZ_DESC_MAX_LENGTH = 100
/** 問題数上限。URL 長の実測に基づく(設計書 §2-2)。 */
export const SHARED_QUIZ_MAX_QUESTIONS = 100
/** 択一の誤答数の上限(正解と合わせて 2〜8 択)。 */
export const SHARED_QUIZ_CHOICE_MAX_WRONG = 7
export const SHARED_QUIZ_MATCH_MIN_ENTRIES = 2
export const SHARED_QUIZ_MATCH_MAX_ENTRIES = 6

/**
 * 択一(可変択数)。a=正解、o=誤答。clip でクリップ固定(既定はランダム)。
 * r は「挑むたびに全生徒からランダムに選ぶ誤答」の数(o と合わせて1〜7)。
 */
export interface SharedQuizChoiceQuestion {
  t: 'c'
  a: number
  o: number[]
  r?: number
  clip?: string
}

/** マッチング。e の全エントリの声を正しいカードへ割り当てる。 */
export interface SharedQuizMatchQuestion {
  t: 'm'
  e: number[]
}

/** 名前入力。lu=true でサジェスト無し(Lunatic)。 */
export interface SharedQuizInputQuestion {
  t: 'i'
  a: number
  lu?: boolean
  clip?: string
}

export type SharedQuizQuestion =
  | SharedQuizChoiceQuestion
  | SharedQuizMatchQuestion
  | SharedQuizInputQuestion

/** v2: 問題を1問ずつ手作りして公開する形式(設計書 §3-2)。 */
export interface SharedQuizPayloadV2 {
  v: 2
  title: string
  author?: string
  desc?: string
  /** true なら挑むたびに出題順をシャッフルする。既定は作成順。 */
  shuffle?: boolean
  q: SharedQuizQuestion[]
}

export type SharedQuizPayload = SharedQuizPayloadV2

const ENCODING_DEFLATE_PREFIX = '1.'
const ENCODING_PLAIN_PREFIX = '0.'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeStudentId = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null

const normalizeText = (value: unknown, maxLength: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

/** クリップ固定の参照形式(`{clipId}.g{世代}`、assetKeys の formatClipRef と同じ)。 */
const CLIP_REF_PATTERN = /^[A-Za-z0-9_-]+\.g[1-9]\d*$/

const normalizeClipRef = (value: unknown): string | undefined =>
  typeof value === 'string' && CLIP_REF_PATTERN.test(value) ? value : undefined

/** 1問ぶんの定義を検証する。壊れていれば null(その問題だけ捨てる)。 */
export function normalizeSharedQuizQuestion(
  raw: unknown,
): SharedQuizQuestion | null {
  if (!isRecord(raw)) {
    return null
  }
  if (raw.t === 'c') {
    const a = normalizeStudentId(raw.a)
    if (a === null || !Array.isArray(raw.o)) {
      return null
    }
    const o = [
      ...new Set(
        raw.o
          .map(normalizeStudentId)
          .filter((id): id is number => id !== null && id !== a),
      ),
    ].slice(0, SHARED_QUIZ_CHOICE_MAX_WRONG)
    const r = Math.min(
      typeof raw.r === 'number' && Number.isInteger(raw.r) && raw.r > 0
        ? raw.r
        : 0,
      SHARED_QUIZ_CHOICE_MAX_WRONG - o.length,
    )
    if (o.length + r === 0) {
      return null
    }
    const clip = normalizeClipRef(raw.clip)
    return { t: 'c', a, o, ...(r > 0 ? { r } : {}), ...(clip ? { clip } : {}) }
  }
  if (raw.t === 'm') {
    if (!Array.isArray(raw.e)) {
      return null
    }
    const e = [
      ...new Set(
        raw.e.map(normalizeStudentId).filter((id): id is number => id !== null),
      ),
    ]
    if (
      e.length < SHARED_QUIZ_MATCH_MIN_ENTRIES ||
      e.length > SHARED_QUIZ_MATCH_MAX_ENTRIES
    ) {
      return null
    }
    return { t: 'm', e }
  }
  if (raw.t === 'i') {
    const a = normalizeStudentId(raw.a)
    if (a === null) {
      return null
    }
    const clip = normalizeClipRef(raw.clip)
    return {
      t: 'i',
      a,
      ...(raw.lu === true ? { lu: true } : {}),
      ...(clip ? { clip } : {}),
    }
  }
  return null
}

export function normalizeSharedQuizPayloadV2(
  raw: unknown,
): SharedQuizPayloadV2 | null {
  if (!isRecord(raw) || !Array.isArray(raw.q)) {
    return null
  }
  const q = raw.q
    .map(normalizeSharedQuizQuestion)
    .filter((question): question is SharedQuizQuestion => question !== null)
    .slice(0, SHARED_QUIZ_MAX_QUESTIONS)
  if (q.length === 0) {
    return null
  }
  const author = normalizeText(raw.author, SHARED_QUIZ_AUTHOR_MAX_LENGTH)
  const desc = normalizeText(raw.desc, SHARED_QUIZ_DESC_MAX_LENGTH)
  return {
    v: SHARED_QUIZ_VERSION_V2,
    title: normalizeText(raw.title, SHARED_QUIZ_TITLE_MAX_LENGTH),
    ...(author ? { author } : {}),
    ...(desc ? { desc } : {}),
    ...(raw.shuffle === true ? { shuffle: true } : {}),
    q,
  }
}

/** 外部由来の値を検証して共有クイズ定義に整える。壊れていれば null。 */
export function normalizeSharedQuizPayload(
  raw: unknown,
): SharedQuizPayload | null {
  if (!isRecord(raw) || raw.v !== SHARED_QUIZ_VERSION_V2) {
    return null
  }
  return normalizeSharedQuizPayloadV2(raw)
}

/** 挑戦状バナー等に出す形式の内訳(例: 択一6・マッチ3・入力1)。 */
export function summarizeQuestionTypes(
  questions: readonly { t: SharedQuizQuestion['t'] }[],
): string {
  const counts = { c: 0, m: 0, i: 0 }
  for (const question of questions) {
    counts[question.t] += 1
  }
  return [
    counts.c > 0 ? `択一${counts.c}` : null,
    counts.m > 0 ? `マッチ${counts.m}` : null,
    counts.i > 0 ? `入力${counts.i}` : null,
  ]
    .filter(Boolean)
    .join('・')
}

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

const base64UrlToBytes = (text: string): Uint8Array => {
  const base64 = text.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const pipeBytes = async (
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> => {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const supportsCompression = (): boolean =>
  typeof CompressionStream === 'function' &&
  typeof DecompressionStream === 'function'

/** 共有クイズ定義を URL ハッシュに載せられる文字列へエンコードする。 */
export async function encodeSharedQuizPayload(
  payload: SharedQuizPayload,
): Promise<string> {
  const normalized = normalizeSharedQuizPayload(payload)
  if (!normalized) {
    throw new Error('共有クイズの定義が不正です')
  }
  const jsonBytes = new TextEncoder().encode(JSON.stringify(normalized))
  if (!supportsCompression()) {
    return `${ENCODING_PLAIN_PREFIX}${bytesToBase64Url(jsonBytes)}`
  }
  const compressed = await pipeBytes(
    jsonBytes,
    new CompressionStream('deflate-raw'),
  )
  return `${ENCODING_DEFLATE_PREFIX}${bytesToBase64Url(compressed)}`
}

/**
 * デコードを受け付けるエンコード文字列長の上限。
 * 正規の URL は 100 問でも 1,300 文字程度(設計書 §2-2)。これを大きく超える
 * 入力は、展開すると巨大になる圧縮データ(メモリ攻撃)の可能性があるため拒否する。
 */
export const SHARED_QUIZ_ENCODED_MAX_LENGTH = 20000

/** エンコード済み文字列を復元する。壊れていれば null(例外は投げない)。 */
export async function decodeSharedQuizPayload(
  encoded: string,
): Promise<SharedQuizPayload | null> {
  if (encoded.length > SHARED_QUIZ_ENCODED_MAX_LENGTH) {
    return null
  }
  try {
    let jsonBytes: Uint8Array
    if (encoded.startsWith(ENCODING_DEFLATE_PREFIX)) {
      if (!supportsCompression()) {
        return null
      }
      jsonBytes = await pipeBytes(
        base64UrlToBytes(encoded.slice(ENCODING_DEFLATE_PREFIX.length)),
        new DecompressionStream('deflate-raw'),
      )
    } else if (encoded.startsWith(ENCODING_PLAIN_PREFIX)) {
      jsonBytes = base64UrlToBytes(encoded.slice(ENCODING_PLAIN_PREFIX.length))
    } else {
      return null
    }
    const raw: unknown = JSON.parse(new TextDecoder().decode(jsonBytes))
    return normalizeSharedQuizPayload(raw)
  } catch {
    return null
  }
}

/** location.hash から共有クイズのエンコード文字列を取り出す。無ければ null。 */
export function extractSharedQuizParam(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw) {
    return null
  }
  const value = new URLSearchParams(raw).get(SHARED_QUIZ_HASH_KEY)
  return value && value.length > 0 ? value : null
}

/** 共有 URL を組み立てる。pageUrl はハッシュ・クエリを含まないページ URL。 */
export function buildSharedQuizUrl(pageUrl: string, encoded: string): string {
  return `${pageUrl}#${SHARED_QUIZ_HASH_KEY}=${encoded}`
}

export interface PastedNameMatchResult {
  matched: string[]
  unmatched: string[]
}

/**
 * スプレッドシート等から貼り付けたテキストを生徒名のリストとして解釈する。
 * 改行・タブ・カンマ区切りを受け付け、表記ゆれ(全半角・かな)を吸収して照合する。
 */
export function matchPastedStudentNames(
  text: string,
  validNames: readonly string[],
): PastedNameMatchResult {
  const nameByKey = new Map(
    validNames.map((name) => [normalizeQuizAnswer(name), name]),
  )
  const matched: string[] = []
  const unmatched: string[] = []
  const seen = new Set<string>()
  for (const token of text.split(/[\n\r\t,、]+/)) {
    const trimmed = token.trim()
    if (!trimmed) {
      continue
    }
    const key = normalizeQuizAnswer(trimmed)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    const name = nameByKey.get(key)
    if (name !== undefined) {
      matched.push(name)
    } else {
      unmatched.push(trimmed)
    }
  }
  return { matched, unmatched }
}

export interface SheetQuizEntryRef {
  Name: string
  PrimaryId: number
}

export interface SheetParseResult {
  questions: SharedQuizQuestion[]
  /** 解釈できなかった行の説明(行番号つき)。 */
  errors: string[]
}

const SHEET_TYPE_CHOICE = '択一'
const SHEET_TYPE_MATCH = 'マッチ'
const SHEET_TYPE_INPUT = '入力'
const SHEET_TYPE_INPUT_LUNATIC = '入力L'
/** 択一の誤答セルに書くと「挑むたびにランダムな誤答」になる予約語。 */
export const SHEET_RANDOM_WRONG = 'ランダム'

/**
 * 1行=1問のテキスト(スプレッドシート由来)を問題リストへ変換する。
 *
 *   択一, シロコ, シロコ＊テラー, ランダム   ← 先頭が正解、以降が誤答
 *   マッチ, シロコ, シロコ（水着）
 *   入力, 天童アリス                          ← 「入力L」で Lunatic
 *
 * 区切りはタブ・カンマ両対応。名前は表記ゆれ(全半角・かな)を吸収して照合する。
 */
export function parseQuestionSheetText(
  text: string,
  entries: readonly SheetQuizEntryRef[],
): SheetParseResult {
  const idByNameKey = new Map(
    entries.map((entry) => [normalizeQuizAnswer(entry.Name), entry.PrimaryId]),
  )
  const questions: SharedQuizQuestion[] = []
  const errors: string[] = []

  text.split(/\r?\n/).forEach((line, index) => {
    const cells = line
      .split(/[\t,、]/)
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0)
    if (cells.length === 0) {
      return
    }
    const lineNo = index + 1
    const [type, ...rawNames] = cells
    // 択一の誤答セルは「ランダム」でランダム枠になる(名前照合の対象外)。
    let randomCount = 0
    const names = rawNames.filter((name) => {
      if (type === SHEET_TYPE_CHOICE && name === SHEET_RANDOM_WRONG) {
        randomCount += 1
        return false
      }
      return true
    })
    const ids: number[] = []
    const unknown: string[] = []
    for (const name of names) {
      const id = idByNameKey.get(normalizeQuizAnswer(name))
      if (id === undefined) {
        unknown.push(name)
      } else {
        ids.push(id)
      }
    }
    if (unknown.length > 0) {
      errors.push(`${lineNo}行目: 見つからない名前 ${unknown.join('、')}`)
      return
    }

    let question: SharedQuizQuestion | null = null
    if (type === SHEET_TYPE_CHOICE) {
      question =
        ids.length >= 1
          ? normalizeSharedQuizQuestion({
              t: 'c',
              a: ids[0],
              o: ids.slice(1),
              r: randomCount,
            })
          : null
      if (!question) {
        errors.push(
          `${lineNo}行目: 択一は「正解, 誤答...」(誤答は名前か${SHEET_RANDOM_WRONG})が必要です`,
        )
        return
      }
    } else if (type === SHEET_TYPE_MATCH) {
      question = normalizeSharedQuizQuestion({ t: 'm', e: ids })
      if (!question) {
        errors.push(
          `${lineNo}行目: マッチは${SHARED_QUIZ_MATCH_MIN_ENTRIES}〜${SHARED_QUIZ_MATCH_MAX_ENTRIES}名(重複なし)が必要です`,
        )
        return
      }
    } else if (type === SHEET_TYPE_INPUT || type === SHEET_TYPE_INPUT_LUNATIC) {
      question =
        ids.length === 1
          ? normalizeSharedQuizQuestion({
              t: 'i',
              a: ids[0],
              lu: type === SHEET_TYPE_INPUT_LUNATIC,
            })
          : null
      if (!question) {
        errors.push(`${lineNo}行目: 入力は正解1名だけを書いてください`)
        return
      }
    } else {
      errors.push(
        `${lineNo}行目: 形式は ${SHEET_TYPE_CHOICE}/${SHEET_TYPE_MATCH}/${SHEET_TYPE_INPUT}/${SHEET_TYPE_INPUT_LUNATIC} のいずれかにしてください`,
      )
      return
    }
    questions.push(question)
  })

  return {
    questions: questions.slice(0, SHARED_QUIZ_MAX_QUESTIONS),
    errors,
  }
}

/** エディタの問題リストをシート形式のテキストへ書き出す(parse と往復可能)。 */
export function buildQuestionSheetText(
  questions: readonly SharedQuizQuestion[],
  entries: readonly SheetQuizEntryRef[],
): string {
  const nameById = new Map(
    entries.map((entry) => [entry.PrimaryId, entry.Name]),
  )
  const name = (id: number) => nameById.get(id) ?? `?${id}`
  return questions
    .map((question) => {
      if (question.t === 'c') {
        return [
          SHEET_TYPE_CHOICE,
          name(question.a),
          ...question.o.map(name),
          ...Array.from({ length: question.r ?? 0 }, () => SHEET_RANDOM_WRONG),
        ]
      }
      if (question.t === 'm') {
        return [SHEET_TYPE_MATCH, ...question.e.map(name)]
      }
      return [
        question.lu ? SHEET_TYPE_INPUT_LUNATIC : SHEET_TYPE_INPUT,
        name(question.a),
      ]
    })
    .map((cells) => cells.join('\t'))
    .join('\n')
}

export interface ResultShareTextOptions {
  /** 共有クイズのタイトル。通常クイズの結果共有では null。 */
  title: string | null
  correctCount: number
  totalCount: number
  /** シェア文に載せる URL。挑戦状ならその共有 URL、通常はアプリの URL。 */
  url: string
}

export const RESULT_SHARE_HASHTAG = '#ブルアカタイトルコールクイズ'

/** SNS 共有用の結果テキストを組み立てる。 */
export function buildResultShareText(options: ResultShareTextOptions): string {
  const { title, correctCount, totalCount, url } = options
  const accuracy =
    totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0
  const quizLabel = title ? `「${title}」` : 'タイトルコールクイズ'
  const scoreLine = `${quizLabel}で ${correctCount}/${totalCount}問 正解！(正答率${accuracy}%)`
  const perfectLine =
    totalCount > 0 && correctCount === totalCount
      ? '💮100点満点、花丸です！\n'
      : ''
  return `${scoreLine}\n${perfectLine}${RESULT_SHARE_HASHTAG}\n${url}`
}

/** X(Twitter) の投稿画面を開く URL。 */
export function buildTweetIntentUrl(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
}
