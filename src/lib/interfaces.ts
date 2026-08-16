export type Students = Student[]

export interface Student {
  DefaultOrder: number
  Id: number
  Name: string
  DevName: string
  CharacterVoice: string
  Costume?: string
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
  /**
   * このクリップを「どの形態(メンバー)の声か」として表示するかの生徒 Id。
   * 既定は R2 上のフォルダの Id。voice.json の帰属が実態と異なる場合
   * (シュン（水着）の np0288 はシュエリン側)は audioClipOverrides で付け替える。
   * カード一覧での所属カードと、答え合わせ・リザルトの画像がこの Id になる。
   */
  ownerId: number
  source: TitleCallSource
  /** 任意の表示名。例: '旧声優版' */
  label?: string
  /**
   * このクリップの声優名。未設定なら現行声優(entry.CharacterVoice)。
   * 旧声優版クリップで CV 表示を差し替えるために使う。
   */
  voiceActor?: string
}

/** meta/audio-labels.json の値。文字列はラベルのみの省略記法。 */
export type AudioClipMeta = { label?: string; voiceActor?: string }
export type AudioClipMetaMap = Record<string, string | AudioClipMeta>

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
