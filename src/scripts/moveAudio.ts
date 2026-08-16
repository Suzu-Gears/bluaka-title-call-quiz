import fs from 'node:fs'
import path from 'node:path'

import { formatAudioKey, parseAudioKey } from '@/lib/assetKeys'
import { PUBLIC_DIR } from '@/lib/assetPipeline'
import {
  copyObject,
  deleteObject,
  isR2Configured,
  listObjectKeys,
} from '@/lib/cloudflareR2Client'

/**
 * 音声クリップを別メンバー(形態)のフォルダへ移動する運用コマンド。
 *
 *   npm run r2:move -- <clipId> <移動先の生徒Id>
 *   例: npm run r2:move -- np0288_title 10144
 *
 * R2 上の置き場所が「どの形態の声か」の宣言なので、voice.json の掲載位置と
 * 実際の帰属が異なる場合(シュン（水着）の np0288 はシュエリン側)はこれで直す。
 * 全世代をまとめて移動し、ローカルの public/ も追従させる。
 * 存在判定・世代管理は clipId 単位なので、移動後に再取得されることはない。
 */

const [clipIdArg, destinationIdArg] = process.argv.slice(2)
const destinationId = Number(destinationIdArg)

if (!clipIdArg || !Number.isInteger(destinationId) || destinationId < 0) {
  console.error('使い方: npm run r2:move -- <clipId> <移動先の生徒Id>')
  console.error('例:     npm run r2:move -- np0288_title 10144')
  process.exit(1)
}

if (!isR2Configured()) {
  console.error('R2 の環境変数が設定されていません。')
  process.exit(1)
}

const allKeys = (await listObjectKeys('audio/'))
  .map((key) => ({ key, parts: parseAudioKey(key) }))
  .filter((item) => item.parts !== null && item.parts.clipId === clipIdArg)

if (allKeys.length === 0) {
  console.error(`clipId '${clipIdArg}' の音声が R2 に見つかりません。`)
  process.exit(1)
}

let moved = 0
for (const { key, parts } of allKeys) {
  if (!parts) continue
  if (parts.studentId === destinationId) {
    console.log(`移動不要(既に対象フォルダ): ${key}`)
    continue
  }
  const destinationKey = formatAudioKey({ ...parts, studentId: destinationId })
  await copyObject(key, destinationKey)
  await deleteObject(key)
  console.log(`R2 で移動: ${key} -> ${destinationKey}`)

  const sourceLocal = path.join(PUBLIC_DIR, key)
  const destinationLocal = path.join(PUBLIC_DIR, destinationKey)
  if (fs.existsSync(sourceLocal)) {
    fs.mkdirSync(path.dirname(destinationLocal), { recursive: true })
    fs.renameSync(sourceLocal, destinationLocal)
    console.log(`ローカルで移動: ${destinationKey}`)
  }
  moved += 1
}

if (moved > 0) {
  console.log('')
  console.log(
    '完了しました。final.json を更新するため cache:fetch を再実行してください。',
  )
}
