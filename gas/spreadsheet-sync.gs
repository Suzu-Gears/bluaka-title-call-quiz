/**
 * ブルアカタイトルコールクイズ 進捗同期用 Google Apps Script。
 *
 * 使い方(詳細は docs/sync-setup.md):
 *   1. Google スプレッドシートを新規作成する
 *   2. 拡張機能 > Apps Script を開き、このファイルの内容を貼り付ける
 *   3. デプロイ > 新しいデプロイ > 種類「ウェブアプリ」
 *        - 次のユーザーとして実行: 自分
 *        - アクセスできるユーザー: 全員
 *   4. 発行された /exec の URL を設定する
 *        - 管理者(既定の保存先): .env の VITE_SYNC_ENDPOINT に設定してビルド
 *        - 利用者(自分のシートに保存): クイズの「クラウド同期」ダイアログの
 *          「保存先URL」欄に貼り付ける
 *
 * 設計上の割り切り:
 *   - 認証はしない。同期コード(10文字のランダム文字列)の推測不能性だけが保護になる。
 *   - 保存するのはクイズの成績のみ。失われても端末の localStorage と
 *     エクスポート機能が残るため、ベストエフォートの機能と位置づける。
 */

const SHEET_NAME = 'progress'
// 英字と数字の両方を必須にして、推測されやすい手入力コードを弾く。
const CODE_PATTERN = /^(?=.*[0-9])(?=.*[a-z])[0-9a-z]{10}$/i
/** Crockford Base32(紛らわしい i/l/o/u を除外)。10 文字で 50bit。 */
const CODE_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

function generateCode() {
  for (;;) {
    // Math.random は避け、getUuid をハッシュしてランダムバイトを得る。
    const bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid(),
    )
    let code = ''
    for (let i = 0; i < 10; i += 1) {
      // バイトは -128..127 の符号付き。+256 して 32 で割ると一様になる。
      code += CODE_ALPHABET[(bytes[i] + 256) % 32]
    }
    // 英字と数字の混在条件を満たすまで引き直す(全部英字は約2%)。
    if (CODE_PATTERN.test(code)) {
      return code
    }
  }
}
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

    // 新規コードの発行。ロック内で行を確保するため衝突は起きない。
    if (body.action === 'create') {
      const sheet = getSheet()
      for (;;) {
        const newCode = generateCode()
        if (findRowIndex(sheet, newCode) < 0) {
          // json は空のまま行だけ確保する(doGet は found:true / 空を返す)。
          sheet.appendRow([newCode, new Date().toISOString(), ''])
          return jsonResponse({ ok: true, code: newCode })
        }
      }
    }

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
