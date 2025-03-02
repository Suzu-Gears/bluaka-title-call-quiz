import appRoot from 'app-root-path'
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'

import { QUIZGEM_VERSION } from '@/server-constants'

const projectRoot = appRoot.path
const quizGeneratorURL =
  'https://quizgenerator.net/クイズジェネレータ変換ツール/'

/**
 * QuizGeneratorの変換ツールに自動で問題文をアップロードしてZIPをダウンロードする。
 * @param uploadFilePath アップロードするファイルのパス(プロジェクトルートからの相対パス)
 * @returns ダウンロードしたZIPファイルの相対パス
 */
export async function getQuizGeneratorZIP(
  uploadFilePath: string,
): Promise<string> {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox'],
    headless: true,
  })
  const page = await browser.newPage()

  const fileName = path.basename(uploadFilePath, path.extname(uploadFilePath))

  const downloadPath = path.resolve(projectRoot, `tmp/${fileName}`)
  await fs.promises.mkdir(downloadPath, { recursive: true })

  const cdpSession = await page.createCDPSession()
  await cdpSession.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath,
    eventsEnabled: true,
  })

  const downloaded = new Promise<void>((resolve, reject) => {
    cdpSession.on(
      'Browser.downloadProgress',
      (params: { state: 'inProgress' | 'completed' | 'canceled' }) => {
        if (params.state === 'completed') {
          console.log('download completed')
          resolve()
        } else if (params.state === 'canceled') {
          reject('download cancelled')
        }
      },
    )
  })

  await page.goto(quizGeneratorURL)

  await page.evaluate(() => {
    document.querySelectorAll('iframe[loading="lazy"]').forEach((iframe) => {
      iframe.setAttribute('loading', 'eager')
    })
  })
  const iframeElement = await page.waitForSelector(
    `iframe[src="/quizgen${QUIZGEM_VERSION}/"]`,
  )
  const iframe = await iframeElement?.contentFrame()

  if (!iframe) {
    console.error('Failed to get iframe content.')
    await browser.close()
    return ''
  }

  const fileInput = await iframe.$('input[type="file"][name="file"]')
  await fileInput?.uploadFile(uploadFilePath)

  const submitButton = await iframe.$('input[type="submit"][value="変換"]')
  await submitButton?.click()

  await iframe.waitForSelector('input[value="ダウンロード"]', {
    timeout: 30000,
  })

  const downloadButton = await iframe.$('input[value="ダウンロード"]')
  await downloadButton?.click()

  await Promise.race([
    downloaded,
    new Promise<void>((_resolve, reject) => {
      setTimeout(() => {
        reject('download timed out')
      }, 30000)
    }),
  ])

  const files = await fs.promises.readdir(downloadPath)
  console.log('Downloaded files:', files)
  const downloadedFile = files.find((file) => file.endsWith('.zip'))

  if (downloadedFile) {
    const filePath = path.join(downloadPath, downloadedFile)
    console.log(`File downloaded to: ${filePath}`)
    const relativeFilePath = path.relative(projectRoot, filePath)
    await browser.close()
    return relativeFilePath
  } else {
    console.error('Failed to download the file.')
    await browser.close()
    return ''
  }
}
