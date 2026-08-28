import { formatClipRef } from '@/lib/assetKeys'
import type { QuizEntry, TitleCallClip } from '@/lib/interfaces'
import {
  summarizeQuestionTypes,
  type SharedQuizPayload,
  type SharedQuizQuestion,
} from '@/lib/quizShare'

/**
 * 共有クイズ定義を、プレイ側がそのまま消化できる出題プランの列へ解決する。
 * ID を手元のデータと突き合わせ、存在しない・音声が無い問題はスキップして数える。
 */

export type QuestionPlan =
  | {
      kind: 'choice'
      answerName: string
      /** 固定の誤答の生徒名。 */
      wrongNames: string[]
      /** 挑むたびに全生徒からランダムに選ぶ誤答の数。 */
      randomWrongCount: number
      /** 固定クリップ。null なら挑むたびにランダム。 */
      fixedClip: TitleCallClip | null
    }
  | {
      kind: 'input'
      answerName: string
      lunatic: boolean
      fixedClip: TitleCallClip | null
    }
  | { kind: 'match'; entryNames: string[] }

export interface ChallengePlanResult {
  plans: QuestionPlan[]
  /** 現在のデータで出題できずスキップした問題数。 */
  skippedCount: number
  /** 形式の内訳(例: 択一6・マッチ3・入力1)。 */
  questionSummary: string
}

const findClipByRef = (
  entry: QuizEntry,
  ref: string | undefined,
): TitleCallClip | null => {
  if (!ref) {
    return null
  }
  return (
    entry.TitleCalls.find(
      (clip) => formatClipRef(clip.clipId, clip.generation) === ref,
    ) ?? null
  )
}

const planFromQuestion = (
  question: SharedQuizQuestion,
  entryById: ReadonlyMap<number, QuizEntry>,
): QuestionPlan | null => {
  if (question.t === 'c') {
    const answer = entryById.get(question.a)
    if (!answer) {
      return null
    }
    const wrongNames = question.o
      .map((id) => entryById.get(id)?.Name)
      .filter((name): name is string => name !== undefined)
    const randomWrongCount = question.r ?? 0
    if (wrongNames.length + randomWrongCount === 0) {
      return null
    }
    return {
      kind: 'choice',
      answerName: answer.Name,
      wrongNames,
      randomWrongCount,
      fixedClip: findClipByRef(answer, question.clip),
    }
  }
  if (question.t === 'm') {
    const entries = question.e.map((id) => entryById.get(id))
    if (entries.some((entry) => entry === undefined)) {
      return null
    }
    return {
      kind: 'match',
      entryNames: (entries as QuizEntry[]).map((entry) => entry.Name),
    }
  }
  const answer = entryById.get(question.a)
  if (!answer) {
    return null
  }
  return {
    kind: 'input',
    answerName: answer.Name,
    lunatic: question.lu === true,
    fixedClip: findClipByRef(answer, question.clip),
  }
}

/**
 * 挑戦状のプランを組み立てる。
 * entryById は「音声を1本以上持つ出題可能なエントリ」だけを渡すこと
 * (存在チェック=再生可能チェックになる)。
 */
export function buildChallengePlans(
  payload: SharedQuizPayload,
  entryById: ReadonlyMap<number, QuizEntry>,
): ChallengePlanResult {
  const plans: QuestionPlan[] = []
  let skippedCount = 0

  for (const question of payload.q) {
    const plan = planFromQuestion(question, entryById)
    if (plan === null) {
      skippedCount += 1
      continue
    }
    plans.push(plan)
  }

  return {
    plans,
    skippedCount,
    questionSummary: summarizeQuestionTypes(
      plans.map((plan) => ({
        t: plan.kind === 'choice' ? 'c' : plan.kind === 'match' ? 'm' : 'i',
      })),
    ),
  }
}
