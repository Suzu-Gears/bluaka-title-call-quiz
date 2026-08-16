import { parseAudioKey, parseImageKey } from '@/lib/assetKeys'
import {
  describeR2Configuration,
  isR2Configured,
  listObjectKeys,
} from '@/lib/cloudflareR2Client'
import { R2_BUCKET_NAME } from '@/server-constants'

console.log(`設定: ${describeR2Configuration()}`)
console.log(`バケット名: ${R2_BUCKET_NAME}`)

if (!isR2Configured()) {
  console.error('環境変数が不足しています。')
  process.exit(1)
}

try {
  const keys = await listObjectKeys()
  console.log(`\n接続成功。オブジェクト数: ${keys.length}`)

  const audio = keys.filter((key) => key.startsWith('audio/'))
  const image = keys.filter((key) => key.startsWith('image/'))
  const newLayoutAudio = audio.filter((key) => parseAudioKey(key) !== null)
  const newLayoutImage = image.filter((key) => parseImageKey(key) !== null)

  console.log(
    `  audio/: ${audio.length} 件（うち新レイアウト ${newLayoutAudio.length} 件）`,
  )
  console.log(
    `  image/: ${image.length} 件（うち新レイアウト ${newLayoutImage.length} 件）`,
  )
  console.log(`  その他: ${keys.length - audio.length - image.length} 件`)

  if (keys.length > 0) {
    console.log('\n先頭の数件:')
    keys.slice(0, 5).forEach((key) => console.log(`  ${key}`))
  }

  const prefixes = new Map<string, number>()
  for (const key of keys) {
    const prefix = key.includes('/') ? `${key.split('/')[0]}/` : '(直下)'
    prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1)
  }
  console.log('\nプレフィックス別:')
  for (const [prefix, count] of prefixes) {
    console.log(`  ${prefix}: ${count} 件`)
  }

  const filter = process.argv[2]
  if (filter) {
    const matched = keys.filter((key) => key.includes(filter))
    console.log(`\n"${filter}" を含むキー: ${matched.length} 件`)
    matched.forEach((key) => console.log(`  ${key}`))
  }
} catch (error) {
  console.error('\n接続に失敗しました。')
  console.error((error as Error).message)
  process.exit(1)
}
