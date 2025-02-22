import fs from 'node:fs'
import path from 'node:path'

export function doesFileExist(localPath: string, fileName: string): boolean {
  const filePath = path.join(localPath, fileName)
  return fs.existsSync(filePath)
}
