import fs from 'node:fs'
import path from 'node:path'

export async function clearPublicSubfolders(publicPath: string) {
  if (!fs.existsSync(publicPath)) {
    console.log(`Folder does not exist: ${publicPath}`)
    return
  }

  const items = await fs.promises.readdir(publicPath)

  for (const item of items) {
    const itemPath = path.join(publicPath, item)
    const stat = await fs.promises.stat(itemPath)

    if (stat.isDirectory()) {
      await clearFolder(itemPath)
      await fs.promises.rm(itemPath, { recursive: true, force: true })
    }
  }

  console.log(`Cleared subfolders in: ${publicPath}`)
}

async function clearFolder(folderPath: string) {
  const files = await fs.promises.readdir(folderPath)

  for (const file of files) {
    const filePath = path.join(folderPath, file)
    const stat = await fs.promises.stat(filePath)

    if (stat.isDirectory()) {
      await clearFolder(filePath)
      await fs.promises.rm(filePath, { recursive: true, force: true })
    } else {
      await fs.promises.unlink(filePath)
    }
  }
}

await clearPublicSubfolders('public')
