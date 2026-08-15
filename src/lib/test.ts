import assert from 'node:assert/strict'

import {
  formatAudioKey,
  formatClipRef,
  formatImageKey,
  isValidClipId,
  parseAudioKey,
  parseImageKey,
} from '@/lib/assetKeys'
import { hasSourceChanged, normalizeAudioManifest } from '@/lib/audioManifest'
import type { Student, TitleCallClip } from '@/lib/interfaces'
import {
  buildQuizEntries,
  extractCostume,
  extractStudentRecords,
  isCollaborationDevName,
  quizEntriesToCsv,
  stripCostume,
} from '@/lib/jsonUtils'
import {
  buildProgressExport,
  countProficiencyRecords,
  parseProgressExport,
  pickNewerSide,
  serializeProgressExport,
} from '@/lib/progressTransfer'
import { buildChoices, shuffleArray } from '@/lib/quizEngine'
import {
  buildNameInputSuggestions,
  calculateAccuracy,
  filterCandidates,
  isTransientNameInputQuery,
  mergeWithStudents,
  migrateLegacyProficiency,
  normalizeKanaForSearch,
  normalizeNameInputForSearch,
  normalizeProficiencyMap,
  normalizeQuizAnswer,
  resolveMultipleChoiceMaxQuestions,
  resolveQuestionCount,
  resolveStudentCategory,
  summarizeQuizResults,
} from '@/lib/quizProgress'
import { HttpStatusError, isNotFoundError } from '@/lib/schaleDBClient'
import { isValidSyncCode, parseSyncPayload } from '@/lib/syncClient'
import {
  hasMultipleGenerations,
  orderClipsForBrowsing,
  pickRandomClip,
  selectPlayableClips,
  sortTitleCallClips,
} from '@/lib/titleCallClips'
import {
  formatAnswerResultStatus,
  formatClipBadge,
  formatQuizFinishedStatus,
  formatQuizQuestionStatus,
  formatResultEntryCorrectAnswer,
  formatResultEntryStatus,
  formatResultEntryUserAnswer,
  formatResultSummary,
  QUIZ_UI_TEXT,
  SORT_DIRECTION_LABEL,
} from '@/lib/uiText'
import {
  checkTitleCallSchema,
  clipIdFromAudioClip,
  extractTitleCalls,
  resolveVoiceAssetUrl,
} from '@/lib/voiceData'

const deterministicRandom = () => 0

{
  const shuffled = shuffleArray([1, 2, 3, 4], deterministicRandom)
  assert.deepEqual(shuffled, [2, 3, 4, 1])
}

{
  const choices = buildChoices(
    'correct',
    ['correct', 'choice1', 'choice2', 'choice3', 'choice4'],
    4,
    deterministicRandom,
  )
  assert.equal(choices.length, 4)
  assert.ok(choices.includes('correct'))
  assert.equal(new Set(choices).size, 4)
}

{
  assert.throws(
    () => buildChoices('correct', ['correct', 'choice1'], 4),
    /Not enough candidates/,
  )
}

{
  const candidates = [
    { name: 'A', costume: '', isCollaboration: false },
    { name: 'A(衣装)', costume: '衣装', isCollaboration: false },
    { name: 'B', costume: '', isCollaboration: true },
  ]
  assert.deepEqual(
    filterCandidates(candidates, {
      includeNormal: true,
      includeCostume: false,
      includeCollaboration: false,
    }).map(({ name }) => name),
    ['A'],
  )
  assert.deepEqual(
    filterCandidates(candidates, {
      includeNormal: false,
      includeCostume: true,
      includeCollaboration: true,
    }).map(({ name }) => name),
    ['A(衣装)', 'B'],
  )
}

{
  const normalized = normalizeProficiencyMap({
    A: { correct: 2, attempts: 3 },
    B: { correct: -1, attempts: 1 },
    C: { correct: 'x', attempts: 1 },
  })
  assert.deepEqual(normalized, {
    A: { correct: 2, attempts: 3 },
    B: { correct: 0, attempts: 1 },
  })
}

