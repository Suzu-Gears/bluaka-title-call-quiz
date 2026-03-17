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

export type ProficiencyMap = Record<string, ProficiencyEntry>

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

export function buildStudentSearchKey(name: string, costume?: string): string {
  return `${normalizeQuizAnswer(name)}\t${normalizeQuizAnswer(costume ?? '')}`
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
