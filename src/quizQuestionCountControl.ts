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

const LONG_PRESS_DELAY_MS = 500
const LONG_PRESS_INTERVAL_MS = 100

export const setupQuizQuestionCountControl = ({
  elements,
  getQuestionCountMax,
  onChange,
}: SetupQuizQuestionCountControlParams): QuizQuestionCountControl => {
  const { input, minusButton, plusButton, minButton, maxButton } = elements
  const container = input.closest('.quiz-question-count-component-wrapper')
  if (container && navigator.userAgent.includes('Windows')) {
    container.classList.add('win')
  }

  const blurOnEscape = (event: KeyboardEvent, element: HTMLElement) => {
    if (event.key === 'Escape') {
      element.blur()
    }
  }

  const setButtonDisabled = (button: HTMLButtonElement, disabled: boolean) => {
    button.disabled = disabled
    button.classList.toggle('disabled', disabled)
  }

  const syncButtonState = () => {
    const maxQuestions = getQuestionCountMax()
    const selected =
      maxQuestions > 0
        ? resolveQuestionCount(Number(input.value), maxQuestions, 1)
        : 0
    const isAtMin = maxQuestions <= 0 || selected <= 1
    const isAtMax = maxQuestions <= 0 || selected >= maxQuestions

    setButtonDisabled(minusButton, isAtMin)
    setButtonDisabled(minButton, isAtMin)
    setButtonDisabled(plusButton, isAtMax)
    setButtonDisabled(maxButton, isAtMax)
  }

  const updateInput = (nextValue: number) => {
    const maxQuestions = getQuestionCountMax()
    const clamped = resolveQuestionCount(nextValue, maxQuestions, 1)
    input.value = String(clamped)
    syncButtonState()
    onChange()
  }

  const stopLongPressTimers = (() => {
    let timeoutId: number | null = null
    let intervalId: number | null = null

    const stop = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
        timeoutId = null
      }
      if (intervalId !== null) {
        window.clearInterval(intervalId)
        intervalId = null
      }
    }

    const start = (action: () => void) => {
      stop()
      action()
      timeoutId = window.setTimeout(() => {
        intervalId = window.setInterval(action, LONG_PRESS_INTERVAL_MS)
      }, LONG_PRESS_DELAY_MS)
    }

    return { start, stop }
  })()

  const attachAdjustButtonHandlers = (
    button: HTMLButtonElement,
    action: () => void,
  ) => {
    let suppressClick = false
    const consumeSuppressedClick = () => {
      if (!suppressClick) {
        return false
      }
      suppressClick = false
      return true
    }
    const stop = () => {
      stopLongPressTimers.stop()
      suppressClick = false
    }
    const start = () => {
      if (button.disabled) {
        return
      }
      suppressClick = true
      stopLongPressTimers.start(action)
    }
    button.addEventListener('mousedown', (event) => {
      if (event.button !== 0) {
        return
      }
      start()
    })
    button.addEventListener(
      'touchstart',
      (event) => {
        event.preventDefault()
        start()
      },
      { passive: false },
    )
    button.addEventListener('mouseup', stop)
    button.addEventListener('mouseleave', stop)
    button.addEventListener('touchend', stop)
    button.addEventListener('touchcancel', stop)
    button.addEventListener('click', () => {
      if (button.disabled) {
        return
      }
      if (consumeSuppressedClick()) {
        return
      }
      action()
    })
  }

  input.addEventListener('input', () => {
    syncButtonState()
    onChange()
  })
  input.addEventListener('keydown', (event) => {
    blurOnEscape(event, input)
  })
  attachAdjustButtonHandlers(minusButton, () => {
    updateInput(Number(input.value) - 1)
  })
  attachAdjustButtonHandlers(plusButton, () => {
    updateInput(Number(input.value) + 1)
  })
  minButton.addEventListener('click', () => {
    updateInput(1)
  })
  maxButton.addEventListener('click', () => {
    updateInput(getQuestionCountMax())
  })
  ;[minusButton, plusButton, minButton, maxButton].forEach((button) => {
    button.addEventListener('keydown', (event) => {
      blurOnEscape(event, button)
    })
  })

  syncButtonState()

  return {
    getSelectedQuestionCount: (maxQuestions) =>
      resolveQuestionCount(Number(input.value), maxQuestions, 1),
    updateRange: (maxQuestions) => {
      const inputMax = Math.max(1, maxQuestions)
      input.max = String(inputMax)
      if (Number(input.value) > inputMax) {
        input.value = String(inputMax)
      }
      syncButtonState()
    },
  }
}