{
  const migrated = migrateLegacyProficiency({
    A: 4,
    B: 0,
    C: 'invalid',
  })
  assert.deepEqual(migrated, {
    A: { correct: 4, attempts: 4 },
    B: { correct: 0, attempts: 0 },
  })
}

{
  const merged = mergeWithStudents({ A: { correct: 2, attempts: 3 } }, [
    'A',
    'B',
    'C',
  ])
  assert.deepEqual(merged.B, { correct: 0, attempts: 0 })
  assert.deepEqual(merged.C, { correct: 0, attempts: 0 })
}

{
  assert.equal(calculateAccuracy({ correct: 3, attempts: 4 }), 75)
  assert.equal(calculateAccuracy({ correct: 0, attempts: 0 }), 0)
}

{
  assert.equal(normalizeQuizAnswer('  ｱｲﾘ  '), 'アイリ')
  assert.equal(normalizeQuizAnswer('Ａ b　c'), 'abc')
}

{
  const suggestions = buildNameInputSuggestions(
    ['アリス', 'イオリ', 'アル', 'アスナ'],
    ['アリス', 'アル', 'アスナ'],
    'ア',
    3,
  )
  assert.deepEqual(suggestions, ['アスナ', 'アリス', 'アル'])
  assert.deepEqual(buildNameInputSuggestions(['アリス'], ['アリス'], '   '), [])
  assert.deepEqual(
    buildNameInputSuggestions(
      ['アリス', 'アスナ'],
      ['アリス', 'アスナ'],
      'あす',
    ),
    ['アスナ'],
  )
  assert.deepEqual(
    buildNameInputSuggestions(['キサキ', 'サキ'], ['キサキ', 'サキ'], 'サキ'),
    ['サキ', 'キサキ'],
  )
  assert.equal(normalizeKanaForSearch(normalizeQuizAnswer('さき')), 'サキ')
  assert.equal(isTransientNameInputQuery('あｒ'), true)
  assert.equal(isTransientNameInputQuery('アル'), false)
  assert.equal(isTransientNameInputQuery('ar'), false)
  assert.equal(isTransientNameInputQuery('  あＲ  '), true)
  assert.equal(normalizeNameInputForSearch('あｋ'), 'ア')
  assert.deepEqual(buildNameInputSuggestions(['ア'], ['ア'], 'あｋ'), ['ア'])
}

{
  assert.equal(resolveStudentCategory('', false), 'normal')
  assert.equal(resolveStudentCategory('イベント衣装', false), 'costume')
  assert.equal(resolveStudentCategory('', true), 'collaboration')
}

{
  assert.equal(resolveQuestionCount(1, 30), 1)
  assert.equal(resolveQuestionCount(20, 10), 10)
  assert.equal(resolveQuestionCount(0, 5), 5)
  assert.equal(resolveQuestionCount(Number.NaN, 8), 8)
}

{
  assert.equal(resolveMultipleChoiceMaxQuestions(120), 30)
  assert.equal(resolveMultipleChoiceMaxQuestions(4), 1)
  assert.equal(resolveMultipleChoiceMaxQuestions(3), 0)
  assert.equal(resolveMultipleChoiceMaxQuestions(0), 0)
  assert.equal(resolveMultipleChoiceMaxQuestions(10, 5), 2)
  assert.equal(resolveMultipleChoiceMaxQuestions(11, 4), 2)
}

{
  const summary = summarizeQuizResults([
    { isCorrect: true },
    { isCorrect: false },
    { isCorrect: true },
  ])
  assert.deepEqual(summary, {
    totalCount: 3,
    correctCount: 2,
    wrongCount: 1,
    accuracy: 66.7,
    isPerfect: false,
  })
}

{
  const perfect = summarizeQuizResults([
    { isCorrect: true },
    { isCorrect: true },
  ])
  assert.equal(perfect.isPerfect, true)
  assert.equal(perfect.accuracy, 100)
}

