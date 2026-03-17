import assert from 'node:assert/strict'

import { buildChoices, shuffleArray } from '@/lib/quizEngine'
import {
  calculateAccuracy,
  filterCandidates,
  mergeWithStudents,
  migrateLegacyProficiency,
  normalizeQuizAnswer,
  normalizeProficiencyMap,
  resolveStudentCategory,
  resolveQuestionCount,
} from '@/lib/quizProgress'

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

console.log('All quiz tests passed.')
