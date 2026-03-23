import { resolveQuestionCount } from '@/lib/quizProgress'

type QuizQuestionCountControlElements = {
  input: HTMLInputElement
  minusButton: HTMLButtonElement
  plusButton: HTMLButtonElement
  minButton: HTMLButtonElement
  maxButton: HTMLButtonElement
}

type SetupQuizQuestionCountControlParams = {
  elements: QuizQuestionCountControlElements
  getQuestionCountMax: () => number
  onChange: () => void
}

type QuizQuestionCountControl = {
  getSelectedQuestionCount: (maxQuestions: number) => number
  updateRange: (maxQuestions: number) => void
}

export const setupQuizQuestionCountControl = ({
  elements,
  getQuestionCountMax,
  onChange,
}: SetupQuizQuestionCountControlParams): QuizQuestionCountControl => {
  const { input, minusButton, plusButton, minButton, maxButton } = elements

  const blurOnEscape = (event: KeyboardEvent, element: HTMLElement) => {
    if (event.key === 'Escape') {
      element.blur()
    }
  }

  const adjustInput = (nextValue: number) => {
    const maxQuestions = getQuestionCountMax()
    const clamped = resolveQuestionCount(nextValue, maxQuestions, 1)
    input.value = String(clamped)
    onChange()
  }

  input.addEventListener('input', onChange)
  input.addEventListener('keydown', (event) => {
    blurOnEscape(event, input)
  })
  minusButton.addEventListener('click', () => {
    adjustInput(Number(input.value) - 1)
  })
  plusButton.addEventListener('click', () => {
    adjustInput(Number(input.value) + 1)
  })
  minButton.addEventListener('click', () => {
    adjustInput(1)
  })
  maxButton.addEventListener('click', () => {
    adjustInput(getQuestionCountMax())
  })
  ;[minusButton, plusButton, minButton, maxButton].forEach((button) => {
    button.addEventListener('keydown', (event) => {
      blurOnEscape(event, button)
    })
  })

  return {
    getSelectedQuestionCount: (maxQuestions) =>
      resolveQuestionCount(Number(input.value), maxQuestions, 1),
    updateRange: (maxQuestions) => {
      const inputMax = Math.max(1, maxQuestions)
      input.max = String(inputMax)
      if (Number(input.value) > inputMax) {
        input.value = String(inputMax)
      }
    },
  }
}
