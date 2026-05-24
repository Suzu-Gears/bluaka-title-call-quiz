import assert from 'node:assert/strict'

import { buildChoices, shuffleArray } from '@/lib/quizEngine'
import {
  calculateAccuracy,
  buildNameInputSuggestions,
  filterCandidates,
  isTransientNameInputQuery,
  normalizeNameInputForSearch,
  normalizeKanaForSearch,
  mergeWithStudents,
  migrateLegacyProficiency,
  normalizeQuizAnswer,
  normalizeProficiencyMap,
  resolveMultipleChoiceMaxQuestions,
  resolveStudentCategory,
  resolveQuestionCount,
  summarizeQuizResults,
} from '@/lib/quizProgress'
import {
  formatAnswerResultStatus,
  formatQuizFinishedStatus,
  formatQuizQuestionStatus,
  formatResultEntryCorrectAnswer,
  formatResultEntryStatus,
  formatResultEntryUserAnswer,
  formatResultSummary,
  QUIZ_UI_TEXT,
  SORT_DIRECTION_LABEL,
} from '@/lib/uiText'

const deterministicRandom = () => 0

{
  const shuffled = shuffleArray([1, 2, 3, 4], deterministicRandom)
  assert.deepEqual(shuffled, [2, 3, 4, 1])
}

{
  const choices = buildChoices(
    'correct',
    ['correct', 'choice1', 'choice2', 'choice3', 'choice4'],
    4,
    deterministicRandom,
  )
  assert.equal(choices.length, 4)
  assert.ok(choices.includes('correct'))
  assert.equal(new Set(choices).size, 4)
}

{
  assert.throws(
    () => buildChoices('correct', ['correct', 'choice1'], 4),
    /Not enough candidates/,
  )
}

{
  const candidates = [
    { name: 'A', costume: '', isCollaboration: false },
    { name: 'A(衣装)', costume: '衣装', isCollaboration: false },
    { name: 'B', costume: '', isCollaboration: true },
  ]
  assert.deepEqual(
    filterCandidates(candidates, {
      includeNormal: true,
      includeCostume: false,
      includeCollaboration: false,
    }).map(({ name }) => name),
    ['A'],
  )
  assert.deepEqual(
    filterCandidates(candidates, {
      includeNormal: false,
      includeCostume: true,
      includeCollaboration: true,
    }).map(({ name }) => name),
    ['A(衣装)', 'B'],
  )
}

{
  const normalized = normalizeProficiencyMap({
    A: { correct: 2, attempts: 3 },
    B: { correct: -1, attempts: 1 },
    C: { correct: 'x', attempts: 1 },
  })
  assert.deepEqual(normalized, {
    A: { correct: 2, attempts: 3 },
    B: { correct: 0, attempts: 1 },
  })
}

{
  const migrated = migrateLegacyProficiency({
    A: 4,
    B: 0,
    C: 'invalid',
  })
  assert.deepEqual(migrated, {
    A: { correct: 4, attempts: 4 },
    B: { correct: 0, attempts: 0 },
  })
}

{
  const merged = mergeWithStudents(
    { A: { correct: 2, attempts: 3 } },
    ['A', 'B', 'C'],
  )
  assert.deepEqual(merged.B, { correct: 0, attempts: 0 })
  assert.deepEqual(merged.C, { correct: 0, attempts: 0 })
}

{
  assert.equal(calculateAccuracy({ correct: 3, attempts: 4 }), 75)
  assert.equal(calculateAccuracy({ correct: 0, attempts: 0 }), 0)
}

{
  assert.equal(normalizeQuizAnswer('  ｱｲﾘ  '), 'アイリ')
  assert.equal(normalizeQuizAnswer('Ａ b　c'), 'abc')
}

