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
import { orderClipsForBrowsing } from '@/lib/titleCallClips'
import { formatClipBadge, SORT_DIRECTION_LABEL } from '@/lib/uiText'

const DEFAULT_IMAGE = resolveAssetUrl('default-student-image.webp')

export const createCard = (
  entry: QuizEntry,
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
  item.dataset.defaultOrder = String(entry.DefaultOrder)
  item.dataset.nameSortOrder = String(entry.NameSortOrder)
  item.dataset.hasAudio = String(clips.length > 0)
  item.dataset.clipIndex = '0'

  const imageContainer = document.createElement('div')
  imageContainer.className = 'image-container'
  const image = document.createElement('img')
  image.loading = 'lazy'
  image.src = resolveAssetUrl(formatImageKey(entry.PrimaryId))
  image.alt = entry.Name
  image.onerror = () => {
    image.src = DEFAULT_IMAGE
  }

  const badge = document.createElement('div')
  badge.className = 'clip-badge'
  const badgeText = formatClipBadge(0, clips.length, clips[0]?.label)
  badge.textContent = badgeText
  badge.hidden = badgeText.length === 0

  const voiceActorContainer = document.createElement('div')
  voiceActorContainer.className = 'voice-actor-container'
  const voiceActor = document.createElement('div')
  voiceActor.className = 'voice-actor'
  voiceActor.textContent = `  CV.${entry.CharacterVoice}  `
  voiceActorContainer.appendChild(voiceActor)
  imageContainer.append(image, badge, voiceActorContainer)

  const nameContainer = document.createElement('div')
  nameContainer.className = 'name-container'
  const nameNode = document.createElement('div')
  nameNode.className = 'name'
  const baseNameLabel = entry.Name.includes('（')
    ? ` ${entry.Name}`
    : ` ${entry.Name} `
  nameNode.textContent =
    clips.length > 0 ? baseNameLabel : `${baseNameLabel} 🔇`
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
      const clips = orderClipsForBrowsing(entry.TitleCalls)
      const card = createCard(entry, clips)
      clipsByCard.set(card, clips)
      grid.appendChild(card)
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

  let sortDirection: 'asc' | 'desc' = 'asc'
  const sortCards = (sortMode: string, direction: 'asc' | 'desc') => {
    const cards = [...grid.querySelectorAll<HTMLElement>('.grid-item')]
    const key = sortMode === 'name-order' ? 'nameSortOrder' : 'defaultOrder'
    cards.sort((a, b) => {
      const aValue = Number(a.dataset[key] ?? 0)
      const bValue = Number(b.dataset[key] ?? 0)
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
  const applyStudentFilterInput = (inputValue: string) => {
    lastAppliedStudentFilter = inputValue
    filterCards(inputValue)
  }

  sortSelect?.addEventListener('change', () =>
    sortCards(sortSelect.value, sortDirection),
  )
  sortDirectionButton?.addEventListener('click', () => {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'
    sortDirectionButton.textContent = SORT_DIRECTION_LABEL[sortDirection]
    if (sortSelect) {
      sortCards(sortSelect.value, sortDirection)
    }
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
    checkbox?.addEventListener('change', () =>
      filterCards(lastAppliedStudentFilter),
    )
  })

  let fittyInstances: FittyInstance[] = setupFitty()
  let devicePixelRatio = window.devicePixelRatio
  window.addEventListener('resize', () => {
    if (window.devicePixelRatio !== devicePixelRatio) {
      devicePixelRatio = window.devicePixelRatio
      fittyInstances.forEach((instance) => instance.unsubscribe())
      fittyInstances = setupFitty()
    }
  })

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
    card.dataset.clipIndex = String((index + 1) % clips.length)
    updateBadge(card, clips, index)

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

  const handleCardActivation = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return
    const card = target.closest<HTMLElement>('.grid-item')
    if (card) {
      playCard(card)
    }
  }

  grid.addEventListener('click', (event) => {
    handleCardActivation(event.target)
  })

  grid.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key !== 'Enter') return
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
