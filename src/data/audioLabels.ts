/**
 * タイトルコールの表示名。カード一覧とリザルトでのみ表示する
 * (出題中に表示すると答えのヒントになるため)。
 *
 * キーは `${生徒Id}/${clipId}.g${世代}`。
 * 世代を追加したあと、どちらが何なのかを人間が説明したいときに追記する。
 *
 * 例:
 *   '10017/cherino_title.g1': '旧声優版',
 *   '10017/cherino_title.g2': '現行版',
 */
export const AUDIO_CLIP_LABELS: Record<string, string> = {}
