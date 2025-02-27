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

export function createDirectoryIfNotExists(dirPath: string): void {
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

/**
 * 指定したフォルダ直下のHTMLファイルを削除する。
 * @param dirPath 削除対象のフォルダパス(プロジェクトルートからの相対パス)
 * 例：deleteHTMLFiles('public/example')
 */
export function deleteHTMLFiles(dirPath: string): void {
  try {
    const files = fs.readdirSync(dirPath)
    files.forEach((file) => {
      if (path.extname(file) === '.html') {
        fs.unlinkSync(path.join(dirPath, file))
        console.log(`Deleted ${path.join(dirPath, file)}`)
      }
    })
  } catch (err) {
    throw new Error(
      `Failed to delete HTML files in directory ${dirPath}: ${(err as Error).message}`,
    )
  }
}

/**
 * 指定したディレクトリの中身を指定したディレクトリにコピーする。
 * ディレクトリが存在しない場合は作成する。
 * @param srcDir コピー元のディレクトリパス(プロジェクトルートからの相対パス)
 * @param destDir コピー先のディレクトリパス(プロジェクトルートからの相対パス)
 * 例：copyDirectoryContents('public/source', 'public/destination')
 */
export function copyDirectoryContents(srcDir: string, destDir: string): void {
  try {
    createDirectoryIfNotExists(destDir)
    const files = fs.readdirSync(srcDir)
    files.forEach((file) => {
      const srcFile = path.join(srcDir, file)
      const destFile = path.join(destDir, file)
      if (fs.lstatSync(srcFile).isDirectory()) {
        copyDirectoryContents(srcFile, destFile)
      } else {
        fs.copyFileSync(srcFile, destFile)
      }
    })
  } catch (err) {
    throw new Error(
      `Failed to copy directory contents from ${srcDir} to ${destDir}: ${(err as Error).message}`,
    )
  }
}
