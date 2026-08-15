import type { RemoteAssetSignature } from '@/lib/schaleDBClient'

/**
 * 各クリップ系列(生徒Id + clipId)について、最後に取り込んだ音源の指紋を記録する。
 * cache:refresh はこれと現在の SchaleDB 側 HEAD を比較し、
 * 差異があれば「録り直し」とみなして新しい世代を追加する。
 */

export const AUDIO_MANIFEST_VERSION = 1

export interface AudioManifestEntry {
  /** この指紋に対応する世代番号(= その系列の最新世代) */
  generation: number
  sourceUrl: string
  etag: string | null
  size: number | null
  checkedAt: string
}

export interface AudioManifest {
  version: number
  updatedAt: string
  /** キーは `${studentId}/${clipId}` */
  clips: Record<string, AudioManifestEntry>
}

export function createEmptyAudioManifest(now: string): AudioManifest {
  return { version: AUDIO_MANIFEST_VERSION, updatedAt: now, clips: {} }
}

export function normalizeAudioManifest(
  raw: unknown,
  now: string,
): AudioManifest {
  if (!raw || typeof raw !== 'object') {
    return createEmptyAudioManifest(now)
  }
  const source = raw as Partial<AudioManifest>
  const clips: Record<string, AudioManifestEntry> = {}

  if (source.clips && typeof source.clips === 'object') {
    for (const [ref, value] of Object.entries(source.clips)) {
      if (!value || typeof value !== 'object') {
        continue
      }
      const entry = value as Partial<AudioManifestEntry>
      const generation = Number(entry.generation)
      if (!Number.isInteger(generation) || generation < 1) {
        continue
      }
      const size = Number(entry.size)
      clips[ref] = {
        generation,
        sourceUrl: typeof entry.sourceUrl === 'string' ? entry.sourceUrl : '',
        etag: typeof entry.etag === 'string' ? entry.etag : null,
        size: Number.isFinite(size) && size > 0 ? size : null,
        checkedAt: typeof entry.checkedAt === 'string' ? entry.checkedAt : now,
      }
    }
  }

  return {
    version: AUDIO_MANIFEST_VERSION,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : now,
    clips,
  }
}

export function upsertClipRecord(
  manifest: AudioManifest,
  seriesRef: string,
  entry: AudioManifestEntry,
): AudioManifest {
  return {
    version: AUDIO_MANIFEST_VERSION,
    updatedAt: entry.checkedAt,
    clips: { ...manifest.clips, [seriesRef]: entry },
  }
}

/**
 * 音源が差し替わったかを判定する。
 * ETag が両方あれば ETag、無ければサイズで比較する。
 * どちらも判断材料が無い場合は「変化なし」とし、誤検知で世代を増やさない。
 */
export function hasSourceChanged(
  previous: AudioManifestEntry | undefined,
  current: RemoteAssetSignature,
): boolean {
  if (!previous) {
    return false
  }
  if (previous.etag && current.etag) {
    return previous.etag !== current.etag
  }
  if (previous.size !== null && current.size !== null) {
    return previous.size !== current.size
  }
  return false
}
