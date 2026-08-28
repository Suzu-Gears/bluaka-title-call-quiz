/**
 * コピーボタンの成功フィードバック。ステータス行の文言は目に入りにくいため、
 * 押したボタン自身のラベルを一時的に「コピーしました」へ変えてパルスさせる。
 */
const FEEDBACK_LABEL = 'コピーしました'
const FEEDBACK_DURATION_MS = 1600

const timers = new WeakMap<HTMLButtonElement, number>()

export function showCopyFeedback(button: HTMLButtonElement | null): void {
  if (!button) {
    return
  }
  if (!timers.has(button)) {
    button.dataset.originalLabel = button.textContent ?? ''
  } else {
    window.clearTimeout(timers.get(button))
  }
  button.textContent = FEEDBACK_LABEL
  button.classList.remove('copy-feedback')
  // クラスを外して再追加することで連打時もアニメーションが再生される。
  void button.offsetWidth
  button.classList.add('copy-feedback')
  timers.set(
    button,
    window.setTimeout(() => {
      button.textContent = button.dataset.originalLabel ?? ''
      button.classList.remove('copy-feedback')
      timers.delete(button)
    }, FEEDBACK_DURATION_MS),
  )
}
