import fs from 'node:fs'
import path from 'node:path'

import type { SpreadsheetConfig, Students } from '@/lib/interfaces'
import { GAS_DEPLOY_ID } from '@/server-constants'

export async function getSpreadSheetJSON(config: SpreadsheetConfig): Promise<Students> {
  const { spreadsheetId, sheetName, outputDir, outputFile } = config
  const DOWNLOAD_URL = `https://script.google.com/macros/s/${GAS_DEPLOY_ID}/exec?id=${spreadsheetId}&name=${sheetName}`
  const filePath = path.join(outputDir, outputFile)

  if (fs.existsSync(filePath)) {
    console.log(`File already exists at ${filePath}. Reading existing file.`)
    const existingData = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(existingData) as Students
  }

  try {
    console.log(`Downloading JSON data from sheet:${sheetName}`)
    console.log(DOWNLOAD_URL)
    const response = await fetch(DOWNLOAD_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`)
    }

    const data = (await response.json()) as Students

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))

    console.log(`Data saved to ${filePath}`)
    return data
  } catch (error) {
    console.error('Error downloading JSON:', error)
    throw error
  }
}
