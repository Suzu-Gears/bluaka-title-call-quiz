import {
  normalizeProficiencyMap,
  type ProficiencyMap,
} from '@/lib/quizProgress'

/**
 * 認証を使わない「同期コード」方式のクラウド保存。
 *
 * サーバー(GAS Web App など)は「コード -> JSON ひとかたまり」の入れ物として
 * だけ振る舞う。コードは UUID v4 で、実質パスワードとして扱う。
 * 保存内容はクイズの成績のみで、失われても localStorage とエクスポートが残る
 * ベストエフォートの機能と位置づける。
 */

const SYNC_CODE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface SyncPayload {
  updatedAt: string
  proficiency: ProficiencyMap
}

export function getSyncEndpoint(): string {
  // Vite 以外(テストランナーなど)では import.meta.env が存在しない。
  const endpoint = import.meta.env?.VITE_SYNC_ENDPOINT
  return typeof endpoint === 'string' ? endpoint.trim() : ''
}

export function isSyncEnabled(): boolean {
  return getSyncEndpoint().length > 0
}

export function isValidSyncCode(code: string): boolean {
  return SYNC_CODE_PATTERN.test(code.trim())
}

export function generateSyncCode(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // randomUUID が無い環境向けのフォールバック。
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}

export function parseSyncPayload(raw: unknown): SyncPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const source = raw as {
    updatedAt?: unknown
    proficiency?: unknown
    json?: unknown
  }
  // GAS 側がシートの生の値をそのまま返す場合、本体が文字列で入ってくることがある。
  if (typeof source.json === 'string') {
    try {
      return parseSyncPayload(JSON.parse(source.json))
    } catch {
      return null
    }
  }
  if (!source.proficiency || typeof source.proficiency !== 'object') {
    return null
  }
  return {
    updatedAt:
      typeof source.updatedAt === 'string'
        ? source.updatedAt
        : new Date(0).toISOString(),
    proficiency: normalizeProficiencyMap(source.proficiency),
  }
}

export async function fetchRemoteProgress(
  code: string,
): Promise<SyncPayload | null> {
  const endpoint = getSyncEndpoint()
  if (!endpoint || !isValidSyncCode(code)) {
    return null
  }
  const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}code=${encodeURIComponent(code.trim())}`
  const response = await fetch(url, { method: 'GET', cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`同期サーバーの応答が異常です (${response.status})`)
  }
  return parseSyncPayload(await response.json())
}

export async function pushRemoteProgress(
  code: string,
  payload: SyncPayload,
): Promise<void> {
  const endpoint = getSyncEndpoint()
  if (!endpoint) {
    throw new Error('同期エンドポイントが設定されていません。')
  }
  if (!isValidSyncCode(code)) {
    throw new Error('同期コードの形式が正しくありません。')
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    // GAS は CORS プリフライトに応答できないため、単純リクエストになる
    // text/plain で送る(本文の中身は JSON)。
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ code: code.trim(), ...payload }),
  })
  if (!response.ok) {
    throw new Error(`同期サーバーの応答が異常です (${response.status})`)
  }
}
