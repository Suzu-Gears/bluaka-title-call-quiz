import assert from 'node:assert/strict'

import { buildChoices, shuffleArray } from '@/lib/quizEngine'

const deterministicRandom = () => 0

{
  const shuffled = shuffleArray([1, 2, 3, 4], deterministicRandom)
  assert.deepEqual(shuffled, [2, 3, 4, 1])
}

{
  const choices = buildChoices(
    'アロナ',
    ['アロナ', 'シロコ', 'ホシノ', 'セリカ', 'ノノミ'],
    4,
    deterministicRandom,
  )
  assert.equal(choices.length, 4)
  assert.ok(choices.includes('アロナ'))
  assert.equal(new Set(choices).size, 4)
}

{
  assert.throws(
    () => buildChoices('アロナ', ['アロナ', 'シロコ'], 4),
    /Not enough candidates/,
  )
}

console.log('All quiz engine tests passed.')
