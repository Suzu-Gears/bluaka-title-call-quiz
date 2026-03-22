import {
  GetObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2Output,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import fs from 'node:fs'
import path from 'node:path'
import type { Readable } from 'node:stream'

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

let fileListCache: ListObjectsV2Output | null = null

export async function getFileList(): Promise<ListObjectsV2Output> {
  if (fileListCache !== null) {
    return Promise.resolve(fileListCache)
  }

  const listCommand = new ListObjectsV2Command({
    Bucket: R2_BUCKET_NAME,
  })

  const listResponse = await s3Client.send(listCommand)

  if (!listResponse.Contents) {
    console.log('No files found in the bucket.')
    return listResponse
  }

  fileListCache = listResponse
  return fileListCache
}

export async function downloadR2Folder(folderPath: string, localPath: string) {
  try {
    const maskValue = (value: string) =>
      value.substring(0, 5) + 'X'.repeat(value.length - 5)
    console.log('R2_ACCESS_KEY_ID:', maskValue(R2_ACCESS_KEY_ID))
    console.log('R2_SECRET_ACCESS_KEY:', maskValue(R2_SECRET_ACCESS_KEY))
    console.log('R2_BUCKET_NAME:', maskValue(R2_BUCKET_NAME))
    console.log('R2_ENDPOINT:', maskValue(R2_ENDPOINT))

    const listResponse = await getFileList()

    if (!listResponse.Contents) {
      console.log('No files found in the bucket.')
      return
    }

    const filteredContents = listResponse.Contents.filter(
      (item) => item.Key && item.Key.startsWith(folderPath),
    )

    const downloadPromises = filteredContents.map(async (item) => {
      if (!item.Key) {
        return
      }

      const relativePath = path.relative(folderPath, item.Key)
      const localFilePath = path.join(localPath, relativePath)

      if (fs.existsSync(localFilePath)) {
        console.log(`File already exists, skipping: ${localFilePath}`)
        return
      }

      const getCommand = new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: item.Key,
      })

      const getResponse = await s3Client.send(getCommand)

      if (!getResponse.Body) {
        console.log(`Failed to download file: ${item.Key}`)
        return
      }

      await fs.promises.mkdir(path.dirname(localFilePath), { recursive: true })

      const writeStream = fs.createWriteStream(localFilePath)
      const bodyStream: Readable = getResponse.Body as Readable
      bodyStream.pipe(writeStream)

      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve())
        writeStream.on('error', (err) => reject(err))
      })

      console.log(`Downloaded: ${localFilePath}`)
    })

    await Promise.all(downloadPromises)
  } catch (error) {
    console.error('Error downloading folder:', error)
  }
}

/* Content-Typeが未設定なのでapplication/octet-streamになる */
export async function uploadFileToR2(
  localFilePath: string,
  bucketFolder: string,
) {
  try {
    const fileName = path.basename(localFilePath)
    const bucketKey = `${bucketFolder}/${fileName}`

    const fileStream = fs.createReadStream(localFilePath)

    const putCommand = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: bucketKey,
      Body: fileStream,
    })

    await s3Client.send(putCommand)
    console.log(`Uploaded: ${localFilePath} to ${bucketKey}`)
  } catch (error) {
    console.error('Error uploading file:', error)
  }
}
