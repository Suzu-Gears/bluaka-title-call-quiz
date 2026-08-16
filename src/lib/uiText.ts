export const SORT_DIRECTION_LABEL = {
  asc: '昇順',
  desc: '降順',
} as const

export const APP_ERROR_TEXT = {
  bootstrapFailed:
    'データの読み込みに失敗しました。時間をおいてページを再読み込みしてください。',
} as const

export const QUIZ_UI_TEXT = {
  initialStatus: '「開始」を押すとクイズを開始します。',
  migratedLegacySave: '旧セーブデータを移行しました。',
  questionCountChanged: '問題数を変更しました。「開始」を押してください。',
  audioPlaybackFailed: '音声を再生できませんでした。もう一度お試しください。',
  next: '次へ',
  start: '開始',
  restart: 'リスタート',
  playAgain: 'もう一度',
  result: 'リザルト',
  modeChanged: '出題方式を変更しました。「開始」を押してください。',
  candidateFilterChanged: '出題対象を変更しました。「開始」を押してください。',
  audioVersionChanged:
    '出題する音声バージョンを変更しました。「開始」を押してください。',
  startValidationNeedOneCandidate:
    'クイズを開始できません。選択中の条件で生徒データを1件以上用意してください。',
  startValidationNeedFourCandidates:
    'クイズを開始できません。選択中の条件で生徒データを4件以上用意してください。',
  pageLeaveConfirm:
    '現在クイズ中です。進行中のデータは保存されません。\nクイズを中断してカード一覧に移動しますか？',
  unanswered: '（未回答）',
  correctLabel: '正解',
  incorrectLabel: '不正解',
  correctPrefix: '正答',
  answerPrefix: '回答',
} as const

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
  downloadConfirm:
    'クラウドのデータで現在の進捗を置き換えます。よろしいですか？',
} as const

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
