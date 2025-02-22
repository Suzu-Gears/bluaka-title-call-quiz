import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

import {
  R2_ACCESS_KEY_ID,
  R2_BUCKET_NAME,
  R2_ENDPOINT,
  R2_SECRET_ACCESS_KEY,
} from '@/server-constants'

const s3Client = new S3Client({
  endpoint: R2_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

export async function downloadR2Folder(folderPath: string, localPath: string) {
  try {
    // 環境変数をコンソールに表示
    const maskValue = (value: string) =>
      value.substring(0, 5) + 'X'.repeat(value.length - 5)
    console.log('R2_ACCESS_KEY_ID:', maskValue(R2_ACCESS_KEY_ID))
    console.log('R2_SECRET_ACCESS_KEY:', maskValue(R2_SECRET_ACCESS_KEY))
    console.log('R2_BUCKET_NAME:', maskValue(R2_BUCKET_NAME))
    console.log('R2_ENDPOINT:', maskValue(R2_ENDPOINT))

    const listCommand = new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: folderPath,
    })

    const listResponse = await s3Client.send(listCommand)

    if (!listResponse.Contents) {
      console.log('No files found in the specified folder.')
      return
    }

    for (const item of listResponse.Contents) {
      if (!item.Key) continue

      const relativePath = path.relative(folderPath, item.Key)
      const localFilePath = path.join(localPath, relativePath)

      if (fs.existsSync(localFilePath)) {
        console.log(`File already exists, skipping: ${localFilePath}`)
        continue
      }

      const getCommand = new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: item.Key,
      })

      const getResponse = await s3Client.send(getCommand)

      if (!getResponse.Body) {
        console.log(`Failed to download file: ${item.Key}`)
        continue
      }

      await fs.promises.mkdir(path.dirname(localFilePath), { recursive: true })

      const writeStream = fs.createWriteStream(localFilePath)
      const bodyStream = getResponse.Body as Readable
      bodyStream.pipe(writeStream)

      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve())
        writeStream.on('error', (err) => reject(err))
      })

      console.log(`Downloaded: ${localFilePath}`)
    }
  } catch (error) {
    console.error('Error downloading folder:', error)
  }
}
