export const SORT_DIRECTION_LABEL = {
  asc: '昇順',
  desc: '降順',
} as const

export const APP_ERROR_TEXT = {
  bootstrapFailed:
    'データの読み込みに失敗しました。時間をおいてページを再読み込みしてください。',
} as const

export const QUIZ_UI_TEXT = {
  // 設定画面の状態表示はエラー系メッセージ専用。案内文は出さない(見れば分かるため)。
  initialStatus: '',
  audioPlaybackFailed: '音声を再生できませんでした。もう一度お試しください。',
  next: '次へ',
  start: '開始',
  restart: 'リスタート',
  playAgain: 'もう一度',
  result: 'リザルト',
  startValidationNeedOneCandidate:
    'クイズを開始できません。選択中の条件で生徒データを1件以上用意してください。',
  startValidationNeedFourCandidates:
    'クイズを開始できません。選択中の条件で生徒データを4件以上用意してください。',
  pageLeaveConfirm:
    '現在クイズ中です。進行中のデータは保存されません。\nクイズを中断して生徒リストに移動しますか？',
  unanswered: '（未回答）',
  correctLabel: '正解',
  incorrectLabel: '不正解',
  correctPrefix: '正答',
  answerPrefix: '回答',
  matchGradedInstruction:
    '答え合わせ！カードをタップすると正解の音声を聴き直せます。',
  matchAllPairsCorrect: '全ペア正解',
} as const

/** マッチング問題の操作案内。 */
export const formatMatchInstruction = (
  clipNumber: number,
  totalClips: number,
): string =>
  `♪${clipNumber} / ${totalClips} を再生中。この声だと思うカードをタップ（タップし直しで解除）`

export const PROGRESS_UI_TEXT = {
  exportTitle: '進捗をエクスポート',
  exportDescription:
    '下のテキストをコピーするか、ファイルとして保存してください。別の端末やブラウザの「進捗をインポート」に貼り付けると復元できます。',
  importTitle: '進捗をインポート',
  importDescription:
    'エクスポートしたテキストを貼り付けるか、ファイルを選択して「読み込む」を押してください。現在の進捗は置き換えられます。',
  copied: 'コピーしました。',
  copyFailed:
    'コピーできませんでした。テキストを選択して手動でコピーしてください。',
  downloaded: 'ファイルとして保存しました。',
  importConfirm:
    '現在の進捗を、読み込んだデータで置き換えます。よろしいですか？',
  importFailedParse:
    'データを解釈できませんでした。エクスポートしたテキスト全体を貼り付けてください。',
  importFailedEmpty: '読み込める記録が含まれていませんでした。',
  fileReadFailed: 'ファイルを読み込めませんでした。',
  storageWriteFailed:
    '進捗を保存できませんでした。ブラウザのプライベートモードでは保存できないことがあります。',
} as const

export const SYNC_UI_TEXT = {
  title: 'クラウド同期',
  noCode: '同期コードが未設定です。「新しいコードを発行」を押してください。',
  generated:
    '新しい同期コードを発行しました。控えておいてください。まだクラウドには保存されていません。',
  uploading: 'クラウドへ保存しています...',
  uploaded: 'クラウドへ保存しました。',
  downloading: 'クラウドから読み込んでいます...',
  downloadEmpty: 'このコードで保存されたデータは見つかりませんでした。',
  failed: '通信に失敗しました。時間をおいて試してください。',
  invalidCode: '同期コードの形式が正しくありません。',
  invalidEndpoint:
    '保存先URLの形式が正しくありません。https:// で始まるURLを入力してください。',
  endpointSaved: '保存先を自分のスプレッドシートに変更しました。',
  endpointCleared: '保存先を既定（作者のシート）に戻しました。',
  noEndpoint: '保存先が設定されていません。保存先URLを入力してください。',
  downloadConfirm:
    'クラウドのデータで現在の進捗を置き換えます。よろしいですか？',
} as const

export const QUIZ_SHARE_UI_TEXT = {
  createDialogTitle: 'クイズを作って共有',
  selectedCountSuffix: '人選択中',
  pasteEmpty: '貼り付けるテキストを入力してください。',
  pasteMatchedSuffix: '人を選択に追加しました。',
  pasteUnmatchedPrefix: '見つからなかった名前',
  generateNeedsSelection: '出題する生徒を1人以上選択してください。',
  generateSucceeded: '共有URLを作成しました。コピーして友達に送ってください。',
  generateFailed: '共有URLを作成できませんでした。',
  copySucceeded: 'コピーしました。',
  copyFailed:
    'コピーできませんでした。テキストを選択して手動でコピーしてください。',
  tweetDefaultQuizName: 'タイトルコールクイズ',
  tweetInviteSuffix: 'に挑戦してみてください！',
  challengeArrivedSuffix: 'の挑戦状が届いています！',
  challengeAuthorPrefix: '作者: ',
  challengeSkippedSuffix: '問は現在のデータで出題できないためスキップされます',
  importBrokenUrl:
    '共有URLを読み込めませんでした。URL が途中で切れていないか確認してください。',
  importNoPlayableStudents:
    '共有されたクイズに、現在のデータで出題できる生徒がいませんでした。',
  imageFailed: '画像を作成できませんでした。',
  imageDownloaded: '画像を保存しました。Xの投稿に添付してください。',
  imageCopied: '画像をコピーしました。Xの投稿画面に貼り付けてください。',
  cardAppName: 'ブルアカ タイトルコールクイズ',
  cardPerfect: '100点満点、花丸です！',
  cardAccuracyPrefix: '正答率 ',
} as const

