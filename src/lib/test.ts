import { makeQuestionText } from '@/lib/makeQuestionText'
import { getQuizOptionsJson } from './getSpreadSheetJSON'

async function main() {
  const quizParams = await getQuizOptionsJson()
  await Promise.all(
    quizParams.map(async (quizParam) => {
      const filePath = await makeQuestionText(quizParam)
      console.log(`File created at: ${filePath}`)
    }),
  )
}

main()
