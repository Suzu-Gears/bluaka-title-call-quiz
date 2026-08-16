import { isValidClipId } from '@/lib/assetKeys'

/**
 * SchaleDB の voice.json を扱う純関数群。
 *
 * voice.json の形:
 *   { "<生徒Id>": { Normal: Clip[], Battle: Clip[], Lobby: Clip[], Event: Clip[] } }
 *   Clip = { Group: string, AudioClip: string, Transcription?: string }
 *
 * タイトルコールは Group === 'UITitleIdle1'。AudioClip は
 * https://r2.schaledb.com/voice/ からの相対パス(例: 'jp_aru/aru_title.mp3')で、
 * DevName / PathName から URL を推測する必要はない。
 */

export const TITLE_CALL_GROUP = 'UITitleIdle1'
export const VOICE_ASSET_BASE_URL = 'https://r2.schaledb.com/voice/'

/** カバー率がこれを下回ったらスキーマ変更を疑う(実測 270/272 = 約99%)。 */
export const MIN_TITLE_CALL_COVERAGE = 0.95
/** students.json と voice.json の Id 集合のずれの許容割合。 */
export const MAX_ID_SET_DIVERGENCE = 0.05

/**
 * 生徒 Id ごとのタイトルコール AudioClip パスを抽出する。
 * カテゴリ名は決め打ちせず全カテゴリを走査するため、SchaleDB 側で
 * カテゴリが増えても取りこぼさない。1件も無い生徒はマップに載らない。
 */
export function extractTitleCalls(raw: unknown): Map<number, string[]> {
  const result = new Map<number, string[]>()
  if (!raw || typeof raw !== 'object') {
    return result
  }

  for (const [rawId, entry] of Object.entries(raw as Record<string, unknown>)) {
    const studentId = Number(rawId)
    if (!Number.isInteger(studentId)) {
      continue
    }
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const clips: string[] = []
    for (const category of Object.values(entry as Record<string, unknown>)) {
      if (!Array.isArray(category)) {
        continue
      }
      for (const item of category) {
        if (!item || typeof item !== 'object') {
          continue
        }
        const { Group, AudioClip } = item as {
          Group?: unknown
          AudioClip?: unknown
        }
        if (Group !== TITLE_CALL_GROUP) {
          continue
        }
        if (typeof AudioClip !== 'string' || AudioClip.length === 0) {
          continue
        }
        if (!clips.includes(AudioClip)) {
          clips.push(AudioClip)
        }
      }
    }

    if (clips.length > 0) {
      result.set(studentId, clips)
    }
  }

  return result
}

/**
 * AudioClip パスから clipId を取り出す。
 * 'jp_ch0355/np0288_title.mp3' -> 'np0288_title'
 * キー規約で使えない文字が含まれる場合は null(呼び出し側で警告してスキップ)。
 */
export function clipIdFromAudioClip(audioClip: string): string | null {
  const fileName = audioClip.split('/').pop() ?? ''
  if (!fileName.toLowerCase().endsWith('.mp3')) {
    return null
  }
  const clipId = fileName.slice(0, -'.mp3'.length)
  return isValidClipId(clipId) ? clipId : null
}

export function resolveVoiceAssetUrl(audioClip: string): string {
  return `${VOICE_ASSET_BASE_URL}${audioClip.replace(/^\/+/, '')}`
}

export interface TitleCallDownload {
  /** voice.json 上の掲載メンバー。新規クリップの保存先フォルダになる。 */
  studentId: number
  clipId: string
  audioClip: string
}

export interface TitleCallDownloadPlan {
  downloads: TitleCallDownload[]
  /** キー規約で扱えない AudioClip(警告対象) */
  unusable: string[]
}

/**
 * voice.json のうち、まだ R2 に存在しないクリップだけを取得対象にする。
 *
 * 存在判定は clipId 単位でグローバルに行う(clipId は SchaleDB 全体で一意)。
 * フォルダ(生徒Id)を判定に含めないため、クリップを本来の形態のフォルダへ
 * 移動しても(シュン（水着）の np0288 を 10144 側へ置くなど)、voice.json の
 * 掲載位置に基づいて再ダウンロードされることがない。
 */
export function planTitleCallDownloads(
  titleCalls: ReadonlyMap<number, readonly string[]>,
  existingClipIds: ReadonlySet<string>,
): TitleCallDownloadPlan {
  const downloads: TitleCallDownload[] = []
  const unusable: string[] = []
  const planned = new Set<string>()

  for (const [studentId, audioClips] of titleCalls) {
    for (const audioClip of audioClips) {
      const clipId = clipIdFromAudioClip(audioClip)
      if (!clipId) {
        unusable.push(`${audioClip} (Id=${studentId})`)
        continue
      }
      if (existingClipIds.has(clipId) || planned.has(clipId)) {
        continue
      }
      planned.add(clipId)
      downloads.push({ studentId, clipId, audioClip })
    }
  }

  return { downloads, unusable }
}

export interface TitleCallSchemaCheckParams {
  studentIds: readonly number[]
  voiceIds: readonly number[]
  titleCalls: ReadonlyMap<number, readonly string[]>
}

/**
 * voice.json のスキーマが想定から外れていないかを検査し、問題点を文字列で返す。
 * 空配列なら問題なし。ビルド側はこれが空でなければ失敗させる
 * (静かに劣化したサイトをデプロイしないため)。
 */
export function checkTitleCallSchema({
  studentIds,
  voiceIds,
  titleCalls,
}: TitleCallSchemaCheckParams): string[] {
  const problems: string[] = []

  if (studentIds.length === 0) {
    problems.push('students.json から生徒データを1件も読み取れませんでした。')
    return problems
  }

  const withTitleCall = studentIds.filter(
    (id) => (titleCalls.get(id)?.length ?? 0) > 0,
  ).length
  const coverage = withTitleCall / studentIds.length
  if (coverage < MIN_TITLE_CALL_COVERAGE) {
    problems.push(
      `タイトルコールの取得率が ${(coverage * 100).toFixed(1)}% しかありません` +
        `(${withTitleCall}/${studentIds.length}、期待は ${MIN_TITLE_CALL_COVERAGE * 100}% 以上)。` +
        `Group 名 '${TITLE_CALL_GROUP}' の変更を疑ってください。`,
    )
  }

  const invalidPaths: string[] = []
  for (const clips of titleCalls.values()) {
    for (const clip of clips) {
      if (!clip.toLowerCase().endsWith('.mp3')) {
        invalidPaths.push(clip)
      }
    }
  }
  if (invalidPaths.length > 0) {
    problems.push(
      `AudioClip が .mp3 で終わらない要素が ${invalidPaths.length} 件あります: ` +
        `${invalidPaths.slice(0, 5).join(', ')}`,
    )
  }

  if (voiceIds.length > 0) {
    const studentIdSet = new Set(studentIds)
    const voiceIdSet = new Set(voiceIds)
    let divergence = 0
    for (const id of studentIdSet) {
      if (!voiceIdSet.has(id)) divergence += 1
    }
    for (const id of voiceIdSet) {
      if (!studentIdSet.has(id)) divergence += 1
    }
    const ratio = divergence / Math.max(studentIdSet.size, voiceIdSet.size)
    if (ratio > MAX_ID_SET_DIVERGENCE) {
      problems.push(
        `students.json と voice.json の Id 集合が ${(ratio * 100).toFixed(1)}% ずれています` +
          `(差分 ${divergence} 件)。データ形式の変更を疑ってください。`,
      )
    }
  }

  return problems
}
