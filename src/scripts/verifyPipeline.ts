import { AUDIO_CLIP_LABELS } from '@/data/audioLabels'
import { type AudioKeyParts } from '@/lib/assetKeys'
import { loadSchaleDBSnapshot } from '@/lib/assetPipeline'
import { buildQuizEntries } from '@/lib/jsonUtils'
import { selectPlayableClips } from '@/lib/titleCallClips'
import { clipIdFromAudioClip } from '@/lib/voiceData'

const { students, titleCalls } = await loadSchaleDBSnapshot()

// R2 に全クリップが g1 で入っている状態を仮定して final.json を組み立てる。
const audioKeys: AudioKeyParts[] = []
for (const [studentId, clips] of titleCalls) {
  for (const audioClip of clips) {
    const clipId = clipIdFromAudioClip(audioClip)
    if (clipId) {
      audioKeys.push({ studentId, clipId, generation: 1 })
    }
  }
}

const { entries, orphanAudioKeys } = buildQuizEntries({
  students,
  audioKeys,
  titleCalls,
  labels: AUDIO_CLIP_LABELS,
})

console.log(`生徒レコード: ${students.length}`)
console.log(`エントリ(表示名単位): ${entries.length}`)
console.log(`タイトルコール総数: ${audioKeys.length}`)
console.log(`孤児キー: ${orphanAudioKeys.length}`)
console.log(
  `統合された同名グループ: ${entries
    .filter((e) => e.MemberIds.length > 1)
    .map((e) => `${e.Name}[${e.MemberIds.join(',')}]`)
    .join(', ')}`,
)
console.log(
  `音声なし: ${entries
    .filter((e) => e.TitleCalls.length === 0)
    .map((e) => e.Name)
    .join(', ')}`,
)
console.log(
  `複数クリップ: ${entries
    .filter((e) => e.TitleCalls.length > 1)
    .map((e) => `${e.Name}(${e.TitleCalls.length})`)
    .join(', ')}`,
)

for (const name of [
  'ホシノ',
  'ホシノ（臨戦）',
  'シュン（水着）',
  'チェリノ',
  'チェリノ（温泉）',
  '初音ミク',
]) {
  const entry = entries.find((e) => e.Name === name)
  if (!entry) {
    console.log(`\n--- ${name}: 見つかりません`)
    continue
  }
  console.log(`\n--- ${name}`)
  console.log(
    `  MemberIds=${entry.MemberIds.join(',')} PrimaryId=${entry.PrimaryId}`,
  )
  console.log(
    `  Costume='${entry.Costume}' IsCollaboration=${entry.IsCollaboration} CV=${entry.CharacterVoice}`,
  )
  entry.TitleCalls.forEach((clip) =>
    console.log(`  clip: ${clip.file} (source=${clip.source})`),
  )
  console.log(
    `  既定再生セット: ${
      selectPlayableClips(entry.TitleCalls, false)
        .map((c) => c.clipId)
        .join(', ') || '(なし)'
    }`,
  )
}

// 手動配置のシミュレーション(初音ミクを R2 に置いた場合)
const mikuId = students.find((s) => s.Name === '初音ミク')?.Id
if (mikuId) {
  const withMiku = buildQuizEntries({
    students,
    audioKeys: [
      ...audioKeys,
      { studentId: mikuId, clipId: 'miku_title', generation: 1 },
    ],
    titleCalls,
  })
  const miku = withMiku.entries.find((e) => e.Name === '初音ミク')!
  console.log('\n--- 手動配置シミュレーション(初音ミク)')
  miku.TitleCalls.forEach((clip) =>
    console.log(`  ${clip.file} source=${clip.source}`),
  )
  console.log(
    `  出題対象になるか: ${miku.TitleCalls.length > 0 ? 'はい' : 'いいえ'}`,
  )
  console.log(
    `  音声なしエントリ: ${withMiku.entries.filter((e) => e.TitleCalls.length === 0).length} 件`,
  )
}

// 世代追加のシミュレーション(チェリノが録り直された場合)
const cherinoId = students.find((s) => s.Name === 'チェリノ')?.Id
if (cherinoId) {
  const withG2 = buildQuizEntries({
    students,
    audioKeys: [
      ...audioKeys,
      { studentId: cherinoId, clipId: 'cherino_title', generation: 2 },
    ],
    titleCalls,
    labels: { 'cherino_title.g1': '旧声優版' },
  })
  const cherino = withG2.entries.find((e) => e.Name === 'チェリノ')!
  console.log('\n--- 世代追加シミュレーション(チェリノ g2)')
  cherino.TitleCalls.forEach((clip) =>
    console.log(`  ${clip.file} label=${clip.label ?? '(なし)'}`),
  )
  console.log(
    `  既定: ${selectPlayableClips(cherino.TitleCalls, false)
      .map((c) => c.file)
      .join(', ')}`,
  )
  console.log(
    `  旧世代を含む: ${selectPlayableClips(cherino.TitleCalls, true).length} 本`,
  )
}