{
  assert.equal(SORT_DIRECTION_LABEL.asc, '昇順')
  assert.equal(SORT_DIRECTION_LABEL.desc, '降順')
  assert.equal(QUIZ_UI_TEXT.next, '次へ')
  assert.equal(QUIZ_UI_TEXT.start, '開始')
  assert.equal(formatQuizQuestionStatus(3), '第3問: このタイトルコールは誰？')
  assert.equal(formatQuizFinishedStatus(8, 10), '終了！8 / 10 問正解')
  assert.equal(formatAnswerResultStatus(true, 'アリス'), '正解！')
  assert.equal(
    formatAnswerResultStatus(false, 'アリス'),
    '不正解… 正解は「アリス」',
  )
  assert.equal(
    formatResultSummary(7, 10, 3, 70),
    '正解: 7 / 10 ・不正解: 3 ・正答率: 70%',
  )
  assert.equal(formatResultEntryStatus(2, true), '第2問 正解')
  assert.equal(formatResultEntryStatus(2, false), '第2問 不正解')
  assert.equal(formatResultEntryCorrectAnswer('ヒナ'), '正答: ヒナ')
  assert.equal(formatResultEntryUserAnswer('ホシノ'), '回答: ホシノ')
  assert.equal(formatResultEntryUserAnswer(''), '回答: （未回答）')
  assert.equal(formatClipBadge(0, 1, undefined), '')
  assert.equal(formatClipBadge(0, 2, undefined), '1/2')
  assert.equal(formatClipBadge(1, 2, '旧声優版'), '2/2 旧声優版')
  assert.equal(formatClipBadge(0, 1, '旧声優版'), '旧声優版')
}

// --- voice.json からのタイトルコール抽出 ---
{
  const voiceFixture = {
    // 旧命名(名前ベース)
    '10005': {
      Normal: [
        { Group: 'UITitleIdle1', AudioClip: 'jp_hoshino/hoshino_title.mp3' },
      ],
    },
    // 数字命名
    '10025': {
      Normal: [
        { Group: 'UITitleIdle1', AudioClip: 'jp_ch0066/ch0066_title.mp3' },
      ],
    },
    // 2画像1音声(ホシノ（臨戦）のうち音声を持つ側)
    '10098': {
      Normal: [
        { Group: 'UITitleIdle1', AudioClip: 'jp_ch0258/ch0258_title.mp3' },
      ],
    },
    // 同名のもう一方はタイトルコールを持たない
    '10099': { Normal: [{ Group: 'CafeIdle1', AudioClip: 'jp_ch0258/x.mp3' }] },
    // 2画像2音声(シュン（水着）。カテゴリ横断でも拾えること)
    '10143': {
      Normal: [
        { Group: 'UITitleIdle1', AudioClip: 'jp_ch0355/ch0355_title.mp3' },
      ],
      Event: [
        { Group: 'UITitleIdle1', AudioClip: 'jp_ch0355/np0288_title.mp3' },
      ],
    },
    // SchaleDB の掲載漏れ(初音ミク)
    '20007': { Normal: [] },
  }

  const titleCalls = extractTitleCalls(voiceFixture)
  assert.deepEqual(titleCalls.get(10005), ['jp_hoshino/hoshino_title.mp3'])
  assert.deepEqual(titleCalls.get(10025), ['jp_ch0066/ch0066_title.mp3'])
  assert.deepEqual(titleCalls.get(10098), ['jp_ch0258/ch0258_title.mp3'])
  assert.deepEqual(titleCalls.get(10099) ?? [], [])
  assert.deepEqual(titleCalls.get(10143), [
    'jp_ch0355/ch0355_title.mp3',
    'jp_ch0355/np0288_title.mp3',
  ])
  assert.deepEqual(titleCalls.get(20007) ?? [], [])

  // 同じ AudioClip が重複していても 1 本に畳む
  assert.deepEqual(
    extractTitleCalls({
      '1': {
        Normal: [
          { Group: 'UITitleIdle1', AudioClip: 'a/b_title.mp3' },
          { Group: 'UITitleIdle1', AudioClip: 'a/b_title.mp3' },
        ],
      },
    }).get(1),
    ['a/b_title.mp3'],
  )

  // 異常系で例外を投げないこと
  assert.equal(extractTitleCalls(null).size, 0)
  assert.equal(extractTitleCalls('nope').size, 0)
  assert.equal(extractTitleCalls({ '1': null }).size, 0)
  assert.equal(extractTitleCalls({ '1': { Normal: 'not-an-array' } }).size, 0)
  assert.equal(
    extractTitleCalls({ '1': { Normal: [{ Group: 'UITitleIdle1' }] } }).size,
    0,
  )
}

