/**
 * 開発者ツールを開いた人向けのイースターエッグ。
 *
 * 開発者ツールが開かれたことの検知はどの手も不安定(ウィンドウ幅の差分は
 * 別ウィンドウ化で外れ、debugger 文は相手の実行を止めてしまう)。
 * ブラウザは開く前のログも保持して開いた時点で見せてくれるので、
 * 起動時に一度出しておくだけでよい。
 *
 * 出題する側が糾弾する筋なので、クイズ画面に入ったときだけ流す。
 * 生徒リストを眺めているだけの人に絡んでも意味がない。
 */

const VOICE = 'color:#1f446d;font-weight:bold;font-size:13px'
const SHOUT = 'color:#b3261e;font-weight:bold;font-size:16px'
const ROAR = 'color:#b3261e;font-weight:bold;font-size:22px'

/**
 * 次のセリフまでの間は文字数から決める。短い叫びはテンポよく畳みかけ、
 * 長い台詞には読む時間を取る。長すぎる間はだれるので上限で止める。
 */
const BASE_WAIT_MS = 1000
const PER_CHAR_WAIT_MS = 120
const MAX_WAIT_MS = 5000

const waitForText = (text: string): number =>
  Math.min(BASE_WAIT_MS + text.length * PER_CHAR_WAIT_MS, MAX_WAIT_MS)

/** [セリフ, 見た目, 次のセリフまでの間(ms)]。間を省くと文字数から決まる。 */
type Line = [text: string, style: string, waitMs?: number]

/** 順に流す。開く前に出したぶんはまとめて表示される。 */
const say = (lines: Line[]): void => {
  let elapsed = 0
  lines.forEach(([text, style, waitMs]) => {
    const at = elapsed
    window.setTimeout(() => console.log(`%c${text}`, style), at)
    elapsed += waitMs ?? waitForText(text)
  })
}

let started = false

/** クイズ画面に入ったときに一度だけ呼ぶ。 */
export const setupConsoleEasterEgg = (): void => {
  if (started) {
    return
  }
  started = true
  say([
    ['なんだソレは！？', VOICE],
    ['……ンンッ？', VOICE],
    ['いったい……。', VOICE],
    ['……何なのだ！？', VOICE],
    ['か、開発者ツールッ……！？', VOICE],
    ['そ、そんなものが……どうして……。', VOICE],
    ['音声も、答えも、全部見えてしまうではないかッ！', VOICE],
    ['ルールは？技術者倫理は？\nそんな力に敵うわけがないだろう！？', VOICE],
    ['反則だッッ！', SHOUT],
    ['あんなもの……あんなもの、許されるものか！', SHOUT],
    [
      'そんなのナシだろ……開発者ツールなんて……\nゲームでこれは、ズルだろう……？はあ……？？',
      VOICE,
    ],
    ['こんなの、チートだ……。', VOICE],
    ['チートだ、チート！', SHOUT],
    ['チートだァァァァァッ！', ROAR],
    ['小生の出題を、覗き見るとはァァァァッ！', ROAR],
    ['ノーゲームだ！', SHOUT],
    ['分かったかッ！？', SHOUT],
  ])
}
