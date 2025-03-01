import fs from 'node:fs'
import path from 'node:path'

import { deleteR2Folder, uploadFolderToR2 } from '@/lib/cloudflareR2Client'
import {
  copyDirectoryContents,
  deleteHTMLFiles,
  deleteZIPFiles,
  doesFolderExist,
} from '@/lib/fileOperations'
import { getQuizGeneratorZIP } from '@/lib/getQuizZIP'
import { getQuizOptionsJson } from '@/lib/getSpreadSheetJSON'
import type { QuizParam } from '@/lib/interfaces'
import { makeQuestionText } from '@/lib/makeQuestionText'
import { unzipLocalFile } from '@/lib/unzip'

let isFirstRun = true

export async function generateQuiz(quizParam: QuizParam): Promise<void> {
  if (isFirstRun) {
    isFirstRun = false
    await cleanUpOldSlugs()
  }

  const publicDirPath = path.join('public', quizParam.slug)
  const tmpDirPath = path.join('tmp', quizParam.slug)
  const cacheQuizFilePath = path.join(tmpDirPath, `${quizParam.slug}.txt`)

  if (!doesFolderExist(publicDirPath)) {
    const newQuizFilePath = await makeQuestionText(quizParam)
    console.log(`Created Question file at ${newQuizFilePath}`)
    const isSame = await compareTextFiles(cacheQuizFilePath, newQuizFilePath)

    if (!isSame) {
      const quizZIPFilePath = await getQuizGeneratorZIP(newQuizFilePath)
      console.log(`Created Quiz ZIP file at ${quizZIPFilePath}`)
      await unzipLocalFile(quizZIPFilePath, tmpDirPath)
      await deleteHTMLFiles(tmpDirPath)
      await deleteZIPFiles(tmpDirPath)
      await fs.promises.copyFile(newQuizFilePath, cacheQuizFilePath)
      console.log(`Copied new quiz file to cache: ${cacheQuizFilePath}`)
      await deleteR2Folder(`quiz/${quizParam.slug}`)
      await uploadFolderToR2(tmpDirPath, `quiz`)
    } else {
      console.log(`No changes for slug: ${quizParam.slug}`)
    }
    await copyDirectoryContents(tmpDirPath, publicDirPath)
  }
}

async function compareTextFiles(
  filePath1: string,
  filePath2: string,
): Promise<boolean> {
  try {
    const file1Content = await fs.promises.readFile(filePath1, 'utf-8')
    const file2Content = await fs.promises.readFile(filePath2, 'utf-8')
    return file1Content === file2Content
  } catch (error) {
    console.error(`Comparing files not found: ${error} `)
    return false
  }
}

async function cleanUpOldSlugs(): Promise<void> {
  console.log('Cleaning up old slugs...')
  const tmpDirPath = path.join('tmp')
  const quizOptions = await getQuizOptionsJson()
  const validSlugs = quizOptions.map((option) => option.slug)

  if (fs.existsSync(tmpDirPath)) {
    const files = fs.readdirSync(tmpDirPath)
    for (const file of files) {
      const filePath = path.join(tmpDirPath, file)
      if (fs.lstatSync(filePath).isDirectory() && !validSlugs.includes(file)) {
        fs.rmSync(filePath, { recursive: true, force: true })
        console.log(`Deleted old slug directory: ${filePath}`)
        await deleteR2Folder(`quiz/${file}`)
        console.log(`Deleted R2 folder for slug: quiz/${file}`)
      }
    }
  }
}
