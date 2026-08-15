/**
 * localStorage は Safari のプライベートモードなどで例外を投げる。
 * 進捗が保存できないことはあってもアプリが起動不能になってはいけないので、
 * 読み書きはすべてここを通して失敗を吸収する。
 */

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // 消せなくても実害はないため無視する
  }
}

/** JSON として読み出す。未保存・壊れている場合は null。 */
export function readStorageJson(key: string): unknown | null {
  const raw = readStorage(key)
  if (raw === null) {
    return null
  }
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