{
  assert.equal(
    clipIdFromAudioClip('jp_ch0355/np0288_title.mp3'),
    'np0288_title',
  )
  assert.equal(clipIdFromAudioClip('jp_aru/aru_title.mp3'), 'aru_title')
  assert.equal(clipIdFromAudioClip('jp_aru/aru_title.wav'), null)
  assert.equal(clipIdFromAudioClip('jp_aru/日本語.mp3'), null)
  assert.equal(
    resolveVoiceAssetUrl('jp_aru/aru_title.mp3'),
    'https://r2.schaledb.com/voice/jp_aru/aru_title.mp3',
  )
}

{
  const ok = checkTitleCallSchema({
    studentIds: [1, 2, 3, 4],
    voiceIds: [1, 2, 3, 4],
    titleCalls: new Map([
      [1, ['a/a_title.mp3']],
      [2, ['b/b_title.mp3']],
      [3, ['c/c_title.mp3']],
      [4, ['d/d_title.mp3']],
    ]),
  })
  assert.deepEqual(ok, [])

  // Group 名が変わってカバー率が落ちたケース
  const lowCoverage = checkTitleCallSchema({
    studentIds: [1, 2, 3, 4],
    voiceIds: [1, 2, 3, 4],
    titleCalls: new Map([[1, ['a/a_title.mp3']]]),
  })
  assert.equal(lowCoverage.length, 1)
  assert.match(lowCoverage[0], /取得率/)

  // 拡張子が想定外
  const badExtension = checkTitleCallSchema({
    studentIds: [1],
    voiceIds: [1],
    titleCalls: new Map([[1, ['a/a_title.ogg']]]),
  })
  assert.ok(badExtension.some((problem) => /\.mp3/.test(problem)))

  assert.equal(
    checkTitleCallSchema({
      studentIds: [],
      voiceIds: [],
      titleCalls: new Map(),
    }).length,
    1,
  )
}

// --- アセットキー規約 ---
{
  assert.deepEqual(parseAudioKey('audio/10143/np0288_title.g1.mp3'), {
    studentId: 10143,
    clipId: 'np0288_title',
    generation: 1,
  })
  assert.deepEqual(parseAudioKey('audio/10017/cherino_title.g12.mp3'), {
    studentId: 10017,
    clipId: 'cherino_title',
    generation: 12,
  })
  // 旧レイアウトや規約外は受け付けない
  assert.equal(parseAudioKey('audio/初音ミク.mp3'), null)
  assert.equal(parseAudioKey('audio/10143/bad.mp3'), null)
  assert.equal(parseAudioKey('audio/10143/x.g0.mp3'), null)
  assert.equal(parseAudioKey('audio/10143/x.g01.mp3'), null)
  assert.equal(parseAudioKey('image/10143.webp'), null)

  const parts = { studentId: 10143, clipId: 'ch0355_title', generation: 3 }
  assert.equal(formatAudioKey(parts), 'audio/10143/ch0355_title.g3.mp3')
  assert.deepEqual(parseAudioKey(formatAudioKey(parts)), parts)
  assert.throws(() => formatAudioKey({ ...parts, clipId: '日本語' }))
  assert.throws(() => formatAudioKey({ ...parts, generation: 0 }))

  assert.equal(formatImageKey(10143), 'image/10143.webp')
  assert.equal(parseImageKey('image/10143.webp'), 10143)
  assert.equal(parseImageKey('image/x.webp'), null)
  assert.equal(formatClipRef(parts), '10143/ch0355_title.g3')
  assert.equal(isValidClipId('ch0355_title'), true)
  assert.equal(isValidClipId('ch0355.title'), false)
}

