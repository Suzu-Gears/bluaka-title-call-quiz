import fs from 'node:fs'
import path from 'node:path'

import {
  AUDIO_LABELS_KEY,
  AUDIO_MANIFEST_KEY,
  type AudioKeyParts,
  formatAudioKey,
  formatImageKey,
  parseAudioKey,
  parseImageKey,
} from '@/lib/assetKeys'
import { convertOggToMp3 } from '@/lib/audioConvert'
import {
  type AudioManifest,
  createEmptyAudioManifest,
  normalizeAudioManifest,
  upsertClipRecord,
} from '@/lib/audioManifest'
import {
  deriveTitleClipId,
  fetchWikinameMap,
  resolveTitleCallOggUrl,
} from '@/lib/bluearchiveWikiClient'
import {
  downloadObjectToFile,
  getObjectJson,
  isR2Configured,
  listObjectKeys,
  putObjectJson,
  uploadFileToR2,
} from '@/lib/cloudflareR2Client'
import {
  ensureDirectory,
  listFilesRecursively,
  readLocalJSONIfValid,
  saveJSON,
  saveText,
} from '@/lib/fileOperations'
import {
  type AudioClipMetaMap,
  FINAL_DATA_SCHEMA_VERSION,
  type FinalData,
  type Student,
} from '@/lib/interfaces'
import {
  buildQuizEntries,
  extractStudentRecords,
  quizEntriesToCsv,
} from '@/lib/jsonUtils'
import {
  DEFAULT_REQUEST_INTERVAL_MS,
  downloadBinary,
  fetchJsonWithCache,
  isNotFoundError,
  resolveStudentImageUrl,
  SCHALEDB_STUDENTS_URL,
  SCHALEDB_VOICE_URL,
  sleep,
} from '@/lib/schaleDBClient'
import {
  checkTitleCallSchema,
  extractTitleCalls,
  planTitleCallDownloads,
  resolveVoiceAssetUrl,
} from '@/lib/voiceData'

const projectRoot = process.cwd()

export const PUBLIC_DIR = path.join(projectRoot, 'public')
export const TMP_DIR = path.join(projectRoot, 'tmp')
export const AUDIO_DIR = path.join(PUBLIC_DIR, 'audio')
export const IMAGE_DIR = path.join(PUBLIC_DIR, 'image')
export const FINAL_JSON_PATH = path.join(PUBLIC_DIR, 'data/final.json')
const LOCAL_MANIFEST_PATH = path.join(TMP_DIR, 'audio-manifest.json')
const LOCAL_LABELS_PATH = path.join(TMP_DIR, 'audio-labels.json')

/** 失敗がこの件数を超えたらビルドを失敗させる(劣化したサイトを黙って配信しないため)。 */
const DEFAULT_FAILURE_THRESHOLD = 5
const MIRROR_CONCURRENCY = 8

const requestIntervalMs = (() => {
  const raw = Number(process.env.SCHALEDB_REQUEST_INTERVAL_MS)
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_REQUEST_INTERVAL_MS
})()

export interface BuildAssetsResult {
  entryCount: number
  clipCount: number
  addedAudio: string[]
  addedImages: number[]
  failedAudio: string[]
  failedImages: number[]
  /**
   * voice.json には載っているが SchaleDB 側にまだ実ファイルが無いもの(404)。
   * 実装直後の生徒で日常的に起きるため、失敗ではなく待ち状態として扱う。
   */
  pendingAudio: string[]
  pendingImages: number[]
  /** bluearchive.wiki から補完したクリップ(`キー <- 取得元URL`)。 */
  wikiAudio: string[]
  orphanAudioKeys: string[]
  r2OnlyClips: string[]
  entriesWithoutAudio: string[]
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor]
        cursor += 1
        await worker(item)
      }
    },
  )
  await Promise.all(runners)
}

function listLocalAudioKeys(): AudioKeyParts[] {
  return listFilesRecursively(AUDIO_DIR)
    .map((relativePath) => parseAudioKey(`audio/${relativePath}`))
    .filter((parts): parts is AudioKeyParts => parts !== null)
}

function listLocalImageIds(): number[] {
  return listFilesRecursively(IMAGE_DIR)
    .map((relativePath) => parseImageKey(`image/${relativePath}`))
    .filter((id): id is number => id !== null)
}

