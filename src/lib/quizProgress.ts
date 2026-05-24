import type { Student } from '@/lib/interfaces'

const DEFAULT_QUESTION_COUNT = 10

export interface QuizFilterOptions {
  includeNormal: boolean
  includeCostume: boolean
  includeCollaboration: boolean
}

export interface QuizCandidate {
  name: Student['Name']
  costume: Student['Costume']
  isCollaboration: boolean
}

export interface ProficiencyEntry {
  correct: number
  attempts: number
}

export interface QuizResultSummaryEntry {
  isCorrect: boolean
}

export type ProficiencyMap = Record<string, ProficiencyEntry>

// Trailing ASCII letters can indicate incomplete romaji during IME composition (e.g. "あk").
const TRAILING_ROMAJI_PATTERN = /[a-z]$/

export function filterCandidates(
  candidates: readonly QuizCandidate[],
  options: QuizFilterOptions,
): QuizCandidate[] {
  return candidates.filter((candidate) => {
    if (candidate.isCollaboration) {
      return options.includeCollaboration
    }
    if (candidate.costume) {
      return options.includeCostume
    }
    return options.includeNormal
  })
}

export function normalizeProficiencyMap(raw: unknown): ProficiencyMap {
  if (!raw || typeof raw !== 'object') {
    return {}
  }

  const result: ProficiencyMap = {}
  for (const [name, value] of Object.entries(raw)) {
    if (!value || typeof value !== 'object') {
      continue
    }
    const maybeCorrect = Number((value as { correct?: unknown }).correct)
    const maybeAttempts = Number((value as { attempts?: unknown }).attempts)
    if (!Number.isFinite(maybeCorrect) || !Number.isFinite(maybeAttempts)) {
      continue
    }
    result[name] = {
      correct: Math.max(0, Math.floor(maybeCorrect)),
      attempts: Math.max(0, Math.floor(maybeAttempts)),
    }
  }
  return result
}

export function migrateLegacyProficiency(raw: unknown): ProficiencyMap {
  const normalized = normalizeProficiencyMap(raw)
  if (Object.keys(normalized).length > 0) {
    return normalized
  }
  if (!raw || typeof raw !== 'object') {
    return {}
  }
  const result: ProficiencyMap = {}
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const correct = Math.max(0, Math.floor(value))
      result[name] = { correct, attempts: correct }
    }
  }
  return result
}

export function mergeWithStudents(
  proficiency: ProficiencyMap,
  studentNames: readonly string[],
): ProficiencyMap {
  const next: ProficiencyMap = { ...proficiency }
  for (const name of studentNames) {
    if (!next[name]) {
      next[name] = { correct: 0, attempts: 0 }
    }
  }
  return next
}

export function calculateAccuracy(entry?: ProficiencyEntry): number {
  if (!entry || entry.attempts <= 0) {
    return 0
  }
  return Math.round((entry.correct / entry.attempts) * 1000) / 10
}

export function normalizeQuizAnswer(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase()
}

export function normalizeKanaForSearch(value: string): string {
  return value.replace(/[ぁ-ゖ]/g, (char) =>
    // Hiragana(U+3041-U+3096) and Katakana(U+30A1-U+30F6) are offset by 0x60.
    String.fromCharCode(char.charCodeAt(0) + 0x60),
  )
}

export function normalizeNameInputForSearch(rawInput: string): string {
  const normalizedInput = normalizeQuizAnswer(rawInput.trim())
  if (!normalizedInput) {
    return ''
  }
  const shouldTrimLast =
    isTransientNameInputQuery(rawInput) && TRAILING_ROMAJI_PATTERN.test(normalizedInput)
  const trimmedInput = shouldTrimLast ? normalizedInput.slice(0, -1) : normalizedInput
  if (!trimmedInput) {
    return ''
  }
  return normalizeKanaForSearch(trimmedInput)
}

export function buildNameInputSuggestions(
  allNames: readonly string[],
  activeNames: readonly string[],
  rawInput: string,
  maxCount = 8,
): string[] {
  const normalizedKanaInput = normalizeNameInputForSearch(rawInput)
  if (!normalizedKanaInput) {
    return []
  }
  const activeSet = new Set(activeNames)
  return [...allNames]
    .filter((name) => activeSet.has(name))
    .map((name) => ({
      name,
      searchKey: normalizeKanaForSearch(normalizeQuizAnswer(name)),
    }))
    .filter(({ searchKey }) => searchKey.includes(normalizedKanaInput))
    .sort((a, b) => {
      const aStartsWith = a.searchKey.startsWith(normalizedKanaInput)
      const bStartsWith = b.searchKey.startsWith(normalizedKanaInput)
      if (aStartsWith !== bStartsWith) {
        return aStartsWith ? -1 : 1
      }
      return a.name.localeCompare(b.name, 'ja')
    })
    .map(({ name }) => name)
    .slice(0, Math.max(0, maxCount))
}

export function isTransientNameInputQuery(rawInput: string): boolean {
  const normalizedInput = normalizeQuizAnswer(rawInput.trim())
  if (!normalizedInput) {
    return false
  }
  const hasKana = /[ぁ-ゖァ-ヺ]/.test(normalizedInput)
  const hasAsciiLetter = /[a-z]/.test(normalizedInput)
  return hasKana && hasAsciiLetter
}

export function resolveStudentCategory(
  costume?: string,
  isCollaboration?: boolean,
): 'normal' | 'costume' | 'collaboration' {
  if (isCollaboration) {
    return 'collaboration'
  }
  if (costume) {
    return 'costume'
  }
  return 'normal'
}

export function resolveQuestionCount(
  rawValue: number,
  maxQuestions: number,
  fallback = DEFAULT_QUESTION_COUNT,
): number {
  if (maxQuestions <= 0) {
    return 0
  }
  const parsed = Math.floor(Number(rawValue))
  if (!Number.isFinite(parsed) || parsed < 1) {
    return Math.max(1, Math.min(fallback, maxQuestions))
  }
  return Math.max(1, Math.min(parsed, maxQuestions))
}

export function resolveMultipleChoiceMaxQuestions(
  candidateCount: number,
  choiceCount = 4,
): number {
  if (choiceCount < 2 || candidateCount < choiceCount) {
    return 0
  }
  return Math.floor(candidateCount / choiceCount)
}

export function summarizeQuizResults(results: readonly QuizResultSummaryEntry[]) {
  const totalCount = results.length
  const correctCount = results.filter((entry) => entry.isCorrect).length
  const wrongCount = Math.max(0, totalCount - correctCount)
  const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 1000) / 10 : 0
  return {
    totalCount,
    correctCount,
    wrongCount,
    accuracy,
    isPerfect: totalCount > 0 && correctCount === totalCount,
  }
}