// --- クリップの選択と並び ---
{
  const clip = (
    clipId: string,
    generation: number,
    label?: string,
  ): TitleCallClip => ({
    clipId,
    generation,
    file: `audio/1/${clipId}.g${generation}.mp3`,
    ownerId: 1,
    source: 'schaledb',
    ...(label ? { label } : {}),
  })

  const cherino = [
    clip('cherino_title', 1, '旧声優版'),
    clip('cherino_title', 2),
  ]
  assert.deepEqual(
    selectPlayableClips(cherino, false).map((c) => c.generation),
    [2],
  )
  assert.deepEqual(
    selectPlayableClips(cherino, true).map((c) => c.generation),
    [1, 2],
  )
  // カード一覧は最新世代が先頭
  assert.deepEqual(
    orderClipsForBrowsing(cherino).map((c) => c.generation),
    [2, 1],
  )
  assert.equal(hasMultipleGenerations(cherino), true)

  // バリアント(clipId 違い)は既定でも両方残る
  const shun = [clip('ch0355_title', 1), clip('np0288_title', 1)]
  assert.equal(selectPlayableClips(shun, false).length, 2)
  assert.equal(hasMultipleGenerations(shun), false)
  assert.deepEqual(
    sortTitleCallClips([
      clip('b_title', 1),
      clip('a_title', 2),
      clip('a_title', 1),
    ]).map((c) => `${c.clipId}.g${c.generation}`),
    ['a_title.g1', 'a_title.g2', 'b_title.g1'],
  )

  assert.deepEqual(selectPlayableClips([], false), [])
  assert.equal(pickRandomClip([]), null)
  assert.equal(pickRandomClip(shun, () => 0)?.clipId, 'ch0355_title')
  assert.equal(pickRandomClip(shun, () => 0.99)?.clipId, 'np0288_title')
  // random が 1 を返しても範囲外にならない
  assert.notEqual(
    pickRandomClip(shun, () => 1),
    null,
  )
}

