import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const SCROLL_STEP = 96
const SCROLL_REPEAT_MS = 80

function scrollItemIntoView(list, item) {
  if (!list || !item) return
  const top = item.offsetTop
  const bottom = top + item.offsetHeight
  const viewTop = list.scrollTop
  const viewBottom = viewTop + list.clientHeight
  if (top < viewTop) list.scrollTop = top
  else if (bottom > viewBottom) list.scrollTop = bottom - list.clientHeight
}

function isArrowDown(event) {
  return event.key === 'ArrowDown' || event.key === 'Down' || event.keyCode === 40
}

function isArrowUp(event) {
  return event.key === 'ArrowUp' || event.key === 'Up' || event.keyCode === 38
}

export default function GameSelector({
  games,
  activeGameId,
  emptyLabel = 'Game',
  open,
  onToggle,
  onSelect,
}) {
  const activeGame = games.find((game) => game.id === activeGameId)
  const listRef = useRef(null)
  const scrollHoldRef = useRef(null)
  const highlightedIndexRef = useRef(0)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  highlightedIndexRef.current = highlightedIndex
  const gamesRef = useRef(games)
  const activeGameIdRef = useRef(activeGameId)
  gamesRef.current = games
  activeGameIdRef.current = activeGameId
  const onSelectRef = useRef(onSelect)
  const onToggleRef = useRef(onToggle)
  onSelectRef.current = onSelect
  onToggleRef.current = onToggle

  const syncScrollButtons = useCallback(() => {
    const list = listRef.current
    if (!list) return
    setCanScrollUp(list.scrollTop > 1)
    setCanScrollDown(list.scrollTop + list.clientHeight < list.scrollHeight - 1)
  }, [])

  const focusItem = useCallback((index) => {
    const list = listRef.current
    const items = list?.querySelectorAll('[role="menuitem"]')
    const item = items?.[index]
    if (!item) return
    item.focus({ preventScroll: true })
    scrollItemIntoView(list, item)
    syncScrollButtons()
  }, [syncScrollButtons])

  const moveHighlight = useCallback((nextIndex) => {
    if (!games.length) return
    const clamped = Math.max(0, Math.min(games.length - 1, nextIndex))
    setHighlightedIndex(clamped)
    highlightedIndexRef.current = clamped
    focusItem(clamped)
  }, [focusItem, games.length])

  const stopScrollHold = useCallback(() => {
    if (scrollHoldRef.current) {
      clearInterval(scrollHoldRef.current)
      scrollHoldRef.current = null
    }
  }, [])

  const startScrollHold = useCallback((direction) => {
    stopScrollHold()
    const step = () => {
      listRef.current?.scrollBy({ top: direction * SCROLL_STEP })
      syncScrollButtons()
    }
    step()
    scrollHoldRef.current = setInterval(step, SCROLL_REPEAT_MS)
  }, [stopScrollHold, syncScrollButtons])

  useLayoutEffect(() => {
    if (!open) {
      stopScrollHold()
      return undefined
    }

    const start = Math.max(0, gamesRef.current.findIndex((game) => game.id === activeGameIdRef.current))
    setHighlightedIndex(start)
    highlightedIndexRef.current = start

    const list = listRef.current
    const sync = () => syncScrollButtons()
    sync()
    list?.addEventListener('scroll', sync, { passive: true })
    const observer = typeof ResizeObserver !== 'undefined' && list
      ? new ResizeObserver(sync)
      : null
    if (list) observer?.observe(list)

    requestAnimationFrame(() => {
      focusItem(start)
      sync()
    })
    const focusTimer = window.setTimeout(() => {
      focusItem(start)
      sync()
    }, 0)

    return () => {
      window.clearTimeout(focusTimer)
      list?.removeEventListener('scroll', sync)
      observer?.disconnect()
      stopScrollHold()
    }
    // Reset highlight only when the menu opens, not on every games refresh.
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape' || event.keyCode === 27) {
        event.preventDefault()
        onToggleRef.current()
        return
      }

      const list = gamesRef.current
      if (!list.length) return

      if (
        event.key === 'Enter' ||
        event.key === ' ' ||
        event.key === 'OK' ||
        event.key === 'Select' ||
        event.keyCode === 13 ||
        event.keyCode === 32
      ) {
        const game = list[highlightedIndexRef.current]
        if (!game) return
        event.preventDefault()
        onSelectRef.current(game.id)
        return
      }

      if (isArrowDown(event)) {
        event.preventDefault()
        moveHighlight(highlightedIndexRef.current + 1)
        return
      }
      if (isArrowUp(event)) {
        event.preventDefault()
        moveHighlight(highlightedIndexRef.current - 1)
        return
      }
      if (event.key === 'Home' || event.keyCode === 36) {
        event.preventDefault()
        moveHighlight(0)
        return
      }
      if (event.key === 'End' || event.keyCode === 35) {
        event.preventDefault()
        moveHighlight(list.length - 1)
        return
      }
      if (event.key === 'PageDown' || event.keyCode === 34) {
        event.preventDefault()
        const menu = listRef.current
        menu?.scrollBy({ top: (menu?.clientHeight ?? SCROLL_STEP) * 0.85 })
        syncScrollButtons()
        return
      }
      if (event.key === 'PageUp' || event.keyCode === 33) {
        event.preventDefault()
        const menu = listRef.current
        menu?.scrollBy({ top: -(menu?.clientHeight ?? SCROLL_STEP) * 0.85 })
        syncScrollButtons()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [moveHighlight, open, syncScrollButtons])

  const handleScrollPointerDown = (direction) => (event) => {
    if (event.currentTarget.disabled) return
    if (event.button != null && event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    startScrollHold(direction)
  }

  return (
    <div className="game-selector">
      <button type="button" className="game-selector__trigger" onClick={onToggle}>
        {activeGame?.name ?? emptyLabel}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="game-selector__backdrop"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={onToggle}
          />
          <div className="game-selector__menu">
            <button
              type="button"
              className="game-selector__scroll-btn"
              aria-label="목록 위로"
              tabIndex={-1}
              disabled={!canScrollUp}
              onPointerDown={handleScrollPointerDown(-1)}
              onPointerUp={stopScrollHold}
              onPointerCancel={stopScrollHold}
              onLostPointerCapture={stopScrollHold}
            >
              <span className="game-selector__chevron game-selector__chevron--up" aria-hidden="true" />
            </button>
            <div className="game-selector__list" role="menu" ref={listRef}>
              {games.map((game, index) => (
                <button
                  key={game.id}
                  type="button"
                  role="menuitem"
                  className={`game-selector__item${game.id === activeGameId ? ' is-active' : ''}${index === highlightedIndex ? ' is-highlighted' : ''}`}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => onSelect(game.id)}
                >
                  {game.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="game-selector__scroll-btn"
              aria-label="목록 아래로"
              tabIndex={-1}
              disabled={!canScrollDown}
              onPointerDown={handleScrollPointerDown(1)}
              onPointerUp={stopScrollHold}
              onPointerCancel={stopScrollHold}
              onLostPointerCapture={stopScrollHold}
            >
              <span className="game-selector__chevron game-selector__chevron--down" aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
