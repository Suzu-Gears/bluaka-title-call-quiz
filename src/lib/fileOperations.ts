import fs from 'node:fs'
import path from 'node:path'

export function ensureDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true })
}

export function doesFileExist(localPath: string, fileName: string): boolean {
  return fs.existsSync(path.join(localPath, fileName))
}

export function readLocalJSON(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (err) {
    throw new Error(
      `Failed to read or parse JSON file at ${filePath}: ${(err as Error).message}`,
    )
  }
}

/** 存在しない・壊れている場合は例外にせず null を返す(キャッシュ読み出し用)。 */
export function readLocalJSONIfValid(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) {
    return null
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

export function saveJSON(filePath: string, jsonData: unknown): void {
  try {
    ensureDirectory(path.dirname(filePath))
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8')
  } catch (err) {
    throw new Error(
      `Failed to write JSON file at ${filePath}: ${(err as Error).message}`,
    )
  }
}

export function saveText(filePath: string, content: string): void {
  ensureDirectory(path.dirname(filePath))
  fs.writeFileSync(filePath, content, 'utf-8')
}

export function saveBinary(filePath: string, data: Uint8Array): void {
  ensureDirectory(path.dirname(filePath))
  fs.writeFileSync(filePath, data)
}

/** ディレクトリ配下のファイルを再帰的に列挙し、baseDir からの相対パス(/区切り)で返す。 */
export function listFilesRecursively(baseDir: string): string[] {
  if (!fs.existsSync(baseDir)) {
    return []
  }
  const results: string[] = []
  const walk = (currentDir: string) => {
    for (const dirent of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, dirent.name)
      if (dirent.isDirectory()) {
        walk(absolutePath)
      } else if (dirent.isFile()) {
        results.push(
          path.relative(baseDir, absolutePath).split(path.sep).join('/'),
        )
      }
    }
  }
  walk(baseDir)
  return results
}
