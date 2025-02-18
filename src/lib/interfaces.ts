export interface SpreadsheetConfig {
  spreadsheetId: string
  sheetName: string
  outputDir: string
  outputFile: string
}

export type Students = Student[]

export interface Student {
  name: string
  voiceActor: string
  date: string
  school: string
  firstName: string
  costume: string
  sortText: string
}
