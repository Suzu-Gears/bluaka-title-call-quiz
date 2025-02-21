//npx tsx src/lib/sortJson.tsで実行

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
const sortJsonFilePath = path.join(downloadDir, 'sort.json')

// Studentインターフェースの定義
interface Student {
  DefaultOrder: number
  Id: number
  Name: string
  PathName: string
  DevName: string
  StarGrade: number
  FamilyName: string
  FamilyNameRuby: string
  PersonalName: string
  PersonalNameRuby: string
  CharacterVoice: string
  School: string
  SchoolYear: string
  CharacterAge: string
  Birthday: string
  BirthDay: string
  CharHeightMetric: string
  Costume: string
}

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

// 必要なプロパティを抜き出して新しいJSONを作成する関数
function extractProperties(data: any): Student[] {
  const result: Student[] = []
  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      const student = data[key]
      const {
        DefaultOrder,
        Id,
        Name,
        PathName,
        DevName,
        StarGrade,
        FamilyName,
        FamilyNameRuby,
        PersonalName,
        PersonalNameRuby,
        CharacterVoice,
        School,
        SchoolYear,
        CharacterAge,
        Birthday,
        BirthDay,
        CharHeightMetric,
      } = student
      const costumeMatch = Name.match(/（[^）]+）/)
      const Costume = costumeMatch ? costumeMatch[0].slice(1, -1) : ''
      result.push({
        DefaultOrder,
        Id,
        Name,
        PathName,
        DevName,
        StarGrade,
        FamilyName,
        FamilyNameRuby,
        PersonalName,
        PersonalNameRuby,
        CharacterVoice,
        School,
        SchoolYear,
        CharacterAge,
        Birthday,
        BirthDay,
        CharHeightMetric,
        Costume,
      })
    }
  }
  return result
}

// メイン関数
async function main() {
  let data

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

  // 必要なプロパティを抜き出して新しいJSONを作成
  const sortedData = extractProperties(data)
  fs.writeFileSync(sortJsonFilePath, JSON.stringify(sortedData, null, 2))
  console.log('Extracted and saved sort.json')

  // CostumeをDefaultOrder昇順で並び替えてコンソールに表示
  const sortedByDefaultOrder = sortedData.sort(
    (a, b) => a.DefaultOrder - b.DefaultOrder,
  )

  const seenCostumes = new Set<string>()
  sortedByDefaultOrder.forEach((item) => {
    if (item.Costume && !seenCostumes.has(item.Costume)) {
      console.log(
        `DefaultOrder: ${item.DefaultOrder}, Costume: ${item.Costume}`,
      )
      seenCostumes.add(item.Costume)
    }
  })
}

main().catch((err) => console.error('Error:', err))
