import appRoot from 'app-root-path'
import path from 'node:path'
import unzipper from 'unzipper'

const projectRoot = appRoot.path

/**
 * ローカルのZIPファイルを解凍する。
 * @param zipPath ZIPファイルのパス(プロジェクトルートからの相対パス)
 * @param folderPath 解凍先のフォルダパス(プロジェクトルートからの相対パス)
 * 例：unzipLocalFile('public/example.zip', 'public/extracted')
 */
export async function unzipLocalFile(zipPath: string, folderPath: string) {
  const zipPathResolved = path.join(projectRoot, zipPath)
  const destinationPath = path.join(projectRoot, folderPath)

  try {
    const directory = await unzipper.Open.file(zipPathResolved)
    await directory.extract({ path: destinationPath })

    console.log(`ZIP file extracted to: ${destinationPath}`)
  } catch (error: any) {
    console.error(`Failed to extract ZIP file: ${error.message}`)
  }
}
