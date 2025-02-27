import fs from 'node:fs'
import path from 'node:path'

import { doesFileExist } from '@/lib/fileOperations'
import type { QuizParam, Students } from '@/lib/interfaces'
import { getStudentsData } from '@/lib/schaleDBClient'

/**
 * クイズの問題文テキストファイルを作成する。
 * IsCollaborationがfalseで、音声ファイルが存在する生徒の名前を問題文に追加する。
 * @param quizParam
 * @returns 作成したファイルのパス(例：public\data\quizText.txt)
 */
export async function makeQuestionText(quizParam: QuizParam): Promise<string> {
  const studentsData: Students = await getStudentsData()

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
        `\n[[/audio/${Name}.mp3]]<br>この声は誰？\nfill-in:\n${Name}\n`,
    )
    .join('') // 空文字で結合することでカンマを除去

  const fileContent = `${quizParam.option}\n${questionsContent}`
  const filePath = path.join('public', 'data', `${quizParam.slug}.txt`)
  fs.writeFileSync(filePath, fileContent, 'utf8')

  return filePath
}
