import {
  type AudioKeyParts,
  formatAudioKey,
  formatClipRef,
} from '@/lib/assetKeys'
import type {
  AudioClipMetaMap,
  QuizEntry,
  Student,
  TitleCallClip,
} from '@/lib/interfaces'
import { sortTitleCallClips } from '@/lib/titleCallClips'
import { clipIdFromAudioClip } from '@/lib/voiceData'

/**
 * SchaleDB の生データを、出題単位(表示名)のエントリへ整形する純関数群。
 * ファイル I/O は行わない(呼び出し側が tmp/ や public/data/ へ書き出す)。
 */

const STUDENT_FIELDS = [
  'DefaultOrder',
  'Id',
  'Name',
  'PathName',
  'DevName',
  'StarGrade',
  'FamilyName',
  'FamilyNameRuby',
  'PersonalName',
  'PersonalNameRuby',
  'CharacterVoice',
  'School',
  'SchoolYear',
  'CharacterAge',
  'Birthday',
  'BirthDay',
  'CharHeightMetric',
] as const

const COSTUME_PATTERN = /（[^）]+）/
const COLLABORATION_DEV_NAME_PATTERN = /^CH9\d{3}/

/** students.json(Id キーのオブジェクト、または配列)から必要なフィールドだけ取り出す。 */
export function extractStudentRecords(raw: unknown): Student[] {
  if (!raw || typeof raw !== 'object') {
    return []
  }
  const records = Array.isArray(raw)
    ? raw
    : Object.values(raw as Record<string, unknown>)

  const result: Student[] = []
  for (const record of records) {
    if (!record || typeof record !== 'object') {
      continue
    }
    const source = record as Record<string, unknown>
    if (typeof source.Name !== 'string' || source.Name.length === 0) {
      continue
    }
    if (!Number.isInteger(source.Id)) {
      continue
    }
    const student = {} as Record<string, unknown>
    for (const field of STUDENT_FIELDS) {
      student[field] = source[field]
    }
    result.push(student as unknown as Student)
  }
  return result
}

export function extractCostume(name: string): string {
  const match = COSTUME_PATTERN.exec(name)
  return match ? match[0].slice(1, -1) : ''
}

export function stripCostume(name: string): string {
  return name.replace(/（[^）]+）/g, '').trim()
}

export function isCollaborationDevName(devName: unknown): boolean {
  return (
    typeof devName === 'string' && COLLABORATION_DEV_NAME_PATTERN.test(devName)
  )
}

export interface BuildQuizEntriesParams {
  students: readonly Student[]
  /** R2 に実在する音声キー。これが配信される音声の正本。 */
  audioKeys: readonly AudioKeyParts[]
  /** voice.json 由来の AudioClip パス。source 判定にのみ使う。 */
  titleCalls: ReadonlyMap<number, readonly string[]>
  /**
   * クリップの表示名・声優名(meta/audio-labels.json 由来)。
   * キーは formatClipRef の形式(`{clipId}.g{世代}`)。文字列はラベルのみの省略記法。
   */
  labels?: Readonly<AudioClipMetaMap>
}

export interface BuildQuizEntriesResult {
  entries: QuizEntry[]
  /** students.json に Id が存在しない音声キー(警告対象)。 */
  orphanAudioKeys: AudioKeyParts[]
}

/**
 * 表示名でグループ化して QuizEntry を組み立てる。
 *
 * ホシノ（臨戦）やシュン（水着）のように students.json 上で同名 2 レコードになる生徒は
 * 1 エントリへ統合し、音声はメンバー全員分の和集合、画像は全メンバー分を保持する。
 */
