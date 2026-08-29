import fitty, { type FittyInstance } from 'fitty'

import { formatImageKey } from '@/lib/assetKeys'
import { resolveAssetUrl } from '@/lib/assetPath'
import type { QuizEntry, TitleCallClip } from '@/lib/interfaces'
import {
  normalizeKanaForSearch,
  normalizeNameInputForSearch,
  normalizeQuizAnswer,
  resolveStudentCategory,
} from '@/lib/quizProgress'
import { clipsForMember, orderClipsForBrowsing } from '@/lib/titleCallClips'
import {
  loadCardListSettings,
  saveCardListSettings,
  type SortDirection,
} from '@/lib/uiSettings'
import { formatClipBadge, SORT_DIRECTION_LABEL } from '@/lib/uiText'

const DEFAULT_IMAGE = resolveAssetUrl('default-student-image.webp')

/** CV 帯のテキスト。前後の NBSP はマーカー幅の余白(fitty の計測対象)。 */
const formatVoiceActorText = (voiceActorName: string): string =>
  `  CV.${voiceActorName}  `

/** 選択中クリップに声優名があればそれを、無ければ現行声優を表示する。 */
const resolveVoiceActorName = (
  card: HTMLElement,
  clip: TitleCallClip | undefined,
): string => clip?.voiceActor ?? card.dataset.characterVoice ?? ''

/**
 * カードはメンバー(形態)ごとに 1 枚生成する(SchaleDB の一覧と同じ見え方)。
 * 名前は同名グループ共通。memberIndex は同名グループ内での表示順の維持に使う。
 */
export const createCard = (
  entry: QuizEntry,
  memberId: number,
  memberIndex: number,
  clips: readonly TitleCallClip[],
): HTMLElement => {
  const item = document.createElement('div')
  item.className = 'grid-item'
  item.tabIndex = 0
  item.dataset.name = entry.Name
  item.dataset.nameKey = normalizeQuizAnswer(entry.Name)
  item.dataset.filterCategory = resolveStudentCategory(
    entry.Costume,
    entry.IsCollaboration,
  )
  // 同名グループのカードが隣り合ったまま全体順を保てるよう、小数で枝番を振る。
  item.dataset.defaultOrder = String(entry.DefaultOrder + memberIndex / 10)
  item.dataset.nameSortOrder = String(entry.NameSortOrder + memberIndex / 10)
  item.dataset.hasAudio = String(clips.length > 0)
  item.dataset.clipIndex = '0'
  item.dataset.characterVoice = entry.CharacterVoice

  const imageContainer = document.createElement('div')
  imageContainer.className = 'image-container'
  const image = document.createElement('img')
  image.loading = 'lazy'
  // width/height 属性は付けないこと。CSS は width と aspect-ratio だけを
  // 指定していて height を持たないため、height 属性があるとそれが有効な
  // 高さになって aspect-ratio が効かなくなり、画像が .image-container の
  // 枠(padding-bottom: 110%)をはみ出して名前と下の行を覆ってしまう。
  // 表示領域は .image-container 側で確保済みなので寸法指定は不要。
  image.src = resolveAssetUrl(formatImageKey(memberId))
  image.alt = entry.Name
  image.onerror = () => {
    image.src = DEFAULT_IMAGE
  }

  // 複数バージョンあるカードだけ、バッジを切替ボタンにする。
  // タップでの再生とは分離し、能動的に切り替えてから聴く導線にする。
  const badgeText = formatClipBadge(0, clips.length, clips[0]?.label)
  let badge: HTMLElement
  if (clips.length > 1) {
    const switchButton = document.createElement('button')
    switchButton.type = 'button'
    switchButton.className = 'clip-badge clip-switch'
    switchButton.title = '音声バージョンを切り替え'
    switchButton.setAttribute('aria-label', '音声バージョンを切り替え')
    switchButton.textContent = badgeText
    badge = switchButton
  } else {
    badge = document.createElement('div')
    badge.className = 'clip-badge'
    badge.textContent = badgeText
    badge.hidden = badgeText.length === 0
  }

  const voiceActorContainer = document.createElement('div')
  voiceActorContainer.className = 'voice-actor-container'
  const voiceActor = document.createElement('div')
  voiceActor.className = 'voice-actor'
  voiceActor.textContent = formatVoiceActorText(
    clips[0]?.voiceActor ?? entry.CharacterVoice,
  )
  voiceActorContainer.appendChild(voiceActor)
  imageContainer.append(image, badge, voiceActorContainer)

  const nameContainer = document.createElement('div')
  nameContainer.className = 'name-container'
  const nameNode = document.createElement('div')
  nameNode.className = 'name'
  const baseNameLabel = entry.Name.includes('（')
    ? ` ${entry.Name}`
    : ` ${entry.Name} `
  // 黄色いマーカーは名前部分だけに敷きたいので、テキストと🔇は別の span に分ける。
  const nameText = document.createElement('span')
  nameText.className = 'name-text'
  nameText.textContent = baseNameLabel
  nameNode.appendChild(nameText)
  if (clips.length === 0) {
    const muteIndicator = document.createElement('span')
    muteIndicator.className = 'mute-indicator'
    muteIndicator.textContent = '🔇'
    muteIndicator.title = 'タイトルコール音声なし'
    nameNode.appendChild(muteIndicator)
  }
  nameContainer.appendChild(nameNode)

  item.append(imageContainer, nameContainer)
  return item
}

