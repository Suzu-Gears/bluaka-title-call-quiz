import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

// __dirnameの代わりにimport.meta.urlを使用してディレクトリ名を取得
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ダウンロードしたファイルを保存するディレクトリ
const downloadDir = path.join(__dirname, '../../public/data')
const schaleDBFilePath = path.join(downloadDir, 'schaledb.json')

// ディレクトリがなければ作成する
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true })
}

/**
 * URLを受け取り、該当するファイルをダウンロードして保存する
 * @param url ダウンロードするファイルのURL
 * @param filename 保存するファイルのファイル名
 */
async function download(url: string, filename: string) {
  try {
    const response = await fetch(url, { method: 'GET' })
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
    }

    const dest = fs.createWriteStream(filename)
    const reader = response.body?.getReader()

    if (reader) {
      const pump = async () => {
        const { done, value } = await reader.read()
        if (done) {
          dest.end()
          return
        }
        dest.write(Buffer.from(value))
        await pump()
      }
      await pump()
      console.log(`OK: ${filename}`)
    }
  } catch (error) {
    console.log(`error: ${url} ${error}`)
  }
}

download('https://schaledb.com/data/jp/students.json', schaleDBFilePath)
