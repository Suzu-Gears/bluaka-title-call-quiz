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
  invalidEndpoint:
    '保存先URLの形式が正しくありません。https:// で始まるURLを入力してください。',
  endpointSaved: '保存先を自分のスプレッドシートに変更しました。',
  endpointCleared: '保存先を既定（作者のシート）に戻しました。',
  noEndpoint:
    '保存先が設定されていません。保存先URLを入力してください。',
  downloadConfirm:
    'クラウドのデータで現在の進捗を置き換えます。よろしいですか？',
} as const

/** 回答方式(4択・名前入力)の説明。選択中の値に応じて設定画面に出す。 */
export const QUIZ_MODE_DESCRIPTION: Record<string, string> = {
  'multiple-choice': '流れた音声の生徒を、4人の選択肢から選んで回答します。',
  'name-input': '生徒の名前を入力して回答します。入力中は候補が表示されます。',
  'name-input-lunatic': '候補の表示なしで名前を入力する、上級者向けの回答方式です。',
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
  const rate =
    totalCount > 0 ? Math.round((count / totalCount) * 1000) / 10 : 0
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