// --- QuizEntry の組み立て ---
{
  const makeStudent = (
    overrides: Pick<Student, 'Id' | 'Name'> & Partial<Student>,
  ): Student => ({
    DefaultOrder: 0,
    PathName: '',
    DevName: '',
    StarGrade: 3,
    FamilyName: '',
    FamilyNameRuby: '',
    PersonalName: '',
    PersonalNameRuby: '',
    CharacterVoice: '',
    School: '',
    SchoolYear: '',
    CharacterAge: '',
    Birthday: '',
    BirthDay: '',
    CharHeightMetric: '',
    ...overrides,
  })

  const students: Student[] = [
    makeStudent({
      Id: 10005,
      Name: 'ホシノ',
      DefaultOrder: 5,
      DevName: 'Hoshino',
      CharacterVoice: '花守ゆみり',
    }),
    makeStudent({
      Id: 10017,
      Name: 'チェリノ',
      DefaultOrder: 51,
      DevName: 'Cherino',
    }),
    // 同名 2 レコード(2画像1音声)
    makeStudent({
      Id: 10098,
      Name: 'ホシノ（臨戦）',
      DefaultOrder: 188,
      DevName: 'CH0258_02',
    }),
    makeStudent({
      Id: 10099,
      Name: 'ホシノ（臨戦）',
      DefaultOrder: 189,
      DevName: 'CH0258_01',
    }),
    // 同名 2 レコード(2画像2音声)
    makeStudent({
      Id: 10143,
      Name: 'シュン（水着）',
      DefaultOrder: 264,
      DevName: 'CH0355_01',
    }),
    makeStudent({
      Id: 10144,
      Name: 'シュン（水着）',
      DefaultOrder: 265,
      DevName: 'CH0355_02',
    }),
    // コラボ かつ SchaleDB 掲載漏れ
    makeStudent({
      Id: 20007,
      Name: '初音ミク',
      DefaultOrder: 73,
      DevName: 'CH9999',
    }),
  ]

  const audioKeys = [
    { studentId: 10005, clipId: 'hoshino_title', generation: 1 },
    { studentId: 10017, clipId: 'cherino_title', generation: 1 },
    { studentId: 10017, clipId: 'cherino_title', generation: 2 },
    { studentId: 10098, clipId: 'ch0258_title', generation: 1 },
    { studentId: 10143, clipId: 'ch0355_title', generation: 1 },
    { studentId: 10143, clipId: 'np0288_title', generation: 1 },
    // R2 にだけ存在(手動で置いた初音ミク)
    { studentId: 20007, clipId: 'miku_title', generation: 1 },
    // students.json に無い Id(孤児)
    { studentId: 99999, clipId: 'ghost_title', generation: 1 },
  ]

  const titleCalls = new Map<number, string[]>([
    [10005, ['jp_hoshino/hoshino_title.mp3']],
    [10017, ['jp_cherino/cherino_title.mp3']],
    [10098, ['jp_ch0258/ch0258_title.mp3']],
    [10143, ['jp_ch0355/ch0355_title.mp3', 'jp_ch0355/np0288_title.mp3']],
  ])

  const { entries, orphanAudioKeys } = buildQuizEntries({
    students,
    audioKeys,
    titleCalls,
    labels: { '10017/cherino_title.g1': '旧声優版' },
  })

  const byName = new Map(entries.map((entry) => [entry.Name, entry]))
  assert.equal(entries.length, 5, '同名レコードは 1 エントリへ統合される')

  const rinsen = byName.get('ホシノ（臨戦）')!
  assert.deepEqual(rinsen.MemberIds, [10098, 10099])
  assert.deepEqual(rinsen.ImageIds, [10098, 10099])
  assert.equal(rinsen.PrimaryId, 10098, '音声を持つ側が代表になる')
  assert.equal(rinsen.TitleCalls.length, 1)
  assert.equal(rinsen.DefaultOrder, 188)
  assert.equal(rinsen.Costume, '臨戦')

  const shunSwimsuit = byName.get('シュン（水着）')!
  assert.deepEqual(shunSwimsuit.MemberIds, [10143, 10144])
  assert.equal(shunSwimsuit.TitleCalls.length, 2, '2 音声とも残る')
  assert.deepEqual(
    shunSwimsuit.TitleCalls.map((clip) => clip.file),
    ['audio/10143/ch0355_title.g1.mp3', 'audio/10143/np0288_title.g1.mp3'],
  )

  const cherino = byName.get('チェリノ')!
  assert.equal(cherino.TitleCalls.length, 2)
  assert.equal(cherino.TitleCalls[0].label, '旧声優版')
  assert.equal(cherino.TitleCalls[1].label, undefined)
  assert.deepEqual(
    selectPlayableClips(cherino.TitleCalls, false).map((c) => c.generation),
    [2],
    '既定は最新世代のみ',
  )
  assert.deepEqual(
    selectPlayableClips(cherino.TitleCalls, true).map((c) => c.generation),
    [1, 2],
  )

  const miku = byName.get('初音ミク')!
  assert.equal(
    miku.TitleCalls.length,
    1,
    'voice.json に無くても R2 にあれば出題できる',
  )
  assert.equal(miku.TitleCalls[0].source, 'r2-only')
  assert.equal(miku.IsCollaboration, true)
  assert.equal(byName.get('ホシノ')!.TitleCalls[0].source, 'schaledb')

  assert.deepEqual(
    orphanAudioKeys.map((key) => key.studentId),
    [99999],
  )

  // 実装順・名前順
  assert.deepEqual(
    entries.map((entry) => entry.Name),
    ['ホシノ', 'チェリノ', '初音ミク', 'ホシノ（臨戦）', 'シュン（水着）'],
  )
  const nameOrder = [...entries]
    .sort((a, b) => a.NameSortOrder - b.NameSortOrder)
    .map((entry) => entry.Name)
  assert.deepEqual(nameOrder, [
    'シュン（水着）',
    'チェリノ',
    'ホシノ',
    'ホシノ（臨戦）',
    '初音ミク',
  ])

  // 同一 clipId + 世代が複数メンバーに重複していても 1 本に畳む
  const deduped = buildQuizEntries({
    students,
    audioKeys: [
      { studentId: 10143, clipId: 'ch0355_title', generation: 1 },
      { studentId: 10144, clipId: 'ch0355_title', generation: 1 },
    ],
    titleCalls,
  })
  assert.equal(
    deduped.entries.find((entry) => entry.Name === 'シュン（水着）')!.TitleCalls
      .length,
    1,
  )

  // 音声が 1 本も無いエントリも生成される(カード一覧には出る)
  const withoutAudio = buildQuizEntries({
    students,
    audioKeys: [],
    titleCalls: new Map(),
  })
  assert.equal(withoutAudio.entries.length, 5)
  assert.ok(
    withoutAudio.entries.every((entry) => entry.TitleCalls.length === 0),
  )

  const csv = quizEntriesToCsv(entries)
  assert.ok(csv.startsWith('﻿'))
  assert.ok(csv.includes('ホシノ（臨戦）'))
}

