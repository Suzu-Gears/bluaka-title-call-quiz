import { getQuizOptionsJson } from '@/lib/getSpreadSheetJSON'
import { makeQuestionText } from '@/lib/makeQuestionText'

async function processQuizOptions() {
  const quizOptions = await getQuizOptionsJson()
  for (const quizOption of quizOptions) {
    await makeQuestionText(quizOption)
  }
}

processQuizOptions()
