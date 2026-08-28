import {
  normalizeProficiencyMap,
  type ProficiencyMap,
} from '@/lib/quizProgress'
import { readStorage, removeStorage, writeStorage } from '@/lib/safeStorage'

/**
 * 認証を使わない「同期コード」方式のクラウド保存。
 *
 * サーバー(GAS Web App など)は「コード -> JSON ひとかたまり」の入れ物として
 * だけ振る舞う。コードは 10 文字のランダム文字列で、実質パスワードとして扱う。
 * 保存内容はクイズの成績のみで、失われても localStorage とエクスポートが残る
 * ベストエフォートの機能と位置づける。
 *
 * 保存先は 2 段構え:
 *   1. 利用者が設定した自分のエンドポイント(localStorage、自分のシートに保存したい人向け)
 *   2. ビルド時の既定エンドポイント VITE_SYNC_ENDPOINT(作者のシート)
 */

// コードの発行はサーバー(GAS)側。クライアントは形式チェックだけを持つ。
// 英字と数字の両方を必須にすることで、手入力されがちな弱いコード
// (電話番号・日付などの数字だけ、英単語・名前などの英字だけ)を弾く。
const SYNC_CODE_PATTERN = /^(?=.*[0-9])(?=.*[a-z])[0-9a-z]{10}$/i

const CUSTOM_ENDPOINT_STORAGE_KEY = 'bluaka-title-call-quiz2.syncEndpoint.v1'

export interface SyncPayload {
  updatedAt: string
  proficiency: ProficiencyMap
}

export function getDefaultSyncEndpoint(): string {
  // Vite 以外(テストランナーなど)では import.meta.env が存在しない。
  const endpoint = import.meta.env?.VITE_SYNC_ENDPOINT
  return typeof endpoint === 'string' ? endpoint.trim() : ''
}

export function getCustomSyncEndpoint(): string {
  return readStorage(CUSTOM_ENDPOINT_STORAGE_KEY)?.trim() ?? ''
}

/** 空文字で保存すると既定(作者のシート)に戻る。 */
export function setCustomSyncEndpoint(url: string): void {
  const trimmed = url.trim()
  if (trimmed) {
    writeStorage(CUSTOM_ENDPOINT_STORAGE_KEY, trimmed)
  } else {
    removeStorage(CUSTOM_ENDPOINT_STORAGE_KEY)
  }
}

/** GAS の /exec URL を想定するが、https であれば他のバックエンドも許容する。 */
export function isValidSyncEndpointUrl(url: string): boolean {
  try {
    return new URL(url.trim()).protocol === 'https:'
  } catch {
    return false
  }
}

export function getSyncEndpoint(): string {
  return getCustomSyncEndpoint() || getDefaultSyncEndpoint()
}

export function isSyncEnabled(): boolean {
  return getSyncEndpoint().length > 0
}

export function isValidSyncCode(code: string): boolean {
  return SYNC_CODE_PATTERN.test(code.trim())
}

/**
 * サーバーに新しい同期コードを発行させる。サーバーがシート上で行を確保して
 * から返すため、コードの衝突は起きない。
 */
export async function requestNewSyncCode(): Promise<string> {
  const endpoint = getSyncEndpoint()
  if (!endpoint) {
    throw new Error('同期エンドポイントが設定されていません。')
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'create' }),
  })
  if (!response.ok) {
    throw new Error(`同期サーバーの応答が異常です (${response.status})`)
  }
  const data = (await response.json()) as { ok?: unknown; code?: unknown }
  const code = typeof data.code === 'string' ? data.code.trim() : ''
  if (!data.ok || !isValidSyncCode(code)) {
    throw new Error('同期コードを発行できませんでした。')
  }
  return code
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
