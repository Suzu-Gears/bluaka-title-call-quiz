import fs from 'node:fs'
import path from 'node:path'

import {
  AUDIO_LABELS_KEY,
  AUDIO_MANIFEST_KEY,
  type AudioKeyParts,
  formatAudioKey,
  formatClipRef,
  parseAudioKey,
} from '@/lib/assetKeys'
import { PUBLIC_DIR, saveAudioManifest, TMP_DIR } from '@/lib/assetPipeline'
import { normalizeAudioManifest, upsertClipRecord } from '@/lib/audioManifest'
import {
  copyObject,
  deleteObject,
  getObjectJson,
  isR2Configured,
  listObjectKeys,
  putObjectJson,
  uploadFileToR2,
} from '@/lib/cloudflareR2Client'
import { ensureDirectory, saveJSON } from '@/lib/fileOperations'

/**
 * 手元にある旧音源を「過去の世代」として系列に組み込む。
 *
 *   npm run r2:add-old-gen -- <clipId> <旧音源のパス> --voice-actor <旧声優名>
 *
 * 既存の世代を g+1 へ繰り上げてから旧音源を g1 として置くので、
 * 「最新世代のみ再生する」既定の挙動(クイズ・カード一覧の初期選択)は
 * 現行音声のまま変わらない。あわせて meta/audio-labels.json と
 * meta/audio-manifest.json も追従させる。
 */

const args = process.argv.slice(2)
const positional: string[] = []
let voiceActor = ''
let oldLabel = '旧声優版'
let currentLabel = '現行版'
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--voice-actor') {
    voiceActor = args[++i] ?? ''
  } else if (arg === '--label') {
    oldLabel = args[++i] ?? oldLabel
  } else if (arg === '--current-label') {
    currentLabel = args[++i] ?? currentLabel
  } else {
    positional.push(arg)
  }
}

const [clipId, oldFilePath] = positional
if (!clipId || !oldFilePath) {
  console.error(
    '使い方: npm run r2:add-old-gen -- <clipId> <旧音源のパス> [--voice-actor 名前] [--label 旧声優版] [--current-label 現行版]',
  )
  process.exit(1)
}
if (!fs.existsSync(oldFilePath)) {
  console.error(`旧音源が見つかりません: ${oldFilePath}`)
  process.exit(1)
}
if (!isR2Configured()) {
  console.error('R2 の環境変数が設定されていません。')
  process.exit(1)
}

// --- 系列の現状を把握する ---
const seriesKeys = (await listObjectKeys('audio/'))
  .map(parseAudioKey)
  .filter((parts): parts is AudioKeyParts => parts !== null)
  .filter((parts) => parts.clipId === clipId)
  .sort((a, b) => a.generation - b.generation)

if (seriesKeys.length === 0) {
  console.error(`R2 に clipId '${clipId}' の音声がありません。`)
  process.exit(1)
}
const folderId = seriesKeys[0].studentId
if (seriesKeys.some((parts) => parts.studentId !== folderId)) {
  console.error(
    `clipId '${clipId}' が複数フォルダに存在します。先に整理してください。`,
  )
  process.exit(1)
}
if (seriesKeys[0].generation !== 1) {
  console.error(
    `世代が g1 から始まっていません: ${seriesKeys.map(formatAudioKey).join(', ')}`,
  )
  process.exit(1)
}

console.log(
  `系列: ${seriesKeys.map(formatAudioKey).join(', ')} (フォルダ=${folderId})`,
)

// --- 既存世代を新しい方から順に g+1 へ繰り上げる(コピー→削除) ---
for (const parts of [...seriesKeys].reverse()) {
  const fromKey = formatAudioKey(parts)
  const toKey = formatAudioKey({ ...parts, generation: parts.generation + 1 })
  console.log(`繰り上げ: ${fromKey} -> ${toKey}`)
  await copyObject(fromKey, toKey)
  const after = await listObjectKeys(toKey)
  if (!after.includes(toKey)) {
    console.error(
      `コピーを確認できませんでした: ${toKey}。中断します(削除は行っていません)。`,
    )
    process.exit(1)
  }
  await deleteObject(fromKey)

  // ローカルミラーも追従させる
  const fromLocal = path.join(PUBLIC_DIR, fromKey)
  const toLocal = path.join(PUBLIC_DIR, toKey)
  if (fs.existsSync(fromLocal)) {
    ensureDirectory(path.dirname(toLocal))
    fs.renameSync(fromLocal, toLocal)
  }
}

// --- 旧音源を g1 として投入 ---
const oldKey = formatAudioKey({ studentId: folderId, clipId, generation: 1 })
const oldLocal = path.join(PUBLIC_DIR, oldKey)
ensureDirectory(path.dirname(oldLocal))
fs.copyFileSync(oldFilePath, oldLocal)
await uploadFileToR2(oldLocal, oldKey, 'audio/mpeg')
console.log(`旧音源を追加: ${oldKey}`)

// --- manifest: 系列の最新世代番号を +1 に更新(指紋は最新世代=現行音源のまま) ---
const manifestRaw = await getObjectJson(AUDIO_MANIFEST_KEY)
let manifest = normalizeAudioManifest(manifestRaw, new Date().toISOString())
const record = manifest.clips[clipId]
if (record) {
  manifest = upsertClipRecord(manifest, clipId, {
    ...record,
    generation: record.generation + 1,
    checkedAt: new Date().toISOString(),
  })
  await saveAudioManifest(manifest, true)
  console.log(`manifest 更新: ${clipId} generation=${record.generation + 1}`)
} else {
  console.log(
    'manifest に指紋が無いため更新なし(次回 refresh で記録されます)。',
  )
}

// --- meta/audio-labels.json: 旧世代のラベル・声優名と現行版ラベルを付ける ---
const labelsRaw = await getObjectJson(AUDIO_LABELS_KEY)
const labels: Record<string, unknown> =
  labelsRaw && typeof labelsRaw === 'object' && !Array.isArray(labelsRaw)
    ? { ...(labelsRaw as Record<string, unknown>) }
    : {}

// 既存ラベルは世代の繰り上げに合わせて付け替える(新しい世代から順に)
for (const parts of [...seriesKeys].reverse()) {
  const fromRef = formatClipRef(clipId, parts.generation)
  const toRef = formatClipRef(clipId, parts.generation + 1)
  if (fromRef in labels) {
    labels[toRef] = labels[fromRef]
    delete labels[fromRef]
  }
}
labels[formatClipRef(clipId, 1)] = {
  label: oldLabel,
  ...(voiceActor ? { voiceActor } : {}),
}
const latestRef = formatClipRef(
  clipId,
  seriesKeys[seriesKeys.length - 1].generation + 1,
)
if (!(latestRef in labels)) {
  labels[latestRef] = currentLabel
}
await putObjectJson(AUDIO_LABELS_KEY, labels)
saveJSON(path.join(TMP_DIR, 'audio-labels.json'), labels)
console.log(
  `ラベル更新: ${formatClipRef(clipId, 1)}=${JSON.stringify(labels[formatClipRef(clipId, 1)])}, ${latestRef}=${JSON.stringify(labels[latestRef])}`,
)

console.log(
  '\n完了。final.json を更新するには npm run local-cache:fetch を実行してください。',
)
