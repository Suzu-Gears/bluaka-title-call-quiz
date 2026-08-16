import { readStorageJson, writeStorage } from '@/lib/safeStorage'

/**
 * カード一覧・クイズ設定画面の表示設定を localStorage に保存する。
 * 進捗データ(proficiency)とはキーを分け、壊れていても起動に影響しないよう
 * 読み出しはすべて部分的(Partial)に扱う。
 */

const STORAGE_KEY = 'bluaka-title-call-quiz2.ui-settings.v1'

export type SortDirection = 'asc' | 'desc'

export type CardListSettings = {
  showNormal: boolean
  showCostume: boolean
  showCollaboration: boolean
  sortMode: string
  sortDirection: SortDirection
}

export type QuizSetupSettings = {
  mode: string
  drawMode: string
  includeNormal: boolean
  includeCostume: boolean
  includeCollaboration: boolean
  questionCount: number
}

type UiSettings = {
  cardList?: Partial<CardListSettings>
  quizSetup?: Partial<QuizSetupSettings>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readAll = (): UiSettings => {
  const raw = readStorageJson(STORAGE_KEY)
  if (!isRecord(raw)) {
    return {}
  }
  return {
    cardList: isRecord(raw.cardList) ? raw.cardList : undefined,
    quizSetup: isRecord(raw.quizSetup) ? raw.quizSetup : undefined,
  }
}

const writeAll = (settings: UiSettings): void => {
  writeStorage(STORAGE_KEY, JSON.stringify(settings))
}

const pickBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined

const pickString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

export const loadCardListSettings = (): Partial<CardListSettings> => {
  const saved = readAll().cardList ?? {}
  const direction = pickString(saved.sortDirection)
  return {
    showNormal: pickBoolean(saved.showNormal),
    showCostume: pickBoolean(saved.showCostume),
    showCollaboration: pickBoolean(saved.showCollaboration),
    sortMode: pickString(saved.sortMode),
    sortDirection:
      direction === 'asc' || direction === 'desc' ? direction : undefined,
  }
}

export const saveCardListSettings = (settings: CardListSettings): void => {
  writeAll({ ...readAll(), cardList: settings })
}

export const loadQuizSetupSettings = (): Partial<QuizSetupSettings> => {
  const saved = readAll().quizSetup ?? {}
  const questionCount = saved.questionCount
  return {
    mode: pickString(saved.mode),
    drawMode: pickString(saved.drawMode),
    includeNormal: pickBoolean(saved.includeNormal),
    includeCostume: pickBoolean(saved.includeCostume),
    includeCollaboration: pickBoolean(saved.includeCollaboration),
    questionCount:
      typeof questionCount === 'number' &&
      Number.isFinite(questionCount) &&
      questionCount >= 1
        ? Math.floor(questionCount)
        : undefined,
  }
}

export const saveQuizSetupSettings = (settings: QuizSetupSettings): void => {
  writeAll({ ...readAll(), quizSetup: settings })
}