export function buildQuizEntries({
  students,
  audioKeys,
  titleCalls,
  labels = {},
}: BuildQuizEntriesParams): BuildQuizEntriesResult {
  const knownIds = new Set<number>()
  for (const student of students) {
    knownIds.add(student.Id)
  }

  const audioByStudent = new Map<number, AudioKeyParts[]>()
  const orphanAudioKeys: AudioKeyParts[] = []
  for (const key of audioKeys) {
    if (!knownIds.has(key.studentId)) {
      orphanAudioKeys.push(key)
      continue
    }
    const list = audioByStudent.get(key.studentId)
    if (list) {
      list.push(key)
    } else {
      audioByStudent.set(key.studentId, [key])
    }
  }

  // clipId は SchaleDB 全体で一意なので、掲載有無の判定はグローバルに行う。
  // これにより voice.json の掲載メンバーと R2 上のフォルダ(実際の帰属)が
  // 異なっていても 'schaledb' と正しく判定される(シュン（水着）の np0288 など)。
  const schaledbClipIds = new Set<string>()
  for (const clips of titleCalls.values()) {
    for (const audioClip of clips) {
      const clipId = clipIdFromAudioClip(audioClip)
      if (clipId) {
        schaledbClipIds.add(clipId)
      }
    }
  }

  const groups = new Map<string, Student[]>()
  for (const student of students) {
    const members = groups.get(student.Name)
    if (members) {
      members.push(student)
    } else {
      groups.set(student.Name, [student])
    }
  }

  const entries: QuizEntry[] = []
  for (const [name, members] of groups) {
    const sortedMembers = [...members].sort(
      (a, b) => (a.DefaultOrder ?? 0) - (b.DefaultOrder ?? 0),
    )

    const clips: TitleCallClip[] = []
    const seenClips = new Set<string>()
    for (const member of sortedMembers) {
      for (const key of audioByStudent.get(member.Id) ?? []) {
        // 同一 clipId + 世代が複数メンバーの下に置かれていても 1 つに畳む。
        const dedupeKey = formatClipRef(key.clipId, key.generation)
        if (seenClips.has(dedupeKey)) {
          continue
        }
        seenClips.add(dedupeKey)
        const meta = labels[dedupeKey]
        const label = typeof meta === 'string' ? meta : meta?.label
        const voiceActor =
          typeof meta === 'string' ? undefined : meta?.voiceActor
        clips.push({
          clipId: key.clipId,
          generation: key.generation,
          file: formatAudioKey(key),
          // R2 上の置き場所(フォルダの生徒 Id)がそのまま帰属の宣言。
          ownerId: key.studentId,
          source: schaledbClipIds.has(key.clipId) ? 'schaledb' : 'r2-only',
          ...(label ? { label } : {}),
          ...(voiceActor ? { voiceActor } : {}),
        })
      }
    }

    const primary =
      sortedMembers.find(
        (member) => (audioByStudent.get(member.Id)?.length ?? 0) > 0,
      ) ?? sortedMembers[0]

    entries.push({
      Name: name,
      MemberIds: sortedMembers.map((member) => member.Id),
      PrimaryId: primary.Id,
      TitleCalls: sortTitleCallClips(clips),
      ImageIds: sortedMembers.map((member) => member.Id),
      DefaultOrder: sortedMembers[0].DefaultOrder ?? 0,
      NameSortOrder: 0,
      CharacterVoice:
        typeof primary.CharacterVoice === 'string'
          ? primary.CharacterVoice
          : '',
      Costume: extractCostume(name),
      IsCollaboration: sortedMembers.some((member) =>
        isCollaborationDevName(member.DevName),
      ),
    })
  }

  entries.sort((a, b) => a.DefaultOrder - b.DefaultOrder)
  ;[...entries]
    .sort((a, b) => {
      const nameA = stripCostume(a.Name)
      const nameB = stripCostume(b.Name)
      if (nameA === nameB) {
        return a.DefaultOrder - b.DefaultOrder
      }
      return nameA.localeCompare(nameB, 'ja')
    })
    .forEach((entry, index) => {
      entry.NameSortOrder = index + 1
    })

  return { entries, orphanAudioKeys }
}

const escapeCsvValue = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

/** 目視確認用の CSV。tmp/ にのみ書き出す。 */
export function quizEntriesToCsv(entries: readonly QuizEntry[]): string {
  const headers = [
    'Name',
    'PrimaryId',
    'MemberIds',
    'DefaultOrder',
    'NameSortOrder',
    'CharacterVoice',
    'Costume',
    'IsCollaboration',
    'TitleCallCount',
    'TitleCallFiles',
  ]
  const rows = entries.map((entry) =>
    [
      entry.Name,
      String(entry.PrimaryId),
      entry.MemberIds.join('|'),
      String(entry.DefaultOrder),
      String(entry.NameSortOrder),
      entry.CharacterVoice,
      entry.Costume,
      String(entry.IsCollaboration),
      String(entry.TitleCalls.length),
      entry.TitleCalls.map((clip) => clip.file).join('|'),
    ]
      .map(escapeCsvValue)
      .join(','),
  )
  return `﻿${[headers.join(','), ...rows].join('\n')}`
}
