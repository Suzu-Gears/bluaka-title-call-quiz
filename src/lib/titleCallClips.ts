import type { TitleCallClip } from '@/lib/interfaces'

/**
 * クリップの並びは clipId 昇順 → 世代昇順で安定させる。
 * カード一覧の順送りとリザルトの再生順がビルドごとにぶれないようにするため。
 */
export function sortTitleCallClips(
  clips: readonly TitleCallClip[],
): TitleCallClip[] {
  return [...clips].sort((a, b) => {
    if (a.clipId !== b.clipId) {
      return a.clipId.localeCompare(b.clipId)
    }
    return a.generation - b.generation
  })
}

/**
 * 再生候補を絞り込む。
 *
 * バリアント(シュン（水着）の 2 種類のように clipId が異なるもの)は常に全部残す。
 * 世代(録り直し)は既定で最新のみ。includeOldGenerations で過去の世代も候補に含める。
 */
export function selectPlayableClips(
  clips: readonly TitleCallClip[],
  includeOldGenerations = false,
): TitleCallClip[] {
  if (clips.length === 0) {
    return []
  }
  if (includeOldGenerations) {
    return sortTitleCallClips(clips)
  }

  const latestByClipId = new Map<string, TitleCallClip>()
  for (const clip of clips) {
    const current = latestByClipId.get(clip.clipId)
    if (!current || clip.generation > current.generation) {
      latestByClipId.set(clip.clipId, clip)
    }
  }
  return sortTitleCallClips([...latestByClipId.values()])
}

/**
 * カード一覧で、あるメンバー(形態)のカードが再生するクリップ集合。
 * そのメンバーに帰属するクリップがあればそれを、無ければグループ共有として
 * 全クリップを返す(ホシノ（臨戦）の dealer 形態は共通音声を鳴らす)。
 */
export function clipsForMember(
  clips: readonly TitleCallClip[],
  memberId: number,
): TitleCallClip[] {
  const own = clips.filter((clip) => clip.ownerId === memberId)
  return own.length > 0 ? own : [...clips]
}

/**
 * カード一覧の順送り用の並び。最新世代を先に、過去の世代を後ろに置く。
 * 1 回目のタップが必ず現行版になるようにするため。
 */
export function orderClipsForBrowsing(
  clips: readonly TitleCallClip[],
): TitleCallClip[] {
  const latest = selectPlayableClips(clips, false)
  const latestFiles = new Set(latest.map((clip) => clip.file))
  const older = sortTitleCallClips(
    clips.filter((clip) => !latestFiles.has(clip.file)),
  )
  return [...latest, ...older]
}

export function pickRandomClip(
  clips: readonly TitleCallClip[],
  random: () => number = Math.random,
): TitleCallClip | null {
  if (clips.length === 0) {
    return null
  }
  const index = Math.floor(random() * clips.length)
  return clips[Math.min(Math.max(index, 0), clips.length - 1)] ?? null
}

/** 同じ clipId に複数世代があるか(カード一覧のバッジ表示要否の判定に使う)。 */
export function hasMultipleGenerations(
  clips: readonly TitleCallClip[],
): boolean {
  const seen = new Map<string, number>()
  for (const clip of clips) {
    const count = (seen.get(clip.clipId) ?? 0) + 1
    if (count > 1) {
      return true
    }
    seen.set(clip.clipId, count)
  }
  return false
}
