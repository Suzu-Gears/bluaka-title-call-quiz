import { resolveAssetUrl } from '@/lib/assetPath'
import { QUIZ_SHARE_UI_TEXT, QUIZ_UI_TEXT } from '@/lib/uiText'

/**
 * SNS シェア用の画像(1200x630 のカード)を canvas で生成して渡す。
 *
 * X の Web Intent には画像を添付できないため、渡し方は環境に応じて変える:
 *   1. タッチ端末: OS の共有シート(X アプリを選べば画像付き投稿になる)
 *   2. それ以外: クリップボードへコピー(投稿画面に貼り付けてもらう)
 *   3. どちらも使えなければ PNG ダウンロード
 */

const CARD_WIDTH = 1200
const CARD_HEIGHT = 630
const CARD_MARGIN = 60
const FONT_FAMILY = "'Kosugi Maru', 'Hiragino Sans', sans-serif"

/** 背景と白いカード面まで描いた状態の canvas を用意する。 */
const createCardCanvas = (): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
} | null => {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return null
  }
  const background = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT)
  background.addColorStop(0, '#2f86d6')
  background.addColorStop(1, '#164a80')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)'
  ctx.beginPath()
  ctx.roundRect(
    CARD_MARGIN,
    CARD_MARGIN,
    CARD_WIDTH - CARD_MARGIN * 2,
    CARD_HEIGHT - CARD_MARGIN * 2,
    28,
  )
  ctx.fill()
  ctx.textAlign = 'center'
  return { canvas, ctx }
}

/** カード幅に収まるまで末尾を落として「…」を付ける。 */
const fitText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string => {
  let fitted = text
  while (ctx.measureText(fitted).width > maxWidth && fitted.length > 2) {
    fitted = `${fitted.slice(0, -2)}…`
  }
  return fitted
}

/**
 * 省略できない文字列(スコアなど)を、収まるまでフォントを縮めて描くためのサイズ計算。
 * 呼び出し後の ctx.font は決定したサイズになっている。
 */
const fitFontSize = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
): number => {
  let size = startSize
  ctx.font = `bold ${size}px ${FONT_FAMILY}`
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 4
    ctx.font = `bold ${size}px ${FONT_FAMILY}`
  }
  return size
}

/**
 * タイトルロゴ。SVG を <img> で読むと Safari がマスクを落として文字が消える
 * ため、canvas にはあらかじめ焼いた PNG を使う(比率 1600:352)。
 */
const LOGO_ASPECT = 1600 / 352

const loadLogo = (): Promise<HTMLImageElement | null> =>
  loadImage(resolveAssetUrl('title-logo-card.png'))

/**
 * ロゴを中央に描く。読み込めなかったときは同じ位置に文字で代替する。
 * centerY はロゴの縦中心。
 */
const drawLogo = (
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement | null,
  width: number,
  centerX: number,
  centerY: number,
) => {
  if (logo) {
    const height = width / LOGO_ASPECT
    ctx.drawImage(
      logo,
      centerX - width / 2,
      centerY - height / 2,
      width,
      height,
    )
    return
  }
  ctx.fillStyle = '#2f86d6'
  ctx.font = `bold ${Math.round(width * 0.09)}px ${FONT_FAMILY}`
  ctx.fillText(QUIZ_SHARE_UI_TEXT.cardAppName, centerX, centerY + 12)
}

const drawHost = (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = '#888888'
  ctx.font = `28px ${FONT_FAMILY}`
  ctx.fillText(
    window.location.host,
    CARD_WIDTH / 2,
    CARD_HEIGHT - CARD_MARGIN - 40,
  )
}

export interface ChallengeCardContent {
  title: string
  author: string | null
  desc: string | null
  questionCount: number
  /** 形式の内訳(例: 択一6・マッチ3・入力1)。 */
  questionSummary: string
}

