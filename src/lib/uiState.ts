export const setHidden = (
  element: HTMLElement | null | undefined,
  hidden: boolean,
): void => {
  if (!element) {
    return
  }
  element.hidden = hidden
}

/**
 * ダイアログの外側(バックドロップ)クリックで閉じる。オプション・進捗・
 * クラウド同期で共通の挙動。dialog 要素自身への click はバックドロップ上の
 * クリックでも発火するため、座標が内容領域の外かどうかで判定する。
 */
export const closeOnBackdropClick = (
  dialog: HTMLDialogElement | null,
): void => {
  dialog?.addEventListener('click', (event) => {
    if (event.target !== dialog) {
      return
    }
    const rect = dialog.getBoundingClientRect()
    const isInsideDialog =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    if (!isInsideDialog) {
      dialog.close()
    }
  })
}
