import {
  normalizeProficiencyMap,
  type ProficiencyMap,
} from '@/lib/quizProgress'

/**
 * 進捗データの持ち出し・取り込みで使う純関数群。
 * 端末間のマージは行わず、常に「置き換え」で扱う(仕様を単純に保つため)。
 */

export const PROGRESS_EXPORT_FORMAT_VERSION = 1

export interface ProgressExport {
  formatVersion: number
  exportedAt: string
  proficiency: ProficiencyMap
}

export function buildProgressExport(
  proficiency: ProficiencyMap,
  exportedAt: string,
): ProgressExport {
  return {
    formatVersion: PROGRESS_EXPORT_FORMAT_VERSION,
    exportedAt,
    proficiency: normalizeProficiencyMap(proficiency),
  }
}

export function serializeProgressExport(payload: ProgressExport): string {
  return JSON.stringify(payload, null, 2)
}

/**
 * エクスポート形式・素の習熟度マップのどちらでも受け付ける。
 * 解釈できない場合は null、記録が 0 件の場合は空マップを返す。
 */
export function parseProgressExport(text: string): ProficiencyMap | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') {
    return null
  }
  const container = parsed as { proficiency?: unknown }
  const source =
    container.proficiency && typeof container.proficiency === 'object'
      ? container.proficiency
      : parsed
  return normalizeProficiencyMap(source)
}

export function countProficiencyRecords(map: ProficiencyMap): number {
  return Object.values(map).filter((entry) => entry.attempts > 0).length
}

/**
 * ローカルとリモートのどちらを採用するかを更新時刻で決める(Last Write Wins)。
 * 解釈できない時刻はローカル優先とし、リモートで上書きしない。
 */
export function pickNewerSide(
  localUpdatedAt: string | null,
  remoteUpdatedAt: string | null,
): 'local' | 'remote' {
  const remoteTime = remoteUpdatedAt ? Date.parse(remoteUpdatedAt) : Number.NaN
  if (!Number.isFinite(remoteTime)) {
    return 'local'
  }
  const localTime = localUpdatedAt ? Date.parse(localUpdatedAt) : Number.NaN
  if (!Number.isFinite(localTime)) {
    return 'remote'
  }
  return remoteTime > localTime ? 'remote' : 'local'
}