/** 挑戦状のアイキャッチ画像。 */
export const drawChallengeCard = async (
  content: ChallengeCardContent,
): Promise<HTMLCanvasElement | null> => {
  const prepared = createCardCanvas()
  if (!prepared) {
    return null
  }
  const { canvas, ctx } = prepared
  const innerWidth = CARD_WIDTH - CARD_MARGIN * 2 - 80
  drawLogo(ctx, await loadLogo(), 400, CARD_WIDTH / 2, 150)

  const title = content.title || QUIZ_SHARE_UI_TEXT.tweetDefaultQuizName
  ctx.fillStyle = '#333333'
  ctx.font = `bold 64px ${FONT_FAMILY}`
  ctx.fillText(fitText(ctx, `「${title}」`, innerWidth), CARD_WIDTH / 2, 280)

  ctx.fillStyle = '#1f5e9c'
  ctx.font = `bold 44px ${FONT_FAMILY}`
  ctx.fillText(
    `全${content.questionCount}問（${content.questionSummary}）`,
    CARD_WIDTH / 2,
    370,
  )

  ctx.fillStyle = '#555555'
  ctx.font = `32px ${FONT_FAMILY}`
  const subLines = [
    content.author
      ? `${QUIZ_SHARE_UI_TEXT.challengeAuthorPrefix}${content.author}`
      : null,
    content.desc,
  ].filter((line): line is string => Boolean(line))
  subLines.forEach((line, index) => {
    ctx.fillText(
      fitText(ctx, line, innerWidth),
      CARD_WIDTH / 2,
      430 + index * 48,
    )
  })

  drawHost(ctx)
  return canvas
}

interface ScoreBlockOptions {
  centerX: number
  /** スコア文字のベースライン。 */
  scoreBaseline: number
  /** 「100点満点、花丸です！」等のベースライン。スタンプより下に置く。 */
  captionBaseline: number
  maxWidth: number
  stamp: HTMLImageElement | null
  stampSize: number
  scoreStartSize: number
  correctCount: number
  totalCount: number
}

/**
 * スコアとスタンプ、その下の一言をまとめて描く。
 * スコアとスタンプは横に並べて 1 セットで中央へ、一言はその下で中央寄せ。
 */
const drawScoreBlock = (
  ctx: CanvasRenderingContext2D,
  options: ScoreBlockOptions,
): void => {
  const {
    centerX,
    scoreBaseline,
    captionBaseline,
    maxWidth,
    stamp,
    stampSize,
    scoreStartSize,
    correctCount,
    totalCount,
  } = options
  const isPerfect = totalCount > 0 && correctCount === totalCount
  const showStamp = isPerfect && !!stamp
  const STAMP_GAP = 32

  const scoreText = `${correctCount} / ${totalCount}`
  // 「9999 / 9999」のような長いスコアは収まるまで自動で縮める。
  const scoreFontSize = fitFontSize(
    ctx,
    scoreText,
    maxWidth - (showStamp ? stampSize + STAMP_GAP : 0),
    scoreStartSize,
    44,
  )
  const scoreWidth = ctx.measureText(scoreText).width
  const groupWidth = showStamp ? scoreWidth + STAMP_GAP + stampSize : scoreWidth
  const groupLeft = centerX - groupWidth / 2

  ctx.textAlign = 'left'
  ctx.fillStyle = isPerfect ? '#d6642f' : '#1f5e9c'
  ctx.font = `bold ${scoreFontSize}px ${FONT_FAMILY}`
  ctx.fillText(scoreText, groupLeft, scoreBaseline)

  if (showStamp && stamp) {
    // つぶれないよう大きめに、少し傾けてスタンプらしく押す。
    ctx.save()
    ctx.translate(
      groupLeft + scoreWidth + STAMP_GAP + stampSize / 2,
      scoreBaseline - scoreFontSize / 2.6,
    )
    ctx.rotate(-0.18)
    ctx.drawImage(stamp, -stampSize / 2, -stampSize / 2, stampSize, stampSize)
    ctx.restore()
  }

  const accuracy =
    totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0
  ctx.textAlign = 'center'
  ctx.fillStyle = '#555555'
  ctx.font = `bold 32px ${FONT_FAMILY}`
  ctx.fillText(
    fitText(
      ctx,
      isPerfect
        ? QUIZ_SHARE_UI_TEXT.cardPerfect
        : `${QUIZ_SHARE_UI_TEXT.cardAccuracyPrefix}${accuracy}%`,
      maxWidth,
    ),
    centerX,
    captionBaseline,
  )
}

export interface ChallengeResultCardContent extends ChallengeCardContent {
  correctCount: number
  totalCount: number
}

/**
 * 挑戦状の結果カード。アイキャッチにスコアとスタンプを載せた形。
 *
 * 標準クイズの結果カードと違って正誤一覧は描かない。挑戦状の結果は共有 URL と
 * セットで出回るため、一覧を載せると受け取った人に答えを配ることになる
 * (標準クイズは出題がその場のランダムなので一覧を載せても再現されない)。
 */