export const QUIZ_EDITOR_UI_TEXT = {
  typeChoice: '択一',
  typeMatch: 'マッチング',
  typeInput: '名前入力',
  unset: '（未設定）',
  pickStudent: '生徒を選ぶ',
  pickAnswerTitle: '正解の生徒を選ぶ',
  pickWrongTitle: '誤答の選択肢を選ぶ',
  pickMatchTitle: 'マッチング対象を選ぶ',
  answerLabel: '正解',
  wrongLabel: '誤答',
  matchLabel: '対象',
  addWrong: '＋誤答を追加',
  addMatchMember: '＋対象を追加',
  addAllForms: '同キャラの全フォームを追加',
  lunaticLabel: 'Lunatic（入力候補を出さない）',
  clipLabel: '音声: ',
  clipRandom: '毎回ランダム',
  listen: '試聴',
  duplicate: '複製',
  delete: '削除',
  remove: '外す',
  emptyQuestions:
    'まだ問題がありません。「＋択一」などのボタンで問題を追加してください。',
  questionPrefix: '問題',
  problemNoAnswer: '正解の生徒が未設定です',
  problemNoWrong: '誤答の選択肢を1人以上追加してください',
  problemMatchTooFew: 'マッチングは対象を2人以上にしてください',
  problemNoQuestions: '完成した問題がありません。',
  tooManyQuestions: '問題数の上限(100問)に達しています。',
  sheetImportedSuffix: '問を取り込みました。',
  sheetExportedSuffix: '問を書き出しました。',
  jsonExported: 'JSONを書き出しました。コピーして保管してください。',
  jsonImported: '読み込みました。',
  jsonImportFailed:
    '読み込めませんでした。書き出したJSONか、この形式の共有URLを貼り付けてください。',
  clearConfirm: '編集中の内容と下書きをすべて削除します。よろしいですか？',
} as const

/** 回答方式(4択・名前入力)の説明。選択中の値に応じて設定画面に出す。 */
export const QUIZ_MODE_DESCRIPTION: Record<string, string> = {
  'multiple-choice': '流れた音声の生徒を、4人の選択肢から選んで回答します。',
  'name-input': '生徒の名前を入力して回答します。入力中は候補が表示されます。',
  'name-input-lunatic':
    '候補の表示なしで名前を入力する、上級者向けの回答方式です。',
}

/** 出題モード(ランダム・学習・復習)の説明。 */
export const QUIZ_DRAW_MODE_DESCRIPTION: Record<string, string> = {
  random: '出題対象の中から、設定した問題数だけランダムに出題します。',
  learning:
    'まだ正解したことのない生徒の中から出題します。全員に正解すると学習は完了です。',
  review:
    '間違えたことのある生徒の中から出題します。連続2回正解すると復習対象から外れます。',
}

const formatCountWithRate = (
  label: string,
  count: number,
  totalCount: number,
): string => {
  const rate = totalCount > 0 ? Math.round((count / totalCount) * 1000) / 10 : 0
  return `${label}: ${count} / ${totalCount} 人（${rate}%）`
}

export const formatClearRate = (
  clearedCount: number,
  totalCount: number,
): string => formatCountWithRate('攻略率', clearedCount, totalCount)

export const formatReviewTargetCount = (
  count: number,
  totalCount: number,
): string => formatCountWithRate('復習対象', count, totalCount)

export const formatQuizQuestionStatus = (questionNumber: number): string =>
  `第${questionNumber}問: このタイトルコールは誰？`

export const formatQuizFinishedStatus = (
  score: number,
  total: number,
): string => `終了！${score} / ${total} 問正解`

export const formatAnswerResultStatus = (
  isCorrect: boolean,
  currentAnswer: string,
): string => (isCorrect ? '正解！' : `不正解… 正解は「${currentAnswer}」`)

export const formatResultSummary = (
  correctCount: number,
  totalCount: number,
  wrongCount: number,
  accuracy: number,
): string =>
  `正解: ${correctCount} / ${totalCount} ・不正解: ${wrongCount} ・正答率: ${accuracy}%`

export const formatResultEntryStatus = (
  questionNumber: number,
  isCorrect: boolean,
): string => `第${questionNumber}問 ${isCorrect ? '正解' : '不正解'}`

export const formatResultEntryCorrectAnswer = (correctAnswer: string): string =>
  `${QUIZ_UI_TEXT.correctPrefix}: ${correctAnswer}`

export const formatResultEntryUserAnswer = (userAnswer: string): string =>
  `${QUIZ_UI_TEXT.answerPrefix}: ${userAnswer || QUIZ_UI_TEXT.unanswered}`

/** カード一覧のクリップ表示。複数ある場合の位置と、あれば表示名を出す。 */
export const formatClipBadge = (
  index: number,
  total: number,
  label?: string,
): string => {
  const position = total > 1 ? `${index + 1}/${total}` : ''
  return [position, label].filter(Boolean).join(' ')
}

export const formatAnswerClipLabel = (label?: string): string =>
  label ? `音声: ${label}` : ''

export const formatImportSucceeded = (count: number): string =>
  `${count} 件の記録を読み込みました。`

export const formatSyncDownloaded = (updatedAt: string): string =>
  `クラウドのデータ(${updatedAt})を読み込みました。`
