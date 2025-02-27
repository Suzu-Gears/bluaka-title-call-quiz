import appRoot from 'app-root-path'
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer'

import { QUIZGEM_VERSION } from '@/server-constants'

const projectRoot = appRoot.path

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

  // アップロードファイルの名前を取得
  const fileName = path.basename(uploadFilePath, path.extname(uploadFilePath))

  // ダウンロード先のディレクトリを設定
  const downloadPath = path.resolve(projectRoot, `tmp/${fileName}`)
  await fs.promises.mkdir(downloadPath, { recursive: true })

  // CDPセッションを作成
  const cdpSession = await page.createCDPSession()
  await cdpSession.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath,
    eventsEnabled: true,
  })

  // ダウンロード完了を待機するPromise
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

  // アクセス先 URL
  await page.goto('https://quizgenerator.net/クイズジェネレータ変換ツール/')

  // iframe を強制ロード
  await page.evaluate(() => {
    document.querySelectorAll('iframe[loading="lazy"]').forEach((iframe) => {
      iframe.setAttribute('loading', 'eager')
    })
  })
  const iframeElement = await page.waitForSelector(
    `iframe[src="/quizgen${QUIZGEM_VERSION}/"]`,
  )
  // iframe の取得
  const iframe = await iframeElement?.contentFrame()

  if (!iframe) {
    console.error('Failed to get iframe content.')
    await browser.close()
    return ''
  }

  // ファイルアップロード
  const fileInput = await iframe.$('input[type="file"][name="file"]')
  await fileInput?.uploadFile(uploadFilePath)

  // 変換ボタンをクリック
  const submitButton = await iframe.$('input[type="submit"][value="変換"]')
  await submitButton?.click()

  // ダウンロードボタンの表示を待機
  await iframe.waitForSelector('input[value="ダウンロード"]', {
    timeout: 30000,
  })

  // ダウンロードボタンをクリックしてファイルをダウンロード
  const downloadButton = await iframe.$('input[value="ダウンロード"]')
  await downloadButton?.click()

  // ダウンロードイベントを待機
  await Promise.race([
    downloaded,
    new Promise<void>((_resolve, reject) => {
      setTimeout(() => {
        reject('download timed out')
      }, 30000) // タイムアウト時間を設定（30秒）
    }),
  ])

  // ダウンロードされたファイルを取得
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
