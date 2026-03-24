export const SORT_DIRECTION_LABEL = {
  asc: '昇順',
  desc: '降順',
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

export const formatQuizQuestionStatus = (questionNumber: number): string =>
  `第${questionNumber}問: このタイトルコールは誰？`

export const formatQuizFinishedStatus = (score: number, total: number): string =>
  `終了！${score} / ${total} 問正解`

export const formatAnswerResultStatus = (isCorrect: boolean, currentAnswer: string): string =>
  isCorrect ? '正解！' : `不正解… 正解は「${currentAnswer}」`

export const formatResultSummary = (
  correctCount: number,
  totalCount: number,
  wrongCount: number,
  accuracy: number,
): string => `正解: ${correctCount} / ${totalCount} ・不正解: ${wrongCount} ・正答率: ${accuracy}%`

export const formatResultEntryStatus = (
  questionNumber: number,
  isCorrect: boolean,
): string => `第${questionNumber}問 ${isCorrect ? '正解' : '不正解'}`

export const formatResultEntryCorrectAnswer = (correctAnswer: string): string =>
  `${QUIZ_UI_TEXT.correctPrefix}: ${correctAnswer}`

export const formatResultEntryUserAnswer = (userAnswer: string): string =>
  `${QUIZ_UI_TEXT.answerPrefix}: ${userAnswer || QUIZ_UI_TEXT.unanswered}`
