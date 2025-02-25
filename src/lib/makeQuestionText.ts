import fs from 'node:fs'
import path from 'node:path'

import { doesFileExist } from '@/lib/fileOperations'
import { getStudentsJson } from '@/lib/getSpreadSheetJSON'
import type { QuizParam, Students } from '@/lib/interfaces'

export async function makeQuestionText(quizParam: QuizParam): Promise<string> {
  const studentsData: Students = await getStudentsJson()

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
