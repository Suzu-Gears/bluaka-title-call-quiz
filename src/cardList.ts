import fitty, { type FittyInstance } from 'fitty'

import type { Student } from '@/lib/interfaces'
import {
  normalizeKanaForSearch,
  normalizeNameInputForSearch,
  resolveStudentCategory,
} from '@/lib/quizProgress'
import { SORT_DIRECTION_LABEL } from '@/lib/uiText'

const DEFAULT_IMAGE = '/default-student-image.webp'

export const createCard = (student: Student, hasAudio: boolean): HTMLElement => {
  const item = document.createElement('div')
  item.className = 'grid-item'
  item.tabIndex = 0
  item.dataset.name = student.Name
  item.dataset.nameKey = normalizeQuizAnswer(student.Name)
  item.dataset.filterCategory = resolveStudentCategory(
    student.Costume,
    student.IsCollaboration,
  )
  item.dataset.defaultOrder = String(student.DefaultOrder ?? 0)
  item.dataset.nameSortOrder = String(student.NameSortOrder ?? student.DefaultOrder ?? 0)

  const imageContainer = document.createElement('div')
  imageContainer.className = 'image-container'
  const image = document.createElement('img')
  image.loading = 'lazy'
  image.src = `/image/${encodeURIComponent(student.Name)}.webp`
  image.alt = student.Name
  image.onerror = () => {
    image.src = DEFAULT_IMAGE
  }
  const voiceActorContainer = document.createElement('div')
  voiceActorContainer.className = 'voice-actor-container'
  const voiceActor = document.createElement('div')
  voiceActor.className = 'voice-actor'
  voiceActor.textContent = `\u00A0\u00A0CV.${student.CharacterVoice}\u00A0\u00A0`
  voiceActorContainer.appendChild(voiceActor)
  imageContainer.append(image, voiceActorContainer)

  const nameContainer = document.createElement('div')
  nameContainer.className = 'name-container'
  item.dataset.hasAudio = String(hasAudio)
  const nameNode = document.createElement('div')
  nameNode.className = 'name'
  const baseNameLabel = student.Name.includes('（')
    ? `\u00A0${student.Name}`
    : `\u00A0${student.Name}\u00A0`
  nameNode.textContent = hasAudio ? baseNameLabel : `${baseNameLabel} 🔇`
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

export const setupStudentGrid = (
  students: Student[],
  unavailableAudioNames: Set<string>,
): void => {
  const grid = document.getElementById('studentGrid')
  if (!grid) return

  students
    .slice()
    .sort((a, b) => (a.DefaultOrder ?? 0) - (b.DefaultOrder ?? 0))
    .forEach((student) =>
      grid.appendChild(createCard(student, !unavailableAudioNames.has(student.Name))),
    )

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
        (!normalized || nameKey.includes(normalized)) && categoryEnabled ? '' : 'none'
    })
  }

  let lastAppliedStudentFilter = filterInput?.value ?? ''
  const applyStudentFilterInput = (inputValue: string) => {
    lastAppliedStudentFilter = inputValue
    filterCards(inputValue)
  }

  sortSelect?.addEventListener('change', () => sortCards(sortSelect.value, sortDirection))
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
    checkbox?.addEventListener('change', () => filterCards(lastAppliedStudentFilter))
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

  let sharedAudioPlayer: HTMLAudioElement | null = document.createElement('audio')
  let currentlyPlayingName: string | null = null
  sharedAudioPlayer.hidden = true
  document.body.appendChild(sharedAudioPlayer)

  const resetAudio = () => {
    if (!sharedAudioPlayer || !currentlyPlayingName) return
    sharedAudioPlayer.pause()
    sharedAudioPlayer.currentTime = 0
    const image = document.querySelector(
      `.grid-item[data-name="${currentlyPlayingName}"] img`,
    )
    image?.classList.remove('playing')
    currentlyPlayingName = null
  }

  const playAudio = (name: string) => {
    if (!sharedAudioPlayer) return
    const gridItem = document.querySelector(`.grid-item[data-name="${name}"]`)
    if (!gridItem) return
    if (gridItem instanceof HTMLElement && gridItem.dataset.hasAudio === 'false') {
      return
    }
    const image = gridItem.querySelector('img')
    if (currentlyPlayingName) {
      resetAudio()
    }
    currentlyPlayingName = name
    sharedAudioPlayer.src = `/audio/${name}.mp3`
    sharedAudioPlayer.currentTime = 0
    sharedAudioPlayer.load()
    const playPromise = sharedAudioPlayer.play()
    if (playPromise !== undefined) {
      playPromise
        .then(() => image?.classList.add('playing'))
        .catch(() => resetAudio())
    }
  }

  grid.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    const card = target.closest('.grid-item') as HTMLElement | null
    const name = card?.dataset.name
    if (name) {
      playAudio(name)
    }
  })

  grid.addEventListener('keydown', (event) => {
    const keyboardEvent = event as KeyboardEvent
    if (keyboardEvent.key !== 'Enter') return
    const target = keyboardEvent.target as HTMLElement | null
    if (!target) return
    const card = target.closest('.grid-item') as HTMLElement | null
    const name = card?.dataset.name
    if (name) {
      playAudio(name)
    }
  })

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (!target.closest('.grid-item') && currentlyPlayingName) {
      resetAudio()
    }
  })
  sharedAudioPlayer.addEventListener('ended', resetAudio)
}
