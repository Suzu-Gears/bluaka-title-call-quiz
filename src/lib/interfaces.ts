export type Students = Student[]

export interface Student {
  DefaultOrder: number
  Id: number
  Name: string
  PathName: string
  DevName: string
  StarGrade: number
  FamilyName: string
  FamilyNameRuby: string
  PersonalName: string
  PersonalNameRuby: string
  CharacterVoice: string
  School: string
  SchoolYear: string
  CharacterAge: string
  Birthday: string
  BirthDay: string
  CharHeightMetric: string
  Costume?: string
  NameSortOrder?: number
  IsCollaboration?: boolean
}

/**
 * クリップの出所。
 * - schaledb: voice.json に掲載されている
 * - r2-only : voice.json には無いが R2 に存在する(SchaleDB の掲載漏れ・手動追加分)
 */
export type TitleCallSource = 'schaledb' | 'r2-only'

export interface TitleCallClip {
  /** 拡張子と世代を除いたクリップ名。例: 'ch0355_title' */
  clipId: string
  /** 1始まりの世代番号。録り直しのたびに採番され、過去の世代は残る。 */
  generation: number
  /** 配信パス兼 R2 キー。例: 'audio/10143/ch0355_title.g1.mp3' */
  file: string
  /** このクリップが属する生徒 Id(同名グループ内のどのメンバーか) */
  ownerId: number
  source: TitleCallSource
  /** 任意の表示名。例: '旧声優版' */
  label?: string
}

/** 出題・カード表示の単位。表示名が同じ生徒レコードは 1 エントリに統合される。 */
export interface QuizEntry {
  Name: string
  MemberIds: number[]
  PrimaryId: number
  TitleCalls: TitleCallClip[]
  ImageIds: number[]
  DefaultOrder: number
  NameSortOrder: number
  CharacterVoice: string
  Costume: string
  IsCollaboration: boolean
}

export const FINAL_DATA_SCHEMA_VERSION = 2

export interface FinalData {
  schemaVersion: number
  builtAt: string
  entries: QuizEntry[]
}
