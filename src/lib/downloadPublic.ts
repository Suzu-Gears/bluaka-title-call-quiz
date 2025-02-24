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
console.log('Download completed for R2 folders')

console.log('Downloading MissingFile By SchaleDB...')
await Promise.all([getMissingAudioBySchaledb(), getMissingImageBySchaledb()])
console.log('Download completed for MissingFile By SchaleDB...')
console.log('Exiting process...')
process.exit(0)