export const drawChallengeResultCard = async (
  content: ChallengeResultCardContent,
): Promise<HTMLCanvasElement | null> => {
  const prepared = createCardCanvas()
  if (!prepared) {
    return null
  }
  const { canvas, ctx } = prepared
  const innerWidth = CARD_WIDTH - CARD_MARGIN * 2 - 80
  const isPerfect =
    content.totalCount > 0 && content.correctCount === content.totalCount
  const [logo, stamp] = await Promise.all([
    loadLogo(),
    isPerfect ? loadImage(resolveAssetUrl('kokona-stamp.png')) : null,
  ])

  drawLogo(ctx, logo, 380, CARD_WIDTH / 2, 148)

  const title = content.title || QUIZ_SHARE_UI_TEXT.tweetDefaultQuizName
  ctx.fillStyle = '#333333'
  ctx.font = `bold 48px ${FONT_FAMILY}`
  ctx.fillText(fitText(ctx, `「${title}」`, innerWidth), CARD_WIDTH / 2, 250)

  // 問題数と作者は 1 行にまとめる(スコアとスタンプの場所を空けるため)。
  const metaLine = [
    `全${content.questionCount}問（${content.questionSummary}）`,
    content.author
      ? `${QUIZ_SHARE_UI_TEXT.challengeAuthorPrefix}${content.author}`
      : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join('　')
  ctx.fillStyle = '#1f5e9c'
  ctx.font = `bold 30px ${FONT_FAMILY}`
  ctx.fillText(fitText(ctx, metaLine, innerWidth), CARD_WIDTH / 2, 300)

  drawScoreBlock(ctx, {
    centerX: CARD_WIDTH / 2,
    scoreBaseline: 420,
    captionBaseline: 486,
    maxWidth: innerWidth,
    stamp,
    stampSize: 130,
    scoreStartSize: 84,
    correctCount: content.correctCount,
    totalCount: content.totalCount,
  })

  drawHost(ctx)
  return canvas
}

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })

export interface ResultCardEntry {
  questionNumber: number
  /** 正答(生徒名。マッチングは連結名)。 */
  correctLabel: string
  /** 回答表示(「回答: …」整形済み)。 */
  answerLabel: string
  isCorrect: boolean
  imageUrl: string | null
}

export interface ResultCardContent {
  title: string | null
  correctCount: number
  totalCount: number
  entries: ResultCardEntry[]
}

// リザルト画像(縦長)のレイアウト定数
const RESULT_WIDTH = 900
const RESULT_PADDING = 30
const RESULT_HEADER_HEIGHT = 390
const RESULT_ROW_HEIGHT = 128
const RESULT_ROW_GAP = 14
const RESULT_FOOTER_HEIGHT = 80
/** 1枚に載せる問題数の上限。超過分は「…ほかN問」と書く。 */
const RESULT_MAX_ROWS = 20

/**
 * リザルト画像。リザルト画面と同じ「生徒画像+正誤の一覧」を縦長で再現し、
 * 最上部にスコアを載せる。全問正解ならココナのはなまるスタンプを押す。
 */
