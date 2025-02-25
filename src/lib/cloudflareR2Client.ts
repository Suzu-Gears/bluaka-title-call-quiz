import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2Output,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import fs from 'node:fs'
import { readdir } from 'node:fs/promises'
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

export async function updateFileList(): Promise<ListObjectsV2Output> {
  fileListCache = null
  return getFileList()
}

export async function downloadR2Folder(folderPath: string, localPath: string) {
  try {
    // 環境変数をコンソールに表示
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

    // folderPathに基づいて対象を絞り込む
    const filteredContents = listResponse.Contents.filter(
      (item) => item.Key && item.Key.startsWith(folderPath),
    )

    // 並列実行のためのPromise配列を作成
    const downloadPromises = filteredContents.map(async (item) => {
      if (!item.Key) return

      // folderPathを取り除いた相対パスを計算
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
      const bodyStream = getResponse.Body as Readable
      bodyStream.pipe(writeStream)

      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve())
        writeStream.on('error', (err) => reject(err))
      })

      console.log(`Downloaded: ${localFilePath}`)
    })

    // 全てのダウンロードが完了するまで待機
    await Promise.all(downloadPromises)
  } catch (error) {
    console.error('Error downloading folder:', error)
  }
}

export async function deleteR2Folder(folderPath: string) {
  if (!folderPath) {
    console.error('Error: folderPath is required.')
    return
  }

  try {
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

      const deleteCommand = new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: item.Key,
      })

      await s3Client.send(deleteCommand)
      console.log(`Deleted: ${item.Key}`)
    }

    // キャッシュを更新
    await updateFileList()
  } catch (error) {
    console.error('Error deleting folder contents:', error)
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

/* Content-Typeが未設定なのでapplication/octet-streamになる */
export async function uploadFolderToR2(
  localFolderPath: string,
  bucketFolder: string,
) {
  try {
    const folderName = path.basename(localFolderPath)
    const files = await getFilesRecursively(localFolderPath)

    for (const file of files) {
      const relativePath = path
        .relative(localFolderPath, file)
        .replace(/\\/g, '/')
      const bucketKey = `${bucketFolder}/${folderName}/${relativePath}`

      const fileStream = fs.createReadStream(file)

      const putCommand = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: bucketKey,
        Body: fileStream,
      })

      await s3Client.send(putCommand)
      console.log(`Uploaded: ${file} to ${bucketKey}`)
    }
  } catch (error) {
    console.error('Error uploading folder:', error)
  }
}

async function getFilesRecursively(dir: string): Promise<string[]> {
  const dirents = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = path.resolve(dir, dirent.name)
      return dirent.isDirectory() ? getFilesRecursively(res) : res
    }),
  )
  return Array.prototype.concat(...files)
}
