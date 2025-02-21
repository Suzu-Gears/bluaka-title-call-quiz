import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'
import fs from 'node:fs'
import path from 'node:path'

import {
  R2_ACCESS_KEY_ID,
  R2_BUCKET_NAME,
  R2_ENDPOINT,
  R2_SECRET_ACCESS_KEY,
} from '@/server-constants'

// S3クライアントの初期化
const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

// ファイルをダウンロードする関数
async function downloadFile(
  bucketName: string,
  objectKey: string,
  destinationPath: string,
): Promise<void> {
  const downloadParams = {
    Bucket: bucketName,
    Key: objectKey,
  }

  const { Body } = await s3.send(new GetObjectCommand(downloadParams))
  const fileStream = fs.createWriteStream(destinationPath)
  Body.pipe(fileStream)
  console.log(`Downloaded ${objectKey} to ${destinationPath}`)
}

// ディレクトリを再帰的に作成する関数
function ensureDirSync(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

// ディレクトリを再帰的にダウンロードする関数
export async function downloadDirectory(
  bucketName: string,
  bucketPath: string,
  localPath: string,
): Promise<void> {
  const listParams = {
    Bucket: bucketName,
    Prefix: bucketPath,
  }

  const { Contents } = await s3.send(new ListObjectsV2Command(listParams))
  for (const object of Contents) {
    const relativePath = object.Key.replace(bucketPath, '')
    const destinationPath = path.join(localPath, relativePath)
    ensureDirSync(path.dirname(destinationPath))
    await downloadFile(bucketName, object.Key, destinationPath)
  }
}

// メイン関数
async function main() {
  const publicDir = path.join(__dirname, '../../public')

  // audioフォルダのダウンロード
  await downloadDirectory(
    R2_BUCKET_NAME,
    'audio/',
    path.join(publicDir, 'audio'),
  )

  // imageフォルダのダウンロード
  await downloadDirectory(
    R2_BUCKET_NAME,
    'image/',
    path.join(publicDir, 'image'),
  )

  console.log('All files downloaded successfully.')
}

main().catch((err) => console.error('Error:', err))
