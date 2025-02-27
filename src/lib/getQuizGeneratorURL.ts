import puppeteer from 'puppeteer'

import { QUIZGEM_VERSION } from '@/server-constants'

export async function getQuizGeneratorURL(): Promise<string> {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox'],
    headless: true,
  })
  const page = await browser.newPage()

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
  await fileInput?.uploadFile('public/data/master10.txt')

  // 変換ボタンをクリック
  const submitButton = await iframe.$('input[type="submit"][value="変換"]')
  await submitButton?.click()

  // ダウンロードボタンの表示を待機
  await iframe.waitForSelector('input[value="ダウンロード"]', {
    timeout: 10000,
  })

  // ダウンロードボタンの onclick 属性から URL を取得
  const downloadButton = await iframe.$('input[value="ダウンロード"]')
  const downloadUrl = await iframe.evaluate((button) => {
    if (!button) return null
    const onclick = button.getAttribute('onclick')
    const match = onclick?.match(/location\.href='([^']+)'/) // onclick 属性から URL を抽出
    return match ? match[1] : null
  }, downloadButton)

  if (!downloadUrl) {
    console.error('Download URL not found.')
    await browser.close()
    return ''
  }

  // URLエンコードされた部分をデコード
  let decodedUrl = decodeURIComponent(downloadUrl)

  // エスケープされた部分をデコード
  decodedUrl = decodedUrl.replace(/\\x2d/g, '-') // \x2d -> -
  decodedUrl = decodedUrl.replace(/\\x2e/g, '.') // \x2e -> .

  console.log('Decoded download URL:', decodedUrl)

  // 絶対URLを生成
  const baseUrl = `https://quizgenerator.net/quizgen${QUIZGEM_VERSION}`
  console.log('BaseURL:', baseUrl)
  // baseUrlがスラッシュで終わっていない場合、末尾にスラッシュを追加
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const absoluteUrl = new URL(decodedUrl, normalizedBaseUrl).href

  console.log('AbsoluteURL:', absoluteUrl)

  await browser.close()
  return absoluteUrl
}
