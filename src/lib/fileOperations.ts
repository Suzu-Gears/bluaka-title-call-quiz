import fs from 'node:fs'
import path from 'node:path'

export function doesFileExist(localPath: string, fileName: string): boolean {
  const filePath = path.join(localPath, fileName)
  return fs.existsSync(filePath)
}

export function readLocalJSON(filePath: string): Record<string, any> {
  try {
    const data = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(data)
  } catch (err) {
    throw new Error(
      `Failed to read or parse JSON file at ${filePath}: ${
        (err as Error).message
      }`,
    )
  }
}

export async function createDirectoryIfNotExists(
  dirPath: string,
): Promise<void> {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

export function saveJSON(
  filePath: string,
  jsonData: Record<string, any>,
): void {
  try {
    const dir = path.dirname(filePath)
    createDirectoryIfNotExists(dir)
    const data = JSON.stringify(jsonData, null, 2)
    fs.writeFileSync(filePath, data, 'utf-8')
  } catch (err) {
    throw new Error(
      `Failed to write JSON file at ${filePath}: ${(err as Error).message}`,
    )
  }
}
