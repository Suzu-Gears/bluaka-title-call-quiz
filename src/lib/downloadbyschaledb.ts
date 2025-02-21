//https://schaledb.com/data/jp/students.jsonからschaledb.jsonという名前でダウンロード
//各項目に5桁の数字でidが設定されているのでリストとしてデータを取得する
//項目内のname に名前が入っているので、id指定でダウンロードしたファイル名に名前をそのまま設定する
//保存先はpublic/downloadにする
//既にあればダウンロードしない
//1項目につき1秒かけて、コンソール出力 サーバーに負荷をかけないようにする
//	https://schaledb.com/images/student/collection/10000.webp のように、id.webpというファイルがあるので、それをダウンロードする
//  ダウンロードしたファイルはidに対応したname.webpという名前で保存する

//npx tsx src/lib/downloadbyschaledb.tsで実行

import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// __dirname の代わりに import.meta.url を使用
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 保存先ディレクトリ
const downloadDir = path.join(__dirname, '../../public/download')
const schaleDBFilePath = path.join(downloadDir, 'schaledb.json')

// SchaleDBからデータを取得する関数
async function fetchSchaleDBData(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          resolve(JSON.parse(data))
        })
      })
      .on('error', (err) => {
        reject(err)
      })
  })
}

// ファイルをダウンロードする関数
async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          file.close()
          fs.unlink(dest, () =>
            reject(
              new Error(`Failed to get '${url}' (${response.statusCode})`),
            ),
          )
          return
        }
        response.pipe(file)
        file.on('finish', () => {
          file.close((err) => {
            if (err) {
              reject(err)
              return
            }
            resolve()
          })
        })
      })
      .on('error', (err) => {
        fs.unlink(dest, () => reject(err))
      })
  })
}

// メイン関数
async function main() {
  let data
  const failedDownloads: string[] = []

  // schaledb.json が既に存在する場合はそれを使用
  if (fs.existsSync(schaleDBFilePath)) {
    data = JSON.parse(fs.readFileSync(schaleDBFilePath, 'utf-8'))
    console.log('Using existing schaledb.json')
  } else {
    // SchaleDBからデータを取得
    data = await fetchSchaleDBData('https://schaledb.com/data/jp/students.json')
    fs.writeFileSync(schaleDBFilePath, JSON.stringify(data, null, 2))
    console.log('Fetched and saved schaledb.json')
  }

  // 保存先ディレクトリが存在しない場合は作成
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true })
  }

  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      const student = data[key]
      const { Id: id, Name: name, DevName: devname } = student
      const imageFileName = `${name}.webp`
      const imageFilePath = path.join(downloadDir, imageFileName)
      const audioFileName = `${name}.mp3`
      const audioFilePath = path.join(downloadDir, audioFileName)

      // 画像ファイルのダウンロード
      if (!fs.existsSync(imageFilePath)) {
        const imageUrl = `https://schaledb.com/images/student/collection/${id}.webp`
        await downloadFile(imageUrl, imageFilePath)
        // 1秒待機
        await new Promise((resolve) => setTimeout(resolve, 1000))
        console.log(`Downloaded ${id}.webp as ${imageFileName}`)
      } else {
        console.log(`File ${imageFileName} already exists. Skipping...`)
      }

      // 音声ファイルのダウンロード
      if (!fs.existsSync(audioFilePath)) {
        // PathNameからアンダーバーを除去し、小文字に変換
        const formattedPathName = student.PathName.replace(
          /_/g,
          '',
        ).toLowerCase()
        let audioUrl = `https://r2.schaledb.com/voice/jp_${formattedPathName}/${formattedPathName}_title.mp3`
        try {
          await downloadFile(audioUrl, audioFilePath)
          // 1秒待機
          await new Promise((resolve) => setTimeout(resolve, 1000))
          console.log(
            `Downloaded ${formattedPathName}_title.mp3 as ${audioFileName}`,
          )
        } catch (err) {
          const error = err as Error
          console.error(`Failed to download ${audioUrl}: ${error.message}`)
          // PathNameで再試行
          audioUrl = `https://r2.schaledb.com/voice/jp_${student.PathName}/${student.PathName}_title.mp3`
          try {
            await downloadFile(audioUrl, audioFilePath)
            // 1秒待機
            await new Promise((resolve) => setTimeout(resolve, 1000))
            console.log(
              `Downloaded ${student.PathName}_title.mp3 as ${audioFileName}`,
            )
          } catch (err) {
            const error = err as Error
            console.error(`Failed to download ${audioUrl}: ${error.message}`)
            // エラーが発生した生徒名をリストに追加
            failedDownloads.push(name)
          }
        }
      } else {
        console.log(`File ${audioFileName} already exists. Skipping...`)
      }
    }
  }

  // エラーが発生した生徒名を出力
  if (failedDownloads.length > 0) {
    console.log('Failed to download audio files for the following students:')
    failedDownloads.forEach((name) => console.log(name))
  } else {
    console.log('All audio files downloaded successfully.')
  }
}

main().catch((err) => console.error('Error:', err))
