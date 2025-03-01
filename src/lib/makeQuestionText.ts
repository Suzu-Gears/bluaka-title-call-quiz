import fs from 'node:fs'
import path from 'node:path'

import { doesFileExist } from '@/lib/fileOperations'
import type { CostumeList, QuizParam, Students } from '@/lib/interfaces'
import { getCostumeList, getLatestCostumeStudent } from '@/lib/jsonUtils'
import { getStudentsData } from '@/lib/schaleDBClient'

/**
 * クイズの問題文テキストファイルを作成する。
 * IsCollaborationがfalseで、音声ファイルが存在する生徒の名前を問題文に追加する。
 * @param quizParam
 * @returns 作成したファイルのパス(例：public\data\quizText.txt)
 */
export async function makeQuestionText(quizParam: QuizParam): Promise<string> {
  const studentsData: Students = await getStudentsData()
  const costumeList: CostumeList = await getCostumeList()
  const costumeListString = costumeList.join('・')
  const latestCostumeStudentName = await getLatestCostumeStudent()
  const exampleStudentText = latestCostumeStudentName
    ? `<br>例：${latestCostumeStudentName}`
    : ''

  const questionsContent = studentsData
    .filter(({ Name, IsCollaboration }) => {
      const audioExists = doesFileExist(
        path.join('.', 'public/audio'),
        `${Name}.mp3`,
      )
      return audioExists && !IsCollaboration
    })
    .map(
      ({ Name }) =>
        `\n[[/audio/${Name}.mp3]]<br>これは誰のタイトルコール？<br><br>生徒の名前をカタカナで、別衣装があればカッコの中に記載${exampleStudentText}<br><br>別衣装の一覧：${costumeListString}\nfill-in:\n${Name}\n`,
    )
    .join('')

  const fileContent = `${quizParam.option}\n${questionsContent}`
  const filePath = path.join('public', 'data', `${quizParam.slug}.txt`)
  fs.writeFileSync(filePath, fileContent, 'utf8')

  return filePath
}
