import { QUIZ_SHARE_UI_TEXT } from '@/lib/uiText'

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

const drawAppName = (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = '#2f86d6'
  ctx.font = `bold 40px ${FONT_FAMILY}`
  ctx.fillText(QUIZ_SHARE_UI_TEXT.cardAppName, CARD_WIDTH / 2, CARD_MARGIN + 84)
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
export const drawChallengeCard = (
  content: ChallengeCardContent,
): HTMLCanvasElement | null => {
  const prepared = createCardCanvas()
  if (!prepared) {
    return null
  }
  const { canvas, ctx } = prepared
  const innerWidth = CARD_WIDTH - CARD_MARGIN * 2 - 80
  drawAppName(ctx)

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

export interface ResultCardContent {
  title: string | null
  correctCount: number
  totalCount: number
}

/** リザルトのスコアカード画像。 */
export const drawResultCard = (
  content: ResultCardContent,
): HTMLCanvasElement | null => {
  const prepared = createCardCanvas()
  if (!prepared) {
    return null
  }
  const { canvas, ctx } = prepared
  const innerWidth = CARD_WIDTH - CARD_MARGIN * 2 - 80
  drawAppName(ctx)

  if (content.title) {
    ctx.fillStyle = '#333333'
    ctx.font = `bold 44px ${FONT_FAMILY}`
    ctx.fillText(
      fitText(ctx, `「${content.title}」`, innerWidth),
      CARD_WIDTH / 2,
      CARD_MARGIN + 160,
    )
  }

  const accuracy =
    content.totalCount > 0
      ? Math.round((content.correctCount / content.totalCount) * 100)
      : 0
  const isPerfect =
    content.totalCount > 0 && content.correctCount === content.totalCount

  ctx.fillStyle = isPerfect ? '#d6642f' : '#1f5e9c'
  ctx.font = `bold 128px ${FONT_FAMILY}`
  ctx.fillText(
    `${content.correctCount} / ${content.totalCount}`,
    CARD_WIDTH / 2,
    CARD_MARGIN + 330,
  )

  ctx.fillStyle = '#555555'
  ctx.font = `bold 44px ${FONT_FAMILY}`
  ctx.fillText(
    isPerfect
      ? QUIZ_SHARE_UI_TEXT.cardPerfect
      : `${QUIZ_SHARE_UI_TEXT.cardAccuracyPrefix}${accuracy}%`,
    CARD_WIDTH / 2,
    CARD_MARGIN + 410,
  )

  drawHost(ctx)
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
export const deliverCardImage = async (
  canvas: HTMLCanvasElement,
  fileName: string,
  shareText?: string,
): Promise<ImageDeliveryMethod> => {
  // Safari はユーザー操作の直後でないと clipboard.write を拒否するため、
  // Blob の Promise をそのまま ClipboardItem へ渡す(await を挟まない)。
  const blobPromise = canvasToPngBlob(canvas)

  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches
  if (
    isTouchDevice &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      const blob = await blobPromise
      const file = new File([blob], fileName, { type: 'image/png' })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText })
        return 'share'
      }
    } catch (error) {
      // 共有キャンセルはそのまま終わる(他の手段へ切り替えない)
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'share'
      }
    }
  }

  try {
    if (typeof ClipboardItem === 'function' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blobPromise }),
      ])
      return 'clipboard'
    }
  } catch {
    // コピー不可ならダウンロードへ
  }

  try {
    const blob = await blobPromise
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = fileName
    link.click()
    URL.revokeObjectURL(link.href)
    return 'download'
  } catch {
    return 'none'
  }
}
