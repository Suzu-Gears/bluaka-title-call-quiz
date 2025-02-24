import {
  convertToArray,
  getFilteredSchaleDB,
  getMissingAudioBySchaledb,
  getMissingImageBySchaledb,
  getSchaleDB,
  type Student,
  type Students,
} from '@/lib/schaleDBClient'

try {
  await getMissingAudioBySchaledb()
} catch (error) {
  console.error('Error occurred:', error) // エラー処理
}