async function loadAudioManifest(useR2: boolean): Promise<AudioManifest> {
  const now = new Date().toISOString()
  const raw = useR2
    ? ((await getObjectJson(AUDIO_MANIFEST_KEY)) ??
      readLocalJSONIfValid(LOCAL_MANIFEST_PATH))
    : readLocalJSONIfValid(LOCAL_MANIFEST_PATH)
  return raw ? normalizeAudioManifest(raw, now) : createEmptyAudioManifest(now)
}

export async function saveAudioManifest(
  manifest: AudioManifest,
  useR2: boolean,
): Promise<void> {
  saveJSON(LOCAL_MANIFEST_PATH, manifest)
  if (useR2) {
    await putObjectJson(AUDIO_MANIFEST_KEY, manifest)
  }
}

/**
 * クリップの表示名・声優名を R2 の meta/audio-labels.json から読む。
 * 旧声優版などのメタ情報は音声ファイルと同じく R2 が正本で、
 * バケット上の JSON を直接編集すれば次のビルドで final.json に反映される。
 */
async function loadAudioClipLabels(useR2: boolean): Promise<AudioClipMetaMap> {
  const raw = useR2
    ? ((await getObjectJson(AUDIO_LABELS_KEY)) ??
      readLocalJSONIfValid(LOCAL_LABELS_PATH))
    : readLocalJSONIfValid(LOCAL_LABELS_PATH)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const labels: AudioClipMetaMap = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') {
      labels[key] = value
      continue
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>
      labels[key] = {
        ...(typeof record.label === 'string' ? { label: record.label } : {}),
        ...(typeof record.voiceActor === 'string'
          ? { voiceActor: record.voiceActor }
          : {}),
      }
      continue
    }
    console.warn(`audio-labels.json の値を解釈できずスキップします: ${key}`)
  }
  if (useR2) {
    // オフライン(ローカルビルド)でも同じ表示になるようミラーを残す。
    saveJSON(LOCAL_LABELS_PATH, labels)
  }
  return labels
}

export interface SchaleDBSnapshot {
  students: Student[]
  titleCalls: Map<number, string[]>
  voiceIds: number[]
}

/** students.json と voice.json を取得し、スキーマを検査したうえで縮約して返す。 */
export async function loadSchaleDBSnapshot(): Promise<SchaleDBSnapshot> {
  const studentsRaw = await fetchJsonWithCache(
    SCHALEDB_STUDENTS_URL,
    path.join(TMP_DIR, 'schaledb-students.json'),
  )
  const voiceRaw = await fetchJsonWithCache(
    SCHALEDB_VOICE_URL,
    path.join(TMP_DIR, 'schaledb-voice.json'),
  )

  const students = extractStudentRecords(studentsRaw)
  const titleCalls = extractTitleCalls(voiceRaw)
  const voiceIds =
    voiceRaw && typeof voiceRaw === 'object'
      ? Object.keys(voiceRaw as Record<string, unknown>)
          .map(Number)
          .filter(Number.isInteger)
      : []

  const problems = checkTitleCallSchema({
    studentIds: students.map((student) => student.Id),
    voiceIds,
    titleCalls,
  })
  if (problems.length > 0) {
    throw new Error(
      `SchaleDB のデータ形式が想定と異なります:\n- ${problems.join('\n- ')}`,
    )
  }

  return { students, titleCalls, voiceIds }
}

// --- bluearchive.wiki フォールバック ---
// SchaleDB に音源が無い(未公開・掲載取り下げ)タイトルコールを wiki から補う。
// 取り込んだ mp3 は通常のクリップと同じキー体系で置くため、後日 SchaleDB 側に
// 音源が現れても clipId 単位の存在判定により再取得されず、重複しない。
// 指紋は audio-manifest に記録しない: 記録すると refreshCache が SchaleDB 版の
// 公開を「録り直し」と誤認して偽の新世代を作ってしまう(未記録なら次回の
// refresh が現在値を基準として記録し直すだけで済む)。
let wikinamesPromise: Promise<Map<number, string>> | null = null
const getWikinames = (): Promise<Map<number, string>> =>
  (wikinamesPromise ??= fetchWikinameMap())

/**
 * bluearchive.wiki からタイトルコールを取得し、mp3 へ変換して配置する。
 * 成功したら取得元 URL、wiki に無い・失敗した場合は null(呼び出し側は
 * 従来どおり「待ち」として扱う)。
 */
