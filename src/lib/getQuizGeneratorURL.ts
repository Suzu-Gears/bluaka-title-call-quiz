import puppeteer from 'puppeteer'

import { QUIZGEM_VERSION } from '@/server-constants'
import path from 'path'

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
    const match = onclick?.match(/location\.href='([^']+)'/) // onclick 属性から URL を抽出
    return match ? match[1] : null
  }, downloadButton)

  if (!downloadUrl) {
    console.error('Download URL not found.')
    await browser.close()
    return ''
  }

  /*
  <input type="button" value="限定公開" onclick="window.open('/quizhoster/index.php?action=directUpload&amp;path=zipOBzZmm&amp;origFileName=bluaka\x2dtitle\x2dcall\x2dquiz\x2exlsx&amp;public=0')">
  */

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
