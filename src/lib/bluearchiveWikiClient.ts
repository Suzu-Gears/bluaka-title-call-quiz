import { isValidClipId } from '@/lib/assetKeys'

/**
 * bluearchive.wiki (Miraheze) クライアント。音声の第二供給源として使う。
 *
 * SchaleDB より音源の掲載が速く(実装当日〜数日)、コラボ終了後も削除されない
 * ため、「SchaleDB にまだ無い」「SchaleDB から消えた」の両方を補える。
 *
 * - 生徒の対応付けは Cargo の characters テーブル。Id がゲーム内 Id
 *   (= SchaleDB の Id)と完全一致することを全 274 名で確認済み。
 *   DevName は両者で体系が違うため結合キーに使わないこと。
 * - タイトルコール音声は全生徒 `File:{Wikiname} Title.ogg` の命名で統一
 *   されている(273/274 で実在を確認。唯一の例外ホシノ（臨戦）の
 *   別レコードは 2 レコード 1 音声の仕様どおり)。
 */

export const WIKI_API_URL = 'https://bluearchive.wiki/w/api.php'

/** MediaWiki の作法として、素性のわかる User-Agent を名乗る。 */
const USER_AGENT =
  'bluaka-title-call-quiz-build (https://github.com/Suzu-Gears/bluaka-title-call-quiz)'

const CARGO_PAGE_SIZE = 500

async function wikiApi(params: Record<string, string>): Promise<unknown> {
  const query = new URLSearchParams({ ...params, format: 'json' })
  const response = await fetch(`${WIKI_API_URL}?${query}`, {
    headers: { 'User-Agent': USER_AGENT },
  })
  if (!response.ok) {
    throw new Error(`bluearchive.wiki API が ${response.status} を返しました`)
  }
  return response.json()
}

/** cargoquery 応答から Id -> Wikiname を取り出す。壊れた行は無視する。 */
export function parseCargoWikinames(raw: unknown): Map<number, string> {
  const result = new Map<number, string>()
  const rows = (raw as { cargoquery?: unknown })?.cargoquery
  if (!Array.isArray(rows)) {
    return result
  }
  for (const row of rows) {
    const title = (row as { title?: unknown })?.title as
      | { Id?: unknown; Wikiname?: unknown }
      | undefined
    const id = Number(title?.Id)
    const wikiname = title?.Wikiname
    if (Number.isInteger(id) && typeof wikiname === 'string' && wikiname) {
      result.set(id, wikiname)
    }
  }
  return result
}

/** 全生徒の Id -> Wikiname 対応表を取得する。 */
export async function fetchWikinameMap(): Promise<Map<number, string>> {
  const result = new Map<number, string>()
  for (let offset = 0; ; offset += CARGO_PAGE_SIZE) {
    const raw = await wikiApi({
      action: 'cargoquery',
      tables: 'characters',
      fields: 'Id,Wikiname',
      limit: String(CARGO_PAGE_SIZE),
      offset: String(offset),
      order_by: 'Id',
    })
    const page = parseCargoWikinames(raw)
    for (const [id, wikiname] of page) {
      result.set(id, wikiname)
    }
    if (page.size < CARGO_PAGE_SIZE) {
      return result
    }
  }
}

/** タイトルコール音声のファイルページ名。全生徒この命名で統一されている。 */
export function titleCallFileTitle(wikiname: string): string {
  return `File:${wikiname} Title.ogg`
}

/** imageinfo 応答から実ファイル URL を取り出す。ファイルが無ければ null。 */
export function parseImageInfoUrl(raw: unknown): string | null {
  const pages = (raw as { query?: { pages?: unknown } })?.query?.pages
  if (!pages || typeof pages !== 'object') {
    return null
  }
  for (const page of Object.values(pages as Record<string, unknown>)) {
    const p = page as { missing?: unknown; imageinfo?: unknown }
    if (p.missing !== undefined) {
      continue
    }
    const info = Array.isArray(p.imageinfo) ? p.imageinfo[0] : null
    const url = (info as { url?: unknown } | null)?.url
    if (typeof url === 'string' && url) {
      return url
    }
  }
  return null
}

/** タイトルコール .ogg の実 URL を返す。wiki に無ければ null。 */
export async function resolveTitleCallOggUrl(
  wikiname: string,
): Promise<string | null> {
  const raw = await wikiApi({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'url',
    titles: titleCallFileTitle(wikiname),
  })
  return parseImageInfoUrl(raw)
}

/**
 * voice.json に掲載が無い生徒のための clipId。SchaleDB の命名規則
 * ('jp_ch0368/ch0368_title.mp3' -> 'ch0368_title')に合わせて DevName から
 * 導出することで、後日 SchaleDB 側に掲載が復活しても同じ clipId になり
 * 重複取得を防ぐ。規約に合わない DevName は null。
 */
export function deriveTitleClipId(devName: string): string | null {
  const clipId = `${devName.toLowerCase()}_title`
  return isValidClipId(clipId) ? clipId : null
}