async function fetchAudioFromWiki(
  parts: AudioKeyParts,
  useR2: boolean,
): Promise<string | null> {
  const key = formatAudioKey(parts)
  try {
    const wikiname = (await getWikinames()).get(parts.studentId)
    if (!wikiname) {
      return null
    }
    const oggUrl = await resolveTitleCallOggUrl(wikiname)
    if (!oggUrl) {
      return null
    }
    const oggPath = path.join(TMP_DIR, 'wiki-audio', `${parts.clipId}.ogg`)
    await downloadBinary(oggUrl, oggPath)
    const localPath = path.join(PUBLIC_DIR, key)
    ensureDirectory(path.dirname(localPath))
    await convertOggToMp3(oggPath, localPath)
    if (useR2) {
      await uploadFileToR2(localPath, key, 'audio/mpeg')
    }
    return oggUrl
  } catch (error) {
    console.warn(
      `bluearchive.wiki からの取り込みに失敗: ${key}: ${(error as Error).message}`,
    )
    return null
  }
}

/**
 * ビルド用のアセットを揃え、final.json を出力する。
 *
 * 役割: R2 が配信される音声の正本、SchaleDB は新規クリップの供給源。
 * voice.json から消えたクリップも R2 に残っていれば配信され続ける。
 */
export async function buildAssets(): Promise<BuildAssetsResult> {
  const useR2 = isR2Configured()
  if (!useR2) {
    console.warn(
      'R2 が未設定のため、ローカルの public/ を正本として扱い SchaleDB から直接補充します。',
    )
  }

  const { students, titleCalls } = await loadSchaleDBSnapshot()
  console.log(
    `SchaleDB: 生徒 ${students.length} 件、タイトルコール保有 ${titleCalls.size} 件`,
  )

  const existingAudioKeys = useR2
    ? (await listObjectKeys('audio/'))
        .map(parseAudioKey)
        .filter((parts): parts is AudioKeyParts => parts !== null)
    : listLocalAudioKeys()
  const existingImageIds = useR2
    ? (await listObjectKeys('image/'))
        .map(parseImageKey)
        .filter((id): id is number => id !== null)
    : listLocalImageIds()

  const imageIdSet = new Set(existingImageIds)

  let manifest = await loadAudioManifest(useR2)
  const addedAudio: string[] = []
  const failedAudio: string[] = []
  const pendingAudio: string[] = []
  const addedKeys: AudioKeyParts[] = []
  const wikiAudio: string[] = []

  // --- 音声の差分補充 ---
  // 存在判定は clipId 単位(グローバル)。R2 上でクリップを本来の形態のフォルダへ
  // 移動していても、voice.json の掲載位置に基づいて再取得されることはない。
  const existingClipIds = new Set(existingAudioKeys.map((key) => key.clipId))
  const plan = planTitleCallDownloads(titleCalls, existingClipIds)
  for (const item of plan.unusable) {
    console.warn(`キー規約で扱えない AudioClip をスキップします: ${item}`)
  }

  for (const { studentId, clipId, audioClip } of plan.downloads) {
    const parts: AudioKeyParts = { studentId, clipId, generation: 1 }
    const key = formatAudioKey(parts)
    const sourceUrl = resolveVoiceAssetUrl(audioClip)
    const localPath = path.join(PUBLIC_DIR, key)
    try {
      const signature = await downloadBinary(sourceUrl, localPath)
      if (useR2) {
        await uploadFileToR2(localPath, key, 'audio/mpeg')
      }
      manifest = upsertClipRecord(manifest, clipId, {
        generation: 1,
        sourceUrl,
        etag: signature.etag,
        size: signature.size,
        checkedAt: new Date().toISOString(),
      })
      addedKeys.push(parts)
      addedAudio.push(key)
      console.log(`音声を追加: ${key}`)
    } catch (error) {
      if (isNotFoundError(error)) {
        // 実装直後の生徒は voice.json に載っていても音源がまだ置かれていない。
        // wiki の方が掲載が速いことが多いので、先にそちらを試す。
        const wikiUrl = await fetchAudioFromWiki(parts, useR2)
        if (wikiUrl) {
          addedKeys.push(parts)
          addedAudio.push(key)
          wikiAudio.push(`${key} <- ${wikiUrl}`)
          console.log(`音声を wiki から取り込み: ${key}`)
        } else {
          // wiki にも無ければ従来どおり待ち状態。次回以降のビルドで自動的に拾える。
          pendingAudio.push(`${key} (Id=${studentId})`)
          console.log(`音源が未公開のためスキップ: ${sourceUrl}`)
        }
      } else {
        failedAudio.push(`${key} (${(error as Error).message})`)
        console.error(
          `音声の取得に失敗: ${sourceUrl}: ${(error as Error).message}`,
        )
      }
    }
    await sleep(requestIntervalMs)
  }

  // --- voice.json に掲載が無い生徒の補完(コラボの掲載取り下げなど) ---
  // 初音ミクのように voice.json から消える生徒は通常の差分補充に乗らない。
  // 音源をどこにも持たない生徒に限り wiki を照会する。clipId は SchaleDB の
  // 命名規則に合わせて DevName から導出する(掲載が復活しても重複しない)。
  const studentIdsWithAudio = new Set(
    [...existingAudioKeys, ...addedKeys].map((key) => key.studentId),
  )
  const knownClipIds = new Set([
    ...existingClipIds,
    ...addedKeys.map((key) => key.clipId),
  ])
  for (const student of students) {
    if (titleCalls.has(student.Id) || studentIdsWithAudio.has(student.Id)) {
      continue
    }
    const clipId = deriveTitleClipId(student.DevName)
    if (!clipId || knownClipIds.has(clipId)) {
      continue
    }
    const parts: AudioKeyParts = {
      studentId: student.Id,
      clipId,
      generation: 1,
    }
    const wikiUrl = await fetchAudioFromWiki(parts, useR2)
    if (wikiUrl) {
      const key = formatAudioKey(parts)
      addedKeys.push(parts)
      addedAudio.push(key)
      wikiAudio.push(`${key} <- ${wikiUrl}`)
      knownClipIds.add(clipId)
      console.log(`音声を wiki から取り込み (voice.json 不掲載): ${key}`)
    } else {
      // ホシノ（臨戦）の別レコード(2レコード1音声)などは wiki にも無いのが正常。
      console.log(
        `voice.json に掲載が無く wiki にも音源なし: ${student.Name} (Id=${student.Id})`,
      )
    }
    await sleep(requestIntervalMs)
  }

  // --- 画像の差分補充: 全メンバー分 ---
  const addedImages: number[] = []
  const failedImages: number[] = []
  const pendingImages: number[] = []
  for (const student of students) {
    if (imageIdSet.has(student.Id)) {
      continue
    }
    const key = formatImageKey(student.Id)
    const localPath = path.join(PUBLIC_DIR, key)
    try {
      await downloadBinary(resolveStudentImageUrl(student.Id), localPath)
      if (useR2) {
        await uploadFileToR2(localPath, key, 'image/webp')
      }
      imageIdSet.add(student.Id)
      addedImages.push(student.Id)
      console.log(`画像を追加: ${key} (${student.Name})`)
    } catch (error) {
      if (isNotFoundError(error)) {
        pendingImages.push(student.Id)
        console.log(
          `画像が未公開のためスキップ: ${student.Id} (${student.Name})`,
        )
      } else {
        failedImages.push(student.Id)
        console.error(
          `画像の取得に失敗: ${student.Id} (${student.Name}): ${(error as Error).message}`,
        )
      }
    }
    await sleep(requestIntervalMs)
  }

  await saveAudioManifest(manifest, useR2)

  const audioKeys = [...existingAudioKeys, ...addedKeys]

  // --- R2 → public/ のミラー(ローカルに無いものだけ) ---
  if (useR2) {
    const missingKeys = [
      ...audioKeys.map(formatAudioKey),
      ...[...imageIdSet].map(formatImageKey),
    ].filter((key) => !fs.existsSync(path.join(PUBLIC_DIR, key)))

    if (missingKeys.length > 0) {
      console.log(`R2 から ${missingKeys.length} 件をミラーします...`)
      await runWithConcurrency(missingKeys, MIRROR_CONCURRENCY, async (key) => {
        try {
          await downloadObjectToFile(key, path.join(PUBLIC_DIR, key))
        } catch (error) {
          console.error(
            `R2 からの取得に失敗: ${key}: ${(error as Error).message}`,
          )
          if (key.startsWith('audio/')) {
            failedAudio.push(key)
          }
        }
      })
    }
  }

  // --- final.json の生成 ---
  const clipLabels = await loadAudioClipLabels(useR2)
  const { entries, orphanAudioKeys } = buildQuizEntries({
    students,
    audioKeys,
    titleCalls,
    labels: clipLabels,
  })

  const finalData: FinalData = {
    schemaVersion: FINAL_DATA_SCHEMA_VERSION,
    builtAt: new Date().toISOString(),
    entries,
  }
  saveJSON(FINAL_JSON_PATH, finalData)
  saveText(path.join(TMP_DIR, 'final.csv'), quizEntriesToCsv(entries))

  const r2OnlyClips = entries.flatMap((entry) =>
    entry.TitleCalls.filter((clip) => clip.source === 'r2-only').map(
      (clip) => `${entry.Name}: ${clip.file}`,
    ),
  )
  const entriesWithoutAudio = entries
    .filter((entry) => entry.TitleCalls.length === 0)
    .map((entry) => entry.Name)

  const result: BuildAssetsResult = {
    entryCount: entries.length,
    clipCount: entries.reduce((sum, entry) => sum + entry.TitleCalls.length, 0),
    addedAudio,
    addedImages,
    failedAudio,
    failedImages,
    pendingAudio,
    pendingImages,
    wikiAudio,
    orphanAudioKeys: orphanAudioKeys.map(formatAudioKey),
    r2OnlyClips,
    entriesWithoutAudio,
  }

  reportBuildResult(result)

  const failureCount = failedAudio.length + failedImages.length
  if (failureCount > DEFAULT_FAILURE_THRESHOLD) {
    throw new Error(
      `アセットの取得失敗が ${failureCount} 件あり、閾値 ${DEFAULT_FAILURE_THRESHOLD} を超えました。`,
    )
  }

  return result
}

