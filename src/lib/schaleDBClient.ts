import {
  readLocalJSONIfValid,
  saveBinary,
  saveJSON,
} from '@/lib/fileOperations'

/**
 * SchaleDB からのデータ取得。URL の推測は一切行わず、
 * voice.json の AudioClip をそのまま使う(命名規則の変更に影響されない)。
 */

export const SCHALEDB_STUDENTS_URL =
  'https://schaledb.com/data/jp/students.json'
export const SCHALEDB_VOICE_URL = 'https://schaledb.com/data/jp/voice.json'

export const resolveStudentImageUrl = (studentId: number): string =>
  `https://schaledb.com/images/student/collection/${studentId}.webp`

/** SchaleDB への連続アクセスを避けるための既定待ち時間。 */
export const DEFAULT_REQUEST_INTERVAL_MS = 1000

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * HTTP ステータスを保持する取得エラー。
 * 404 は「SchaleDB にまだ音源が上がっていない」という日常的な状態を意味し、
 * 通信障害などの本物の失敗と区別する必要があるため型で持つ。
 */
export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`Failed to download ${url}: ${status}`)
    this.name = 'HttpStatusError'
  }
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof HttpStatusError && error.status === 404
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    )
  }
  return response.json()
}

/**
 * JSON を取得してローカルにキャッシュする。キャッシュがあればネットワークを使わない。
 * キャッシュの破棄は `npm run local-cache:purge` か tmp/ の削除で行う。
 */
export async function fetchJsonWithCache(
  url: string,
  cachePath: string,
): Promise<unknown> {
  const cached = readLocalJSONIfValid(cachePath)
  if (cached !== null) {
    return cached
  }
  const data = await fetchJson(url)
  saveJSON(cachePath, data)
  return data
}

/**
 * ファイルを取得して保存し、そのレスポンスから指紋を返す。
 * 指紋を取るためだけに HEAD を追加で投げると SchaleDB へのリクエストが倍になるため、
 * GET のレスポンスヘッダーから読み取る。
 */
export async function downloadBinary(
  url: string,
  localPath: string,
): Promise<RemoteAssetSignature> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new HttpStatusError(response.status, url)
  }
  // 全体をメモリに載せてから書くため、失敗時に不完全なファイルが残らない。
  // 対象は音声 15-35KB / 画像も小さく、件数も数百なので問題にならない。
  const body = await response.arrayBuffer()
  saveBinary(localPath, new Uint8Array(body))

  const contentLength = Number(response.headers.get('content-length'))
  return {
    etag: response.headers.get('etag'),
    size:
      Number.isFinite(contentLength) && contentLength > 0
        ? contentLength
        : body.byteLength,
  }
}

export interface RemoteAssetSignature {
  etag: string | null
  size: number | null
}

/** 更新検知用。取得できない場合は null。 */
export async function headRemoteAsset(
  url: string,
): Promise<RemoteAssetSignature | null> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    if (!response.ok) {
      return null
    }
    const size = Number(response.headers.get('content-length'))
    return {
      etag: response.headers.get('etag'),
      size: Number.isFinite(size) && size > 0 ? size : null,
    }
  } catch {
    return null
  }
}
