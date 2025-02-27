const puppeteer = require('puppeteer');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

/**
 * URLからZIPファイルをダウンロードする関数
 * @param {string} url - ダウンロードするZIPファイルのURL
 * @param {string} outputPath - 保存先のファイルパス
 * @returns {Promise<void>}
 */
function downloadZip(url, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (response) => {
      // リダイレクト対応
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        console.log(`Redirecting to ${response.headers.location}`);
        return downloadZip(response.headers.location, outputPath).then(resolve).catch(reject);
      }

      // ステータスコードのチェック
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: Status code ${response.statusCode}`));
        response.resume();
        return;
      }

      // 書き込みストリームの作成
      const fileStream = fs.createWriteStream(outputPath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => {
          console.log(`File downloaded to ${outputPath}`);
          resolve();
        });
      });

      fileStream.on('error', (err) => {
        fs.unlink(outputPath, () => reject(err)); // エラーが発生した場合、部分的なファイルを削除
      });
    });

    request.on('error', (err) => {
      reject(err);
    });
  });
}

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox'],
    headless: true,
  });
  const page = await browser.newPage();

  // アクセス先 URL
  await page.goto('https://quizgenerator.net/クイズジェネレータ変換ツール/'); // URL を指定

  // iframe を強制ロード
  await page.evaluate(() => {
    document.querySelectorAll('iframe[loading="lazy"]').forEach((iframe) => {
      iframe.setAttribute('loading', 'eager');
    });
  });
  const iframeElement = await page.waitForSelector('iframe[src="/quizgen6.6.5/"]');
  // iframe の取得
  const iframe = await iframeElement.contentFrame();

  // ファイルアップロード
  const fileInput = await iframe.$('input[type="file"][name="file"]');
  await fileInput.uploadFile('bluaka-title-call-quiz.xlsx');
  await page.screenshot({ path: 'after_upload.png', fullPage: true });

  // 変換ボタンをクリック
  const submitButton = await iframe.$('input[type="submit"][value="変換"]');
  await submitButton.click();

  // 結果が表示されるまで待機
  await iframe.waitForSelector('input[value="ダウンロード"]', {
    timeout: 10000,
  }); // ダウンロードボタンの表示を待機

  // ダウンロードボタンの onclick 属性から URL を取得
  const downloadButton = await iframe.$('input[value="ダウンロード"]');
  const downloadUrl = await iframe.evaluate((button) => {
    const onclick = button.getAttribute('onclick');
    const match = onclick.match(/location\.href='([^']+)'/); // onclick 属性から URL を抽出
    return match ? match[1] : null;
  }, downloadButton);

  if (!downloadUrl) {
    console.error('Download URL not found.');
    await browser.close();
    return;
  }

  console.log('File downloaded: ', downloadUrl);

  // URLエンコードされた部分をデコード
  let decodedUrl = decodeURIComponent(downloadUrl);

  // エスケープされた部分をデコード
  decodedUrl = decodedUrl.replace(/\\x2d/g, '-'); // \x2d -> -
  decodedUrl = decodedUrl.replace(/\\x2e/g, '.'); // \x2e -> .

  console.log('Decoded download URL:', decodedUrl);

  // 絶対URLを生成
  const baseUrl = 'https://quizgenerator.net/quizgen6.6.5';
  console.log('BaseURL:', baseUrl);
  // baseUrlがスラッシュで終わっていない場合、末尾にスラッシュを追加
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const absoluteUrl = new URL(decodedUrl, normalizedBaseUrl).href;

  console.log('AbsoluteURL:', absoluteUrl);

  const outputFilePath = path.join(__dirname, 'file.zip');

  downloadZip(absoluteUrl, outputFilePath)
    .then(() => {
      console.log('Download complete!');
    })
    .catch((err) => {
      console.error('Download failed:', err.message);
    });

  await browser.close();
})();