{
  const suggestions = buildNameInputSuggestions(
    ['アリス', 'イオリ', 'アル', 'アスナ'],
    ['アリス', 'アル', 'アスナ'],
    'ア',
    3,
  )
  assert.deepEqual(suggestions, ['アスナ', 'アリス', 'アル'])
  assert.deepEqual(
    buildNameInputSuggestions(['アリス'], ['アリス'], '   '),
    [],
  )
  assert.deepEqual(
    buildNameInputSuggestions(['アリス', 'アスナ'], ['アリス', 'アスナ'], 'あす'),
    ['アスナ'],
  )
  assert.deepEqual(
    buildNameInputSuggestions(['キサキ', 'サキ'], ['キサキ', 'サキ'], 'サキ'),
    ['サキ', 'キサキ'],
  )
  assert.equal(normalizeKanaForSearch(normalizeQuizAnswer('さき')), 'サキ')
  assert.equal(isTransientNameInputQuery('あｒ'), true)
  assert.equal(isTransientNameInputQuery('アル'), false)
  assert.equal(isTransientNameInputQuery('ar'), false)
  assert.equal(isTransientNameInputQuery('  あＲ  '), true)
  assert.equal(normalizeNameInputForSearch('あｋ'), 'ア')
  assert.deepEqual(buildNameInputSuggestions(['ア'], ['ア'], 'あｋ'), ['ア'])
}

{
  assert.equal(resolveStudentCategory('', false), 'normal')
  assert.equal(resolveStudentCategory('イベント衣装', false), 'costume')
  assert.equal(resolveStudentCategory('', true), 'collaboration')
}

{
  assert.equal(resolveQuestionCount(1, 30), 1)
  assert.equal(resolveQuestionCount(20, 10), 10)
  assert.equal(resolveQuestionCount(0, 5), 5)
  assert.equal(resolveQuestionCount(Number.NaN, 8), 8)
}

{
  assert.equal(resolveMultipleChoiceMaxQuestions(120), 30)
  assert.equal(resolveMultipleChoiceMaxQuestions(4), 1)
  assert.equal(resolveMultipleChoiceMaxQuestions(3), 0)
  assert.equal(resolveMultipleChoiceMaxQuestions(0), 0)
  assert.equal(resolveMultipleChoiceMaxQuestions(10, 5), 2)
  assert.equal(resolveMultipleChoiceMaxQuestions(11, 4), 2)
}

{
  const summary = summarizeQuizResults([
    { isCorrect: true },
    { isCorrect: false },
    { isCorrect: true },
  ])
  assert.deepEqual(summary, {
    totalCount: 3,
    correctCount: 2,
    wrongCount: 1,
    accuracy: 66.7,
    isPerfect: false,
  })
}

{
  const perfect = summarizeQuizResults([
    { isCorrect: true },
    { isCorrect: true },
  ])
  assert.equal(perfect.isPerfect, true)
  assert.equal(perfect.accuracy, 100)
}

{
  assert.equal(SORT_DIRECTION_LABEL.asc, '昇順')
  assert.equal(SORT_DIRECTION_LABEL.desc, '降順')
  assert.equal(QUIZ_UI_TEXT.next, '次へ')
  assert.equal(QUIZ_UI_TEXT.start, '開始')
  assert.equal(formatQuizQuestionStatus(3), '第3問: このタイトルコールは誰？')
  assert.equal(formatQuizFinishedStatus(8, 10), '終了！8 / 10 問正解')
  assert.equal(formatAnswerResultStatus(true, 'アリス'), '正解！')
  assert.equal(formatAnswerResultStatus(false, 'アリス'), '不正解… 正解は「アリス」')
  assert.equal(formatResultSummary(7, 10, 3, 70), '正解: 7 / 10 ・不正解: 3 ・正答率: 70%')
  assert.equal(formatResultEntryStatus(2, true), '第2問 正解')
  assert.equal(formatResultEntryStatus(2, false), '第2問 不正解')
  assert.equal(formatResultEntryCorrectAnswer('ヒナ'), '正答: ヒナ')
  assert.equal(formatResultEntryUserAnswer('ホシノ'), '回答: ホシノ')
  assert.equal(formatResultEntryUserAnswer(''), '回答: （未回答）')
}

console.log('All quiz tests passed.')
