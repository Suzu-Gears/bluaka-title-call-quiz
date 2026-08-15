/**
 * R2 バケットと public/ 配下で共通のアセット配置規約。
 *
 *   audio/{studentId}/{clipId}.g{generation}.mp3
 *   image/{studentId}.webp
 *   meta/audio-manifest.json
 *
 * 生徒 Id をフォルダにすることで、手動で置いたファイルの帰属が一意に決まる。
 * 世代は追記専用で、録り直しがあっても過去のファイルを上書きしない。
 */

export interface AudioKeyParts {
  studentId: number
  clipId: string
  generation: number
}

/** clipId に使える文字。パース時の曖昧さを避けるためドットを含めない。 */
const CLIP_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const AUDIO_KEY_PATTERN = /^audio\/(\d+)\/([A-Za-z0-9_-]+)\.g([1-9]\d*)\.mp3$/
const IMAGE_KEY_PATTERN = /^image\/(\d+)\.webp$/

export const AUDIO_KEY_PREFIX = 'audio/'
export const IMAGE_KEY_PREFIX = 'image/'
export const AUDIO_MANIFEST_KEY = 'meta/audio-manifest.json'

export function isValidClipId(clipId: string): boolean {
  return CLIP_ID_PATTERN.test(clipId)
}

export function parseAudioKey(key: string): AudioKeyParts | null {
  const match = AUDIO_KEY_PATTERN.exec(key)
  if (!match) {
    return null
  }
  return {
    studentId: Number(match[1]),
    clipId: match[2],
    generation: Number(match[3]),
  }
}

export function formatAudioKey({
  studentId,
  clipId,
  generation,
}: AudioKeyParts): string {
  if (!Number.isInteger(studentId) || studentId < 0) {
    throw new Error(`Invalid studentId for audio key: ${studentId}`)
  }
  if (!isValidClipId(clipId)) {
    throw new Error(`Invalid clipId for audio key: ${clipId}`)
  }
  if (!Number.isInteger(generation) || generation < 1) {
    throw new Error(`Invalid generation for audio key: ${generation}`)
  }
  return `${AUDIO_KEY_PREFIX}${studentId}/${clipId}.g${generation}.mp3`
}

export function parseImageKey(key: string): number | null {
  const match = IMAGE_KEY_PATTERN.exec(key)
  return match ? Number(match[1]) : null
}

export function formatImageKey(studentId: number): string {
  if (!Number.isInteger(studentId) || studentId < 0) {
    throw new Error(`Invalid studentId for image key: ${studentId}`)
  }
  return `${IMAGE_KEY_PREFIX}${studentId}.webp`
}

/** ラベル定義ファイルと音声マニフェストで使う、世代まで含めた識別子。 */
export function formatClipRef({
  studentId,
  clipId,
  generation,
}: AudioKeyParts): string {
  return `${studentId}/${clipId}.g${generation}`
}

/** 世代を含まない、クリップ系列の識別子。世代採番のグループ化に使う。 */
export function formatClipSeriesRef(studentId: number, clipId: string): string {
  return `${studentId}/${clipId}`
}
