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
  //public/bluaka-title-call-quiz.xlsx
  await fileInput?.uploadFile('public/bluaka-title-call-quiz.xlsx')

  // 変換ボタンをクリック
  const submitButton = await iframe.$('input[type="submit"][value="変換"]')
  await submitButton?.click()

  // 限定公開ボタンの表示を待機
  await iframe.waitForSelector('input[value="限定公開"]', {
    timeout: 10000,
  })

  // 限定公開ボタンの onclick 属性から URL を取得
  const downloadButton = await iframe.$('input[value="限定公開"]')
  const downloadUrl = await iframe.evaluate((button) => {
    if (!button) return null
    const onclick = button.getAttribute('onclick')
    const match = onclick?.match(/window\.open\('([^']+)'/) // onclick 属性から URL を抽出
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
  const baseUrl = `https://quizgenerator.net`
  // baseUrlがスラッシュで終わっていない場合、末尾にスラッシュを追加
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  console.log('BaseURL:', baseUrl)
  const absoluteUrl = new URL(decodedUrl, normalizedBaseUrl).href
  console.log('AbsoluteURL:', absoluteUrl)

  // 限定公開ページにアクセス
  await page.goto(absoluteUrl)

  // textarea 内の URL を取得
  const quizUrl = await page.$eval('div textarea', (textarea) => textarea.value)

  console.log('Quiz URL:', quizUrl)

  await browser.close()
  return quizUrl
}