{
  assert.equal(extractCostume('シュン（水着）'), '水着')
  assert.equal(extractCostume('ホシノ'), '')
  assert.equal(stripCostume('シュン（水着）'), 'シュン')
  assert.equal(isCollaborationDevName('CH9999'), true)
  assert.equal(isCollaborationDevName('CH0355_01'), false)
  assert.equal(isCollaborationDevName(undefined), false)

  const records = extractStudentRecords({
    a: { Id: 1, Name: 'A', DefaultOrder: 1 },
    b: { Id: 2, Name: '', DefaultOrder: 2 },
    c: { Name: 'C', DefaultOrder: 3 },
    d: null,
  })
  assert.deepEqual(
    records.map((record) => record.Name),
    ['A'],
  )
  assert.deepEqual(extractStudentRecords(null), [])
  assert.equal(extractStudentRecords([{ Id: 5, Name: 'E' }]).length, 1)
}

// --- 音声マニフェスト(録り直し検知) ---
{
  const now = '2026-08-16T00:00:00.000Z'
  const manifest = normalizeAudioManifest(
    {
      version: 1,
      updatedAt: now,
      clips: {
        '10017/cherino_title': {
          generation: 1,
          sourceUrl: 'https://example.test/a.mp3',
          etag: '"abc"',
          size: 100,
          checkedAt: now,
        },
        'broken/entry': { generation: 0 },
      },
    },
    now,
  )
  assert.equal(Object.keys(manifest.clips).length, 1)

  const previous = manifest.clips['10017/cherino_title']
  assert.equal(hasSourceChanged(previous, { etag: '"abc"', size: 100 }), false)
  assert.equal(hasSourceChanged(previous, { etag: '"zzz"', size: 100 }), true)
  // ETag が片方に無ければサイズで判断
  assert.equal(
    hasSourceChanged({ ...previous, etag: null }, { etag: null, size: 200 }),
    true,
  )
  assert.equal(
    hasSourceChanged({ ...previous, etag: null }, { etag: null, size: 100 }),
    false,
  )
  // 判断材料が無いときは変化なし扱い(誤検知で世代を増やさない)
  assert.equal(
    hasSourceChanged(
      { ...previous, etag: null, size: null },
      { etag: null, size: null },
    ),
    false,
  )
  assert.equal(hasSourceChanged(undefined, { etag: '"abc"', size: 100 }), false)
  assert.equal(normalizeAudioManifest(null, now).clips['x'], undefined)
}