export const drawResultCard = async (
  content: ResultCardContent,
): Promise<HTMLCanvasElement | null> => {
  const rows = content.entries.slice(0, RESULT_MAX_ROWS)
  const overflowCount = content.entries.length - rows.length
  const listHeight =
    rows.length * (RESULT_ROW_HEIGHT + RESULT_ROW_GAP) +
    (overflowCount > 0 ? 56 : 0)
  const height =
    RESULT_PADDING * 2 +
    RESULT_HEADER_HEIGHT +
    listHeight +
    RESULT_FOOTER_HEIGHT

  const canvas = document.createElement('canvas')
  canvas.width = RESULT_WIDTH
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return null
  }

  // 先に全画像を読み込む(失敗した分はプレースホルダー)
  const [logo, stamp, fallbackImage, ...rowImages] = await Promise.all([
    loadLogo(),
    loadImage(resolveAssetUrl('kokona-stamp.png')),
    loadImage(resolveAssetUrl('default-student-image.webp')),
    ...rows.map((row) =>
      row.imageUrl ? loadImage(row.imageUrl) : Promise.resolve(null),
    ),
  ])

  const background = ctx.createLinearGradient(0, 0, RESULT_WIDTH, height)
  background.addColorStop(0, '#2f86d6')
  background.addColorStop(1, '#164a80')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, RESULT_WIDTH, height)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)'
  ctx.beginPath()
  ctx.roundRect(
    RESULT_PADDING,
    RESULT_PADDING,
    RESULT_WIDTH - RESULT_PADDING * 2,
    height - RESULT_PADDING * 2,
    24,
  )
  ctx.fill()

  const innerX = RESULT_PADDING + 28
  const innerWidth = RESULT_WIDTH - (RESULT_PADDING + 28) * 2

  // --- ヘッダー(ロゴ + スコア) ---
  drawLogo(ctx, logo, 340, RESULT_WIDTH / 2, RESULT_PADDING + 66)

  if (content.title) {
    ctx.fillStyle = '#333333'
    ctx.font = `bold 34px ${FONT_FAMILY}`
    ctx.fillText(
      fitText(ctx, `「${content.title}」`, innerWidth),
      RESULT_WIDTH / 2,
      RESULT_PADDING + 152,
    )
  }

  drawScoreBlock(ctx, {
    centerX: RESULT_WIDTH / 2,
    scoreBaseline: RESULT_PADDING + 256,
    captionBaseline: RESULT_PADDING + 340,
    maxWidth: innerWidth,
    stamp,
    stampSize: 150,
    scoreStartSize: 96,
    correctCount: content.correctCount,
    totalCount: content.totalCount,
  })

  // --- 正誤の一覧(リザルト画面の再現) ---
  ctx.textAlign = 'left'
  let y = RESULT_PADDING + RESULT_HEADER_HEIGHT
  rows.forEach((row, index) => {
    ctx.fillStyle = row.isCorrect ? '#eef7f0' : '#fdf1f0'
    ctx.beginPath()
    ctx.roundRect(innerX, y, innerWidth, RESULT_ROW_HEIGHT, 16)
    ctx.fill()
    ctx.fillStyle = row.isCorrect ? '#2e8b57' : '#d03c3c'
    ctx.beginPath()
    ctx.roundRect(innerX, y, 10, RESULT_ROW_HEIGHT, 5)
    ctx.fill()

    const image = rowImages[index] ?? fallbackImage
    const imageX = innerX + 26
    const imageY = y + 12
    const imageW = 94
    const imageH = RESULT_ROW_HEIGHT - 24
    if (image) {
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(imageX, imageY, imageW, imageH, 10)
      ctx.clip()
      // object-fit: cover 相当(中央を切り出す)
      const scale = Math.max(imageW / image.width, imageH / image.height)
      const drawW = image.width * scale
      const drawH = image.height * scale
      ctx.drawImage(
        image,
        imageX + (imageW - drawW) / 2,
        imageY + (imageH - drawH) / 2,
        drawW,
        drawH,
      )
      ctx.restore()
    }

    const textX = imageX + imageW + 22
    const textWidth = innerX + innerWidth - textX - 20
    ctx.fillStyle = row.isCorrect ? '#1f6f3f' : '#b3261e'
    ctx.font = `bold 27px ${FONT_FAMILY}`
    ctx.fillText(
      `第${row.questionNumber}問 ${row.isCorrect ? QUIZ_UI_TEXT.correctLabel : QUIZ_UI_TEXT.incorrectLabel}`,
      textX,
      y + 40,
    )
    ctx.fillStyle = '#333333'
    ctx.font = `bold 28px ${FONT_FAMILY}`
    ctx.fillText(fitText(ctx, row.correctLabel, textWidth), textX, y + 78)
    ctx.fillStyle = '#666666'
    ctx.font = `25px ${FONT_FAMILY}`
    ctx.fillText(fitText(ctx, row.answerLabel, textWidth), textX, y + 112)

    y += RESULT_ROW_HEIGHT + RESULT_ROW_GAP
  })

  if (overflowCount > 0) {
    ctx.fillStyle = '#666666'
    ctx.font = `26px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.fillText(`…ほか${overflowCount}問`, RESULT_WIDTH / 2, y + 34)
    ctx.textAlign = 'left'
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = '#888888'
  ctx.font = `24px ${FONT_FAMILY}`
  ctx.fillText(
    window.location.host,
    RESULT_WIDTH / 2,
    height - RESULT_PADDING - 30,
  )
  return canvas
}

const canvasToPngBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('画像を生成できませんでした'))
      }
    }, 'image/png')
  })

export type ImageDeliveryMethod = 'share' | 'clipboard' | 'download' | 'none'

/** 画像の渡し方(共有/コピー/保存)に応じた案内文。share は共有シートに任せて空。 */
export const imageDeliveryMessage = (method: ImageDeliveryMethod): string => {
  if (method === 'clipboard') {
    return QUIZ_SHARE_UI_TEXT.imageCopied
  }
  if (method === 'download') {
    return QUIZ_SHARE_UI_TEXT.imageDownloaded
  }
  if (method === 'none') {
    return QUIZ_SHARE_UI_TEXT.imageFailed
  }
  return ''
}

/**
 * 画像を「共有シート → クリップボード → ダウンロード」の順で渡し、
 * どの手段で渡せたかを返す(呼び出し側が案内文を出し分ける)。
 * 共有シートはタッチ端末に限る(PC ではコピーの方が X に貼りやすい)。
 */
/**
 * OS の共有シートが使えるか(= 画像とテキストを 1 操作で渡せるか)。
 * タッチ端末に限るのは、デスクトップの共有シートが実質使い物にならないため。
 */
export const canShareCardImage = (): boolean =>
  window.matchMedia('(pointer: coarse)').matches &&
  typeof navigator.share === 'function' &&
  typeof navigator.canShare === 'function'

/** OS の共有シートへ画像とテキストを渡す。渡せなければ false。 */
const shareCardImage = async (
  blobPromise: Promise<Blob>,
  fileName: string,
  shareText?: string,
): Promise<boolean> => {
  if (!canShareCardImage()) {
    return false
  }
  try {
    const blob = await blobPromise
    const file = new File([blob], fileName, { type: 'image/png' })
    if (!navigator.canShare({ files: [file] })) {
      return false
    }
    await navigator.share({ files: [file], text: shareText })
    return true
  } catch (error) {
    // 共有シートのキャンセルは失敗ではない(他の手段へ切り替えない)
    return error instanceof DOMException && error.name === 'AbortError'
  }
}

/** 画像をクリップボードへ。書き込めなければ false。 */
const copyCardImage = async (blobPromise: Promise<Blob>): Promise<boolean> => {
  if (typeof ClipboardItem !== 'function' || !navigator.clipboard?.write) {
    return false
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blobPromise }),
    ])
    return true
  } catch {
    return false
  }
}

/** 画像を PNG として保存。 */
const downloadCardImage = async (
  blobPromise: Promise<Blob>,
  fileName: string,
): Promise<boolean> => {
  try {
    const blob = await blobPromise
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = fileName
    link.click()
    URL.revokeObjectURL(link.href)
    return true
  } catch {
    return false
  }
}

/**
 * Safari はユーザー操作の直後でないと clipboard.write を拒否するため、Blob の
 * Promise を await せずそのまま ClipboardItem へ渡す。canvas から Blob を作る
 * のは呼び出し側では await しないこと。
 */
export const shareCardImageToOs = async (
  canvas: HTMLCanvasElement,
  fileName: string,
  shareText?: string,
): Promise<ImageDeliveryMethod> => {
  const blobPromise = canvasToPngBlob(canvas)
  return (await shareCardImage(blobPromise, fileName, shareText))
    ? 'share'
    : 'none'
}

export const copyCardImageToClipboard = async (
  canvas: HTMLCanvasElement,
): Promise<ImageDeliveryMethod> => {
  const blobPromise = canvasToPngBlob(canvas)
  return (await copyCardImage(blobPromise)) ? 'clipboard' : 'none'
}

export const saveCardImage = async (
  canvas: HTMLCanvasElement,
  fileName: string,
): Promise<ImageDeliveryMethod> => {
  const blobPromise = canvasToPngBlob(canvas)
  return (await downloadCardImage(blobPromise, fileName)) ? 'download' : 'none'
}

/** 環境に応じて共有 → コピー → 保存の順に試す(挑戦状のアイキャッチ用)。 */
export const deliverCardImage = async (
  canvas: HTMLCanvasElement,
  fileName: string,
  shareText?: string,
): Promise<ImageDeliveryMethod> => {
  const blobPromise = canvasToPngBlob(canvas)
  if (await shareCardImage(blobPromise, fileName, shareText)) {
    return 'share'
  }
  if (await copyCardImage(blobPromise)) {
    return 'clipboard'
  }
  return (await downloadCardImage(blobPromise, fileName)) ? 'download' : 'none'
}
