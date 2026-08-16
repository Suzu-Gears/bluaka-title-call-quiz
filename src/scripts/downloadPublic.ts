import { buildAssets } from '@/lib/assetPipeline'
import {
  describeR2Configuration,
  isR2Configured,
} from '@/lib/cloudflareR2Client'

console.log(`R2 設定: ${describeR2Configuration()}`)
console.log(
  isR2Configured()
    ? 'R2 を正本としてアセットを同期します。'
    : 'R2 未設定のためローカルのみで動作します(SchaleDB から直接取得)。',
)

try {
  await buildAssets()
  console.log('アセットの準備が完了しました。')
} catch (error) {
  console.error('アセットの準備に失敗しました。')
  console.error((error as Error).message)
  process.exit(1)
}