const setupFitty = (): FittyInstance[] => {
  const getFontSize = (selector: string): number => {
    const element = document.querySelector(selector)
    if (element) {
      const style = window.getComputedStyle(element)
      return parseFloat(style.fontSize)
    }
    return 16
  }
  const selectors = ['.name', '.voice-actor']
  return selectors.flatMap((selector) =>
    fitty(selector, {
      minSize: 8,
      maxSize: getFontSize(selector),
      multiLine: false,
    }),
  )
}

export const setupStudentGrid = (entries: readonly QuizEntry[]): void => {
  const grid = document.getElementById('studentGrid')
  if (!grid) return

  // カード一覧では旧世代も含めて全クリップを聴けるようにする(最新世代が先頭)。
  const clipsByCard = new WeakMap<HTMLElement, TitleCallClip[]>()

  ;[...entries]
    .sort((a, b) => a.DefaultOrder - b.DefaultOrder)
    .forEach((entry) => {
      entry.ImageIds.forEach((memberId, memberIndex) => {
        const clips = orderClipsForBrowsing(
          clipsForMember(entry.TitleCalls, memberId),
        )
        const card = createCard(entry, memberId, memberIndex, clips)
        clipsByCard.set(card, clips)
        grid.appendChild(card)
      })
    })

  const sortSelect = document.getElementById(
    'student-sort-select',
  ) as HTMLSelectElement | null
  const filterInput = document.getElementById(
    'student-filter-input',
  ) as HTMLInputElement | null
  const normalFilter = document.getElementById(
    'student-filter-normal',
  ) as HTMLInputElement | null
  const costumeFilter = document.getElementById(
    'student-filter-costume',
  ) as HTMLInputElement | null
  const collaborationFilter = document.getElementById(
    'student-filter-collaboration',
  ) as HTMLInputElement | null
  const sortDirectionButton = document.getElementById(
    'student-sort-direction',
  ) as HTMLButtonElement | null

  // 前回の表示設定(カテゴリ・並び替え・昇順降順)を復元する。名前フィルターは一時的な絞り込みなので保存しない。
  const savedSettings = loadCardListSettings()
  if (normalFilter && savedSettings.showNormal !== undefined) {
    normalFilter.checked = savedSettings.showNormal
  }
  if (costumeFilter && savedSettings.showCostume !== undefined) {
    costumeFilter.checked = savedSettings.showCostume
  }
  if (collaborationFilter && savedSettings.showCollaboration !== undefined) {
    collaborationFilter.checked = savedSettings.showCollaboration
  }
  if (
    sortSelect &&
    savedSettings.sortMode !== undefined &&
    [...sortSelect.options].some(
      (option) => option.value === savedSettings.sortMode,
    )
  ) {
    sortSelect.value = savedSettings.sortMode
  }

  // デフォルトは実装順の降順(新しい生徒が先頭に来る)。
  let sortDirection: SortDirection = savedSettings.sortDirection ?? 'desc'

  // 方向ボタンはゲームと同じ「3本線+矢印」アイコン。向きは data 属性で切り替え、
  // 文言はスクリーンリーダー向けに aria-label / title で持つ。
  const updateSortDirectionButton = () => {
    if (!sortDirectionButton) return
    const label = SORT_DIRECTION_LABEL[sortDirection]
    sortDirectionButton.dataset.direction = sortDirection
    sortDirectionButton.setAttribute('aria-label', label)
    sortDirectionButton.title = label
  }
  updateSortDirectionButton()

  const persistSettings = () => {
    saveCardListSettings({
      showNormal: Boolean(normalFilter?.checked),
      showCostume: Boolean(costumeFilter?.checked),
      showCollaboration: Boolean(collaborationFilter?.checked),
      sortMode: sortSelect?.value ?? 'default-order',
      sortDirection,
    })
  }

  const sortCards = (sortMode: string, direction: SortDirection) => {
    const cards = [...grid.querySelectorAll<HTMLElement>('.grid-item')]
    const key = sortMode === 'name-order' ? 'nameSortOrder' : 'defaultOrder'
    cards.sort((a, b) => {
      const aValue = Number(a.dataset[key] ?? 0)
      const bValue = Number(b.dataset[key] ?? 0)
      // SchaleDB 本家に合わせ、同名グループ内のフォーム順(小数部)も方向に従って反転する。
      return direction === 'asc' ? aValue - bValue : bValue - aValue
    })
    cards.forEach((card) => grid.appendChild(card))
  }

  const filterCards = (input: string) => {
    const normalized = normalizeNameInputForSearch(input)
    grid.querySelectorAll<HTMLElement>('.grid-item').forEach((card) => {
      const category = card.dataset.filterCategory
      const categoryEnabled =
        (category === 'normal' && Boolean(normalFilter?.checked)) ||
        (category === 'costume' && Boolean(costumeFilter?.checked)) ||
        (category === 'collaboration' && Boolean(collaborationFilter?.checked))
      const nameKey = normalizeKanaForSearch(String(card.dataset.nameKey ?? ''))
      card.style.display =
        (!normalized || nameKey.includes(normalized)) && categoryEnabled
          ? ''
          : 'none'
    })
  }

  let lastAppliedStudentFilter = filterInput?.value ?? ''

  /**
   * 名前検索中は昇順/降順に関わらず「名前順の昇順」で表示する
   * (検索結果の並びが方向設定で反転すると探しにくいため)。
   * 検索を消すと保存済みの並び設定に戻る。
   */
  const applySortForCurrentState = () => {
    const isSearching =
      normalizeNameInputForSearch(lastAppliedStudentFilter) !== ''
    if (isSearching) {
      sortCards('name-order', 'asc')
    } else if (sortSelect) {
      sortCards(sortSelect.value, sortDirection)
    }
  }

  const applyStudentFilterInput = (inputValue: string) => {
    lastAppliedStudentFilter = inputValue
    filterCards(inputValue)
    applySortForCurrentState()
  }

  // 虫眼鏡ボタンで検索欄の表示を切り替える(ゲームの一覧画面と同じ挙動)。
  // 閉じたときは絞り込みも解除する(見えない条件で絞られたままにしない)。
  const searchToggle = document.getElementById(
    'student-search-toggle',
  ) as HTMLButtonElement | null
  const searchBar = document.getElementById('student-search-bar')
  searchToggle?.addEventListener('click', () => {
    if (!searchBar) return
    const willShow = searchBar.hidden
    searchBar.hidden = !willShow
    searchToggle.classList.toggle('is-active', willShow)
    searchToggle.setAttribute('aria-expanded', String(willShow))
    // 吸着時の「カードが溶ける縁」を検索欄の下へ切り替えるためのフラグ
    document
      .getElementById('card-list')
      ?.classList.toggle('search-open', willShow)
    // フォーカスは自動で移さない(モバイルでいきなりキーボードが出るのを避ける)。
    if (!willShow) {
      if (filterInput) {
        filterInput.value = ''
      }
      applyStudentFilterInput('')
    }
  })

  // ヘッダー帯が画面上部に吸着している間だけ背景を塗る(静止時は枠の色を透かす)。
  const listHead = document.querySelector<HTMLElement>('.list-head')
  const listHeadSentinel = document.querySelector<HTMLElement>(
    '.list-head-sentinel',
  )
  if (listHead && listHeadSentinel && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      listHead.classList.toggle('is-stuck', !entry.isIntersecting)
    }).observe(listHeadSentinel)
  }

  // 帯の実高さを CSS 変数へ反映する(検索バーの吸着位置 top の基準になる)。
  const cardListSection = document.getElementById('card-list')
  if (listHead && cardListSection && 'ResizeObserver' in window) {
    const syncListHeadHeight = () => {
      cardListSection.style.setProperty(
        '--list-head-height',
        `${listHead.offsetHeight}px`,
      )
    }
    new ResizeObserver(syncListHeadHeight).observe(listHead)
    syncListHeadHeight()
  }

  // フィルターダイアログ(ゲームの表示設定風)。チェックの変更は即時反映しつつ、
  // 開いた時点の状態を控えておき、キャンセル・×・Esc では巻き戻す。確認は閉じるだけ。
  const filterDialog = document.getElementById(
    'filter-dialog',
  ) as HTMLDialogElement | null
  const filterOpenButton = document.getElementById(
    'student-filter-open',
  ) as HTMLButtonElement | null
  const filterCheckboxes = [normalFilter, costumeFilter, collaborationFilter]
  let filterSnapshot: boolean[] = []

  const restoreFilterSnapshot = () => {
    filterCheckboxes.forEach((checkbox, index) => {
      if (checkbox) {
        checkbox.checked = filterSnapshot[index] ?? true
      }
    })
    filterCards(lastAppliedStudentFilter)
    persistSettings()
  }

  filterOpenButton?.addEventListener('click', () => {
    if (!filterDialog) return
    filterSnapshot = filterCheckboxes.map((checkbox) =>
      Boolean(checkbox?.checked),
    )
    filterDialog.showModal()
    // ×ボタンへの自動フォーカスで iOS にリングが出ないよう、ダイアログ自体へ移す
    filterDialog.focus({ preventScroll: true })
  })
  document
    .getElementById('filter-cancel-button')
    ?.addEventListener('click', () => {
      restoreFilterSnapshot()
      filterDialog?.close()
    })
  document
    .getElementById('filter-dialog-close')
    ?.addEventListener('click', () => {
      restoreFilterSnapshot()
      filterDialog?.close()
    })
  // Esc で閉じたときもキャンセル扱いにする
  filterDialog?.addEventListener('cancel', restoreFilterSnapshot)
  document
    .getElementById('filter-confirm-button')
    ?.addEventListener('click', () => {
      filterDialog?.close()
    })

  // 並び替え候補が 2 つ以下の間は押すたびに切り替わるトグルボタンにする。
  // 3 つ以上に増えたらこのブロックは何もせず、セレクトでの選択に自動で戻る。
  const sortModeToggle = (() => {
    if (!sortSelect || sortSelect.options.length > 2) return null
    const button = document.createElement('button')
    button.type = 'button'
    button.id = 'student-sort-mode-toggle'
    button.className = 'sort-mode-toggle toolbar-skew-button'
    sortSelect.insertAdjacentElement('beforebegin', button)
    sortSelect.hidden = true
    return button
  })()

  const updateSortModeToggleLabel = () => {
    if (!sortModeToggle || !sortSelect) return
    sortModeToggle.textContent = sortSelect.selectedOptions[0]?.label ?? ''
  }
  updateSortModeToggleLabel()

  sortModeToggle?.addEventListener('click', () => {
    if (!sortSelect) return
    sortSelect.selectedIndex =
      (sortSelect.selectedIndex + 1) % sortSelect.options.length
    updateSortModeToggleLabel()
    applySortForCurrentState()
    persistSettings()
  })

  sortSelect?.addEventListener('change', () => {
    applySortForCurrentState()
    persistSettings()
  })
  sortDirectionButton?.addEventListener('click', () => {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'
    updateSortDirectionButton()
    applySortForCurrentState()
    persistSettings()
  })
  filterInput?.addEventListener('compositionupdate', () => {
    applyStudentFilterInput(filterInput?.value ?? '')
  })
  filterInput?.addEventListener('compositionend', () => {
    applyStudentFilterInput(filterInput?.value ?? '')
  })
  filterInput?.addEventListener('input', () => {
    applyStudentFilterInput(filterInput?.value ?? '')
  })
  ;[normalFilter, costumeFilter, collaborationFilter].forEach((checkbox) => {
    checkbox?.addEventListener('change', () => {
      filterCards(lastAppliedStudentFilter)
      persistSettings()
    })
  })

  // 復元した設定を初期表示に反映する。
  applySortForCurrentState()
  filterCards(lastAppliedStudentFilter)

  // ソート反映後の先頭(=ファーストビュー)のカードは遅延させず即時読み込みにし、
  // LCP になる画像の発見・取得を前倒しする。先頭数枚はさらに優先度を上げる。
  ;[...grid.querySelectorAll<HTMLImageElement>('.grid-item img')]
    .filter(
      (img) => img.closest<HTMLElement>('.grid-item')?.style.display !== 'none',
    )
    .slice(0, 24)
    .forEach((img, index) => {
      img.loading = 'eager'
      if (index < 8) {
        img.fetchPriority = 'high'
      }
    })

  let fittyInstances: FittyInstance[] = setupFitty()
  let devicePixelRatio = window.devicePixelRatio
  /** dpr が変わったが、非表示中で作り直せなかったことを覚えておく。 */
  let needsFittyRebuild = false

  const isCardListHidden = (): boolean => cardListSection?.hidden ?? false

  const rebuildFitty = () => {
    fittyInstances.forEach((instance) => instance.unsubscribe())
    fittyInstances = setupFitty()
  }

  window.addEventListener('resize', () => {
    if (window.devicePixelRatio === devicePixelRatio) {
      return
    }
    devicePixelRatio = window.devicePixelRatio
    // クイズ画面を開いている間は display:none で親の幅が 0 になり、
    // 作り直すと 0 幅で計測されて文字サイズが決まらない。
    // unsubscribe() は fitty が付けたインラインスタイルを消すので、
    // そのまま戻ると名前が原寸のままカードからはみ出す。
    // 非表示なら作り直しは再表示時まで持ち越す。
    if (isCardListHidden()) {
      needsFittyRebuild = true
      return
    }
    rebuildFitty()
  })

  // 再表示(hidden 属性が外れる)は resize を伴わないため、fitty は自力で
  // 測り直さない。非表示中に何らかの理由でサイズが失われていても復帰できる
  // よう、表示に戻ったら必ず測り直す。
  if (cardListSection) {
    new MutationObserver(() => {
      if (cardListSection.hidden) {
        return
      }
      if (needsFittyRebuild) {
        needsFittyRebuild = false
        rebuildFitty()
        return
      }
      fittyInstances.forEach((instance) => instance.fit())
    }).observe(cardListSection, {
      attributes: true,
      attributeFilter: ['hidden'],
    })
  }

  const sharedAudioPlayer = document.createElement('audio')
  sharedAudioPlayer.hidden = true
  document.body.appendChild(sharedAudioPlayer)

  // 再生中のカードは要素参照で持つ。名前をセレクタに埋め込まないため
  // 記号を含む名前でも壊れない。
  let playingCard: HTMLElement | null = null

  const resetAudio = () => {
    if (!playingCard) return
    sharedAudioPlayer.pause()
    sharedAudioPlayer.currentTime = 0
    playingCard.querySelector('img')?.classList.remove('playing')
    playingCard = null
  }

  const updateBadge = (
    card: HTMLElement,
    clips: readonly TitleCallClip[],
    index: number,
  ) => {
    const badge = card.querySelector<HTMLElement>('.clip-badge')
    if (!badge) return
    const text = formatClipBadge(index, clips.length, clips[index]?.label)
    badge.textContent = text
    badge.hidden = text.length === 0
  }

  const updateVoiceActor = (
    card: HTMLElement,
    clip: TitleCallClip | undefined,
  ) => {
    const voiceActor = card.querySelector<HTMLElement>('.voice-actor')
    if (!voiceActor) return
    voiceActor.textContent = formatVoiceActorText(
      resolveVoiceActorName(card, clip),
    )
  }

  /** タップは常に「選択中のバージョン」を再生する。順送りはしない。 */
  const playCard = (card: HTMLElement) => {
    const clips = clipsByCard.get(card)
    if (!clips || clips.length === 0) return

    const index = Number(card.dataset.clipIndex ?? 0) % clips.length
    const clip = clips[index]
    if (!clip) return

    if (playingCard) {
      resetAudio()
    }
    playingCard = card

    sharedAudioPlayer.src = resolveAssetUrl(clip.file)
    sharedAudioPlayer.currentTime = 0
    sharedAudioPlayer.load()
    const playPromise = sharedAudioPlayer.play()
    if (playPromise !== undefined) {
      playPromise
        .then(() => card.querySelector('img')?.classList.add('playing'))
        .catch(() => resetAudio())
    }
  }

  /** バッジの切替ボタンで能動的にバージョンを選ぶ。再生はしない。 */
  const switchCardClip = (card: HTMLElement) => {
    const clips = clipsByCard.get(card)
    if (!clips || clips.length < 2) return
    const nextIndex = (Number(card.dataset.clipIndex ?? 0) + 1) % clips.length
    card.dataset.clipIndex = String(nextIndex)
    if (playingCard === card) {
      resetAudio()
    }
    updateBadge(card, clips, nextIndex)
    updateVoiceActor(card, clips[nextIndex])
  }

  const handleCardActivation = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return
    if (target.closest('.clip-switch')) return
    const card = target.closest<HTMLElement>('.grid-item')
    if (card) {
      playCard(card)
    }
  }

  grid.addEventListener('click', (event) => {
    const target = event.target
    if (target instanceof HTMLElement) {
      const switchButton = target.closest('.clip-switch')
      if (switchButton) {
        const card = switchButton.closest<HTMLElement>('.grid-item')
        if (card) {
          switchCardClip(card)
        }
        return
      }
    }
    handleCardActivation(event.target)
  })

  grid.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key !== 'Enter') return
    // 切替ボタン上の Enter はボタン自身の click に任せる(再生と二重発火させない)。
    handleCardActivation(event.target)
  })

  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (!target.closest('.grid-item') && playingCard) {
      resetAudio()
    }
  })
  sharedAudioPlayer.addEventListener('ended', resetAudio)
}
