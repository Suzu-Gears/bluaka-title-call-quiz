import type { QuizParams, SpreadsheetConfig, Students } from '@/lib/interfaces'
import {
  GAS_DEPLOY_ID,
  QUIZ_SHEET_NAME,
  SPREADSHEET_ID,
  STUDENTS_SHEET_NAME,
} from '@/server-constants'

let quizOptionsCache: QuizParams | null = null

export async function getQuizOptionsJson(): Promise<QuizParams> {
  if (quizOptionsCache !== null) {
    return Promise.resolve(quizOptionsCache)
  }
  quizOptionsCache = (await getSpreadSheetJSON({
    spreadsheetId: SPREADSHEET_ID,
    sheetName: QUIZ_SHEET_NAME,
  })) as QuizParams
  return quizOptionsCache
}

export async function getSpreadSheetJSON(
  config: SpreadsheetConfig,
): Promise<Record<string, any>> {
  const { spreadsheetId, sheetName } = config
  const DOWNLOAD_URL = `https://script.google.com/macros/s/${GAS_DEPLOY_ID}/exec?id=${spreadsheetId}&name=${sheetName}`

  try {
    console.log(`Downloading JSON data from sheet:${sheetName}`)
    console.log(DOWNLOAD_URL)
    const response = await fetch(DOWNLOAD_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`)
    }
    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error downloading JSON:', error)
    console.error('Please check the following:')
    console.error(`- GAS_DEPLOY_ID: ${GAS_DEPLOY_ID}`)
    console.error(`- spreadsheetId: ${spreadsheetId}`)
    console.error(`- sheetName: ${sheetName}`)
    console.error(`- DOWNLOAD_URL: ${DOWNLOAD_URL}`)
    throw error
  }
}
