import fs from 'node:fs'
import path from 'node:path'

import {
  AUDIO_DIR,
  FINAL_JSON_PATH,
  IMAGE_DIR,
  TMP_DIR,
} from '@/lib/assetPipeline'

/**
 * ローカルキャッシュ(取得済みアセット・JSON キャッシュ・中間生成物)を削除する。
 * R2 の内容には触れない。
 */
const targets = [
  { label: '音声', target: AUDIO_DIR },
  { label: '画像', target: IMAGE_DIR },
  { label: 'final.json', target: FINAL_JSON_PATH },
  { label: '一時ファイル', target: TMP_DIR },
]

for (const { label, target } of targets) {
  if (!fs.existsSync(target)) {
    console.log(`${label}: 対象がありません (${path.basename(target)})`)
    continue
  }
  fs.rmSync(target, { recursive: true, force: true })
  console.log(`${label}を削除しました: ${target}`)
}

console.log('ローカルキャッシュを削除しました。')