function reportBuildResult(result: BuildAssetsResult): void {
  console.log('')
  console.log(
    `final.json: ${result.entryCount} エントリ / タイトルコール ${result.clipCount} 本`,
  )
  console.log(
    `追加: 音声 ${result.addedAudio.length} 件、画像 ${result.addedImages.length} 件`,
  )

  if (result.wikiAudio.length > 0) {
    console.log(
      `[wiki] bluearchive.wiki から補完したクリップ (${result.wikiAudio.length} 件):`,
    )
    result.wikiAudio.forEach((item) => console.log(`  ${item}`))
  }
  if (result.pendingAudio.length > 0) {
    console.log(
      `SchaleDB にも wiki にも音源が無いクリップ (${result.pendingAudio.length} 件、実装直後の生徒では通常の状態):`,
    )
    result.pendingAudio.forEach((item) => console.log(`  ${item}`))
    console.log(
      '  音源が公開されれば次回以降のビルドで自動的に取り込まれます。',
    )
  }
  if (result.pendingImages.length > 0) {
    console.log(
      `SchaleDB にまだ画像が無い生徒 (${result.pendingImages.length} 件): ${result.pendingImages.join(', ')}`,
    )
  }
  if (result.r2OnlyClips.length > 0) {
    console.log(
      `[r2-only] SchaleDB に掲載が無いが R2 にあるため配信を継続するクリップ (${result.r2OnlyClips.length} 件):`,
    )
    result.r2OnlyClips.forEach((clip) => console.log(`  ${clip}`))
  }
  if (result.entriesWithoutAudio.length > 0) {
    console.log(
      `音声が無く出題対象外になる生徒 (${result.entriesWithoutAudio.length} 件): ${result.entriesWithoutAudio.join(', ')}`,
    )
  }
  if (result.orphanAudioKeys.length > 0) {
    console.warn(
      `students.json に Id が存在しない音声キー (${result.orphanAudioKeys.length} 件):`,
    )
    result.orphanAudioKeys.forEach((key) => console.warn(`  ${key}`))
  }
  if (result.failedAudio.length > 0) {
    console.error(`音声の失敗 (${result.failedAudio.length} 件):`)
    result.failedAudio.forEach((item) => console.error(`  ${item}`))
  }
  if (result.failedImages.length > 0) {
    console.error(
      `画像の失敗 (${result.failedImages.length} 件): ${result.failedImages.join(', ')}`,
    )
  }
}
