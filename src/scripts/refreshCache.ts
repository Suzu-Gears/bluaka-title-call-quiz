import path from 'node:path'

import {
  AUDIO_MANIFEST_KEY,
  type AudioKeyParts,
  formatAudioKey,
  formatClipSeriesRef,
  parseAudioKey,
} from '@/lib/assetKeys'
import {
  loadSchaleDBSnapshot,
  PUBLIC_DIR,
  saveAudioManifest,
  TMP_DIR,
} from '@/lib/assetPipeline'
import {
  hasSourceChanged,
  normalizeAudioManifest,
  upsertClipRecord,
} from '@/lib/audioManifest'
import {
  getObjectJson,
  isR2Configured,
  listObjectKeys,
  uploadFileToR2,
} from '@/lib/cloudflareR2Client'
import {
  listFilesRecursively,
  readLocalJSONIfValid,
} from '@/lib/fileOperations'
import {
  DEFAULT_REQUEST_INTERVAL_MS,
  downloadBinary,
  headRemoteAsset,
  sleep,
} from '@/lib/schaleDBClient'
import { clipIdFromAudioClip, resolveVoiceAssetUrl } from '@/lib/voiceData'

/**
 * SchaleDB 側の音源が差し替わっていないかを調べ、変わっていれば
 * 既存を残したまま次の世代として追加する(声優降板・録り直し対応)。
 *
 * 通常ビルドからは分離してある。毎ビルドで全件 HEAD を送ると
 * SchaleDB への負荷になるため、手動または月次で実行する想定。
 */

const useR2 = isR2Configured()
const now = () => new Date().toISOString()

const { titleCalls } = await loadSchaleDBSnapshot()

const existingKeys = (
  useR2
    ? await listObjectKeys('audio/')
    : listFilesRecursively(path.join(PUBLIC_DIR, 'audio')).map(
        (relativePath) => `audio/${relativePath}`,
      )
)
  .map(parseAudioKey)
  .filter((parts): parts is AudioKeyParts => parts !== null)

const latestGenerationBySeries = new Map<string, number>()
for (const key of existingKeys) {
  const seriesRef = formatClipSeriesRef(key.studentId, key.clipId)
  latestGenerationBySeries.set(
    seriesRef,
    Math.max(latestGenerationBySeries.get(seriesRef) ?? 0, key.generation),
  )
}

const manifestRaw = useR2
  ? ((await getObjectJson(AUDIO_MANIFEST_KEY)) ??
    readLocalJSONIfValid(path.join(TMP_DIR, 'audio-manifest.json')))
  : readLocalJSONIfValid(path.join(TMP_DIR, 'audio-manifest.json'))
let manifest = normalizeAudioManifest(manifestRaw, now())

const added: string[] = []
const recorded: string[] = []
const failed: string[] = []
let checked = 0

for (const [studentId, audioClips] of titleCalls) {
  for (const audioClip of audioClips) {
    const clipId = clipIdFromAudioClip(audioClip)
    if (!clipId) {
      continue
    }
    const seriesRef = formatClipSeriesRef(studentId, clipId)
    const latestGeneration = latestGenerationBySeries.get(seriesRef)
    if (latestGeneration === undefined) {
      // まだ 1 度も取得していない系列。通常ビルド側の差分補充に任せる。
      continue
    }

    const sourceUrl = resolveVoiceAssetUrl(audioClip)
    checked += 1
    const signature = await headRemoteAsset(sourceUrl)
    await sleep(DEFAULT_REQUEST_INTERVAL_MS)
    if (!signature) {
      failed.push(`${seriesRef} (HEAD 失敗)`)
      continue
    }

    const previous = manifest.clips[seriesRef]
    if (!previous) {
      // 指紋が未記録なら、比較の基準としてまず現在値を記録する。
      manifest = upsertClipRecord(manifest, seriesRef, {
        generation: latestGeneration,
        sourceUrl,
        etag: signature.etag,
        size: signature.size,
        checkedAt: now(),
      })
      recorded.push(seriesRef)
      continue
    }

    if (!hasSourceChanged(previous, signature)) {
      continue
    }

    const nextGeneration = latestGeneration + 1
    const parts: AudioKeyParts = {
      studentId,
      clipId,
      generation: nextGeneration,
    }
    const key = formatAudioKey(parts)
    const localPath = path.join(PUBLIC_DIR, key)
    try {
      // 実際に保存したファイルの指紋を記録する(HEAD の値ではなく)。
      const downloaded = await downloadBinary(sourceUrl, localPath)
      if (useR2) {
        await uploadFileToR2(localPath, key, 'audio/mpeg')
      }
      manifest = upsertClipRecord(manifest, seriesRef, {
        generation: nextGeneration,
        sourceUrl,
        etag: downloaded.etag ?? signature.etag,
        size: downloaded.size ?? signature.size,
        checkedAt: now(),
      })
      latestGenerationBySeries.set(seriesRef, nextGeneration)
      added.push(key)
      console.log(`新しい世代を追加: ${key}`)
    } catch (error) {
      failed.push(`${key} (${(error as Error).message})`)
      console.error(`世代の追加に失敗: ${key}: ${(error as Error).message}`)
    }
    await sleep(DEFAULT_REQUEST_INTERVAL_MS)
  }
}

await saveAudioManifest(manifest, useR2)

console.log('')
console.log(`確認: ${checked} 件`)
console.log(`新規世代: ${added.length} 件`)
if (added.length > 0) {
  added.forEach((key) => console.log(`  ${key}`))
  console.log(
    '表示名を付ける場合は src/data/audioLabels.ts に追記してください。',
  )
}
if (recorded.length > 0) {
  console.log(
    `指紋を初回記録: ${recorded.length} 件(次回から差分を検知できます)`,
  )
}
if (failed.length > 0) {
  console.error(`失敗: ${failed.length} 件`)
  failed.forEach((item) => console.error(`  ${item}`))
}
