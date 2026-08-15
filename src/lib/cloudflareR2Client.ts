import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import fs from 'node:fs'
import path from 'node:path'

import { ensureDirectory } from '@/lib/fileOperations'
import {
  R2_ACCESS_KEY_ID,
  R2_BUCKET_NAME,
  R2_ENDPOINT,
  R2_SECRET_ACCESS_KEY,
} from '@/server-constants'

export function isR2Configured(): boolean {
  return Boolean(
    R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ENDPOINT && R2_BUCKET_NAME,
  )
}

/** 値そのものは絶対に出力しない。設定漏れの切り分けだけができれば十分。 */
export function describeR2Configuration(): string {
  const describe = (name: string, value: string) =>
    `${name}=${value ? `設定済み(${value.length}文字)` : '未設定'}`
  return [
    describe('R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID),
    describe('R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY),
    describe('R2_BUCKET_NAME', R2_BUCKET_NAME),
    describe('R2_ENDPOINT', R2_ENDPOINT),
  ].join(', ')
}

let s3Client: S3Client | null = null

function getClient(): S3Client {
  if (!isR2Configured()) {
    throw new Error(
      `R2 の環境変数が設定されていません。${describeR2Configuration()}`,
    )
  }
  s3Client ??= new S3Client({
    endpoint: R2_ENDPOINT,
    region: 'auto',
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
  return s3Client
}

/** バケット内のキーを列挙する。1000件超も継続トークンで全件取得する。 */
export async function listObjectKeys(prefix?: string): Promise<string[]> {
  const client = getClient()
  const keys: string[] = []
  let continuationToken: string | undefined

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    )
    for (const item of response.Contents ?? []) {
      if (item.Key) {
        keys.push(item.Key)
      }
    }
    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined
  } while (continuationToken)

  return keys
}

export async function downloadObjectToFile(
  key: string,
  localPath: string,
): Promise<void> {
  const response = await getClient().send(
    new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }),
  )
  if (!response.Body) {
    throw new Error(`R2 オブジェクトの本体が空です: ${key}`)
  }
  const bytes = await response.Body.transformToByteArray()
  ensureDirectory(path.dirname(localPath))
  fs.writeFileSync(localPath, bytes)
}

export async function uploadFileToR2(
  localFilePath: string,
  key: string,
  contentType: string,
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: fs.readFileSync(localFilePath),
      ContentType: contentType,
    }),
  )
}

export async function putObjectJson(key: string, data: unknown): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
    }),
  )
}

/** 存在しない場合は null。壊れた JSON も null(呼び出し側で初期化する)。 */
export async function getObjectJson(key: string): Promise<unknown | null> {
  try {
    const response = await getClient().send(
      new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }),
    )
    if (!response.Body) {
      return null
    }
    return JSON.parse(await response.Body.transformToString())
  } catch {
    return null
  }
}
