import fs from 'node:fs'

import { getSpreadSheetJSON } from '@/lib/getSpreadSheetJSON'
import { SPREADSHEET_ID, STUDENTS_SHEET_NAME } from '@/server-constants'

const studentsData = await getSpreadSheetJSON({
  spreadsheetId: SPREADSHEET_ID,
  sheetName: STUDENTS_SHEET_NAME,
  outputDir: 'public/data',
  outputFile: 'studentsData.json',
})

// 設定ファイルの内容
const settingsContent = `#messages_intro:記述問題
#shuffle_questions:false
#mode:master
#movable:true
`

// 問題ファイルの内容を生成
const questionsContent = studentsData
  .map(
    ({ name }) => `[[${siteURL}/audio/${name}.mp3]]<br>この声は誰？
fill-in:
${name}
`,
  )
  .join('\n')

// 設定ファイルを作成
fs.writeFileSync('settings.txt', settingsContent, 'utf8')

// 問題ファイルを作成
fs.writeFileSync('questions.txt', questionsContent, 'utf8')

console.log('設定ファイルと問題ファイルを生成しました。')
