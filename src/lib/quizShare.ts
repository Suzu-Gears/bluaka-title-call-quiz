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

export const SHARED_QUIZ_VERSION = 1
export const SHARED_QUIZ_HASH_KEY = 'c'
export const SHARED_QUIZ_TITLE_MAX_LENGTH = 40
/** URL が非常識な長さにならないよう、1つの共有クイズに入れられる生徒数の上限。 */
export const SHARED_QUIZ_MAX_ENTRIES = 300

export const SHARED_QUIZ_MODES = [
  'multiple-choice',
  'name-input',
  'name-input-lunatic',
] as const

export type SharedQuizMode = (typeof SHARED_QUIZ_MODES)[number]

export interface SharedQuizPayload {
  v: number
  /** クイズのタイトル。空文字も許容する(表示側で既定名を補う)。 */
  title: string
  mode: SharedQuizMode
  /** 出題する生徒の PrimaryId のリスト。 */
  ids: number[]
}

const ENCODING_DEFLATE_PREFIX = '1.'
const ENCODING_PLAIN_PREFIX = '0.'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isSharedQuizMode = (value: unknown): value is SharedQuizMode =>
  typeof value === 'string' &&
  (SHARED_QUIZ_MODES as readonly string[]).includes(value)

/**
 * 外部由来の値を検証して共有クイズ定義に整える。壊れていれば null。
 * ids は正の整数のみ残し、重複を除いて上限件数で打ち切る。
 */
export function normalizeSharedQuizPayload(
  raw: unknown,
): SharedQuizPayload | null {
  if (!isRecord(raw)) {
    return null
  }
  if (raw.v !== SHARED_QUIZ_VERSION) {
    return null
  }
  if (!isSharedQuizMode(raw.mode)) {
    return null
  }
  if (!Array.isArray(raw.ids)) {
    return null
  }
  const ids = [
    ...new Set(
      raw.ids.filter(
        (id): id is number =>
          typeof id === 'number' && Number.isInteger(id) && id > 0,
      ),
    ),
  ].slice(0, SHARED_QUIZ_MAX_ENTRIES)
  if (ids.length === 0) {
    return null
  }
  const title =
    typeof raw.title === 'string'
      ? raw.title.trim().slice(0, SHARED_QUIZ_TITLE_MAX_LENGTH)
      : ''
  return { v: SHARED_QUIZ_VERSION, title, mode: raw.mode, ids }
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

/** エンコード済み文字列を復元する。壊れていれば null(例外は投げない)。 */
export async function decodeSharedQuizPayload(
  encoded: string,
): Promise<SharedQuizPayload | null> {
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
