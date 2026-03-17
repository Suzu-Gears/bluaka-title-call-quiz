export function shuffleArray<T>(
  values: readonly T[],
  random: () => number = Math.random,
): T[] {
  const next = [...values]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function buildChoices(
  correctName: string,
  allNames: readonly string[],
  choiceCount = 4,
  random: () => number = Math.random,
): string[] {
  const uniqueNames = [...new Set(allNames)]
  const distractors = uniqueNames.filter((name) => name !== correctName)
  if (choiceCount < 2 || distractors.length < choiceCount - 1) {
    throw new Error('Not enough candidates to build quiz choices.')
  }

  const pickedDistractors = shuffleArray(distractors, random).slice(
    0,
    choiceCount - 1,
  )
  return shuffleArray([correctName, ...pickedDistractors], random)
}
