import fs from 'node:fs'
import path from 'node:path'

export function doesFileExist(localPath: string, fileName: string): boolean {
  const filePath = path.join(localPath, fileName)
  return fs.existsSync(filePath)
}

export function doesFolderExist(localPath: string): boolean {
  return fs.existsSync(localPath)
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

/**
 * 指定したフォルダ直下のHTMLファイルを削除する。
 * @param dirPath 削除対象のフォルダパス(プロジェクトルートからの相対パス)
 * 例：deleteHTMLFiles('public/example')
 */
export async function deleteHTMLFiles(dirPath: string): Promise<void> {
  try {
    const files = await fs.promises.readdir(dirPath)
    await Promise.all(
      files.map(async (file) => {
        if (path.extname(file) === '.html') {
          await fs.promises.unlink(path.join(dirPath, file))
          console.log(`Deleted ${path.join(dirPath, file)}`)
        }
      }),
    )
  } catch (err) {
    throw new Error(
      `Failed to delete HTML files in directory ${dirPath}: ${(err as Error).message}`,
    )
  }
}

/**
 * 指定したフォルダ直下のZIPファイルを削除する。
 * @param dirPath 削除対象のフォルダパス(プロジェクトルートからの相対パス)
 * 例：deleteZIPFiles('public/example')
 */
export async function deleteZIPFiles(dirPath: string): Promise<void> {
  try {
    const files = await fs.promises.readdir(dirPath)
    await Promise.all(
      files.map(async (file) => {
        if (path.extname(file) === '.zip') {
          await fs.promises.unlink(path.join(dirPath, file))
          console.log(`Deleted ${path.join(dirPath, file)}`)
        }
      }),
    )
  } catch (err) {
    throw new Error(
      `Failed to delete ZIP files in directory ${dirPath}: ${(err as Error).message}`,
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
export async function copyDirectoryContents(
  srcDir: string,
  destDir: string,
): Promise<void> {
  try {
    await createDirectoryIfNotExists(destDir)
    const files = await fs.promises.readdir(srcDir)
    await Promise.all(
      files.map(async (file) => {
        const srcFile = path.join(srcDir, file)
        const destFile = path.join(destDir, file)
        if (fs.lstatSync(srcFile).isDirectory()) {
          await copyDirectoryContents(srcFile, destFile)
        } else {
          await fs.promises.copyFile(srcFile, destFile)
        }
        console.log(`Copied ${srcFile} to ${destFile}`)
      }),
    )
  } catch (err) {
    throw new Error(
      `Failed to copy directory contents from ${srcDir} to ${destDir}: ${(err as Error).message}`,
    )
  }
}
