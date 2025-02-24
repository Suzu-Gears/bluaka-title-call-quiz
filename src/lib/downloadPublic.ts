import { downloadR2Folder } from '@/lib/cloudflareR2Client'
import {
  getMissingAudioBySchaledb,
  getMissingImageBySchaledb,
} from '@/lib/schaleDBClient'

console.log('Downloading R2 folders...')

await Promise.all([
  downloadR2Folder('audio', 'public/audio'),
  downloadR2Folder('image', 'public/image'),
  downloadR2Folder('quiz', 'public'),
])
await getMissingAudioBySchaledb()
await getMissingImageBySchaledb()

console.log('Download completed for R2 folders')