// --- 取得エラーの分類(音源未公開と本物の失敗を区別する) ---
{
  const notFound = new HttpStatusError(404, 'https://example.test/a.mp3')
  assert.equal(isNotFoundError(notFound), true)
  assert.equal(notFound.status, 404)
  assert.match(notFound.message, /404/)
  // 実装直後の生徒は voice.json に載っていても音源が 404 になる。
  // これは日常的な状態なので、ビルドを失敗させる「失敗」には数えない。
  assert.equal(isNotFoundError(new HttpStatusError(500, 'x')), false)
  assert.equal(isNotFoundError(new HttpStatusError(403, 'x')), false)
  assert.equal(isNotFoundError(new Error('boom')), false)
  assert.equal(isNotFoundError(null), false)
}

// --- 進捗のエクスポート / インポート ---
{
  const proficiency = {
    アリス: { correct: 3, attempts: 4 },
    ホシノ: { correct: 0, attempts: 0 },
  }
  const exported = buildProgressExport(proficiency, '2026-08-16T00:00:00.000Z')
  assert.equal(exported.formatVersion, 1)
  const roundTripped = parseProgressExport(serializeProgressExport(exported))
  assert.deepEqual(roundTripped, proficiency)

  // 素の習熟度マップも受け付ける
  assert.deepEqual(
    parseProgressExport(JSON.stringify(proficiency)),
    proficiency,
  )
  // 壊れた入力は無害化する
  assert.equal(parseProgressExport('not json'), null)
  assert.equal(parseProgressExport(''), null)
  assert.deepEqual(parseProgressExport('[1,2,3]'), {})
  assert.deepEqual(
    parseProgressExport('{"A":{"correct":"x","attempts":1}}'),
    {},
  )
  assert.equal(countProficiencyRecords(proficiency), 1)
  assert.equal(countProficiencyRecords({}), 0)
}

{
  // Last Write Wins。判断できない時刻はローカル優先で上書きしない。
  assert.equal(
    pickNewerSide('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'),
    'remote',
  )
  assert.equal(
    pickNewerSide('2026-03-01T00:00:00Z', '2026-02-01T00:00:00Z'),
    'local',
  )
  assert.equal(pickNewerSide(null, '2026-02-01T00:00:00Z'), 'remote')
  assert.equal(pickNewerSide('2026-02-01T00:00:00Z', null), 'local')
  assert.equal(pickNewerSide('2026-02-01T00:00:00Z', 'broken'), 'local')
  assert.equal(pickNewerSide(null, null), 'local')
}

{
  assert.equal(isValidSyncCode('3f0c1a2b-4d5e-4f60-8a9b-0c1d2e3f4a5b'), true)
  assert.equal(
    isValidSyncCode('  3F0C1A2B-4D5E-4F60-8A9B-0C1D2E3F4A5B  '),
    true,
  )
  assert.equal(isValidSyncCode('not-a-uuid'), false)
  assert.equal(isValidSyncCode(''), false)

  const payload = parseSyncPayload({
    updatedAt: '2026-08-16T00:00:00.000Z',
    proficiency: { A: { correct: 1, attempts: 2 } },
  })
  assert.deepEqual(payload?.proficiency, { A: { correct: 1, attempts: 2 } })
  // シートの生値が文字列で返る形にも対応する
  const wrapped = parseSyncPayload({
    json: JSON.stringify({
      updatedAt: '2026-08-16T00:00:00.000Z',
      proficiency: { A: { correct: 1, attempts: 2 } },
    }),
  })
  assert.equal(wrapped?.updatedAt, '2026-08-16T00:00:00.000Z')
  assert.equal(parseSyncPayload(null), null)
  assert.equal(parseSyncPayload({}), null)
  assert.equal(parseSyncPayload({ json: 'broken' }), null)
}

console.log('All quiz tests passed.')
