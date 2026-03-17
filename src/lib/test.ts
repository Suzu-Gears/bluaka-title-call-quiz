import assert from 'node:assert/strict'

import { buildChoices, shuffleArray } from '@/lib/quizEngine'

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

console.log('All quiz engine tests passed.')
