export interface SpreadsheetConfig {
  spreadsheetId: string
  sheetName: string
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

export type QuizOptions = QuizOption[]

export interface QuizOption {
  slug: string
  option: string
}
