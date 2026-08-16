/**
 * ブルアカタイトルコールクイズ 進捗同期用 Google Apps Script。
 *
 * 使い方:
 *   1. Google スプレッドシートを新規作成する
 *   2. 拡張機能 > Apps Script を開き、このファイルの内容を貼り付ける
 *   3. デプロイ > 新しいデプロイ > 種類「ウェブアプリ」
 *        - 次のユーザーとして実行: 自分
 *        - アクセスできるユーザー: 全員
 *   4. 発行された /exec の URL を .env の VITE_SYNC_ENDPOINT に設定してビルドする
 *
 * 設計上の割り切り:
 *   - 認証はしない。同期コード(UUID v4)の推測不能性だけが保護になる。
 *   - 保存するのはクイズの成績のみ。失われても端末の localStorage と
 *     エクスポート機能が残るため、ベストエフォートの機能と位置づける。
 */

const SHEET_NAME = 'progress'
const CODE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** スプレッドシートの 1 セルは 50000 文字まで。想定は 15KB 程度。 */
const MAX_JSON_LENGTH = 45000

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = spreadsheet.getSheetByName(SHEET_NAME)
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME)
    sheet.appendRow(['syncCode', 'updatedAt', 'json'])
  }
  return sheet
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

function findRowIndex(sheet, code) {
  const lastRow = sheet.getLastRow()
  if (lastRow < 2) {
    return -1
  }
  const codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues()
  for (let i = 0; i < codes.length; i += 1) {
    if (String(codes[i][0]).trim().toLowerCase() === code.toLowerCase()) {
      return i + 2
    }
  }
  return -1
}

function doGet(e) {
  const code = String((e && e.parameter && e.parameter.code) || '').trim()
  if (!CODE_PATTERN.test(code)) {
    return jsonResponse({ found: false, error: 'invalid code' })
  }
  const sheet = getSheet()
  const rowIndex = findRowIndex(sheet, code)
  if (rowIndex < 0) {
    return jsonResponse({ found: false })
  }
  const row = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0]
  // 本体は json 列の文字列をそのまま返す(クライアント側が展開する)。
  return jsonResponse({ found: true, json: String(row[2]) })
}

function doPost(e) {
  const lock = LockService.getScriptLock()
  try {
    lock.waitLock(20000)
  } catch (err) {
    return jsonResponse({ ok: false, error: 'busy' })
  }

  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}')
    const code = String(body.code || '').trim()
    if (!CODE_PATTERN.test(code)) {
      return jsonResponse({ ok: false, error: 'invalid code' })
    }

    const updatedAt = String(body.updatedAt || new Date().toISOString())
    const json = JSON.stringify({
      updatedAt: updatedAt,
      proficiency: body.proficiency || {},
    })
    if (json.length > MAX_JSON_LENGTH) {
      return jsonResponse({ ok: false, error: 'payload too large' })
    }

    const sheet = getSheet()
    const rowIndex = findRowIndex(sheet, code)
    if (rowIndex < 0) {
      sheet.appendRow([code, updatedAt, json])
    } else {
      sheet.getRange(rowIndex, 1, 1, 3).setValues([[code, updatedAt, json]])
    }
    return jsonResponse({ ok: true, updatedAt: updatedAt })
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) })
  } finally {
    lock.releaseLock()
  }
}
