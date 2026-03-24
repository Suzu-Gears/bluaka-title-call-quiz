export const setHidden = (
  element: HTMLElement | null | undefined,
  hidden: boolean,
): void => {
  if (!element) {
    return
  }
  element.hidden = hidden
}
