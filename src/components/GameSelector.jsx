import { useEffect, useMemo, useRef } from 'react'

export default function GameSelector({
  games,
  activeGameId,
  emptyLabel = 'Game',
  open,
  onToggle,
  onSelect,
}) {
  const activeGame = games.find((game) => game.id === activeGameId)
  const triggerRef = useRef(null)
  const itemRefs = useRef([])
  const activeIndex = useMemo(
    () => Math.max(0, games.findIndex((game) => game.id === activeGameId)),
    [games, activeGameId],
  )

  useEffect(() => {
    if (!open) {
      triggerRef.current?.focus()
      return
    }

    const target = itemRefs.current[activeIndex] ?? itemRefs.current[0]
    target?.focus()
    target?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const moveFocus = (nextIndex) => {
    const boundedIndex = Math.max(0, Math.min(games.length - 1, nextIndex))
    const target = itemRefs.current[boundedIndex]
    target?.focus()
    target?.scrollIntoView({ block: 'nearest' })
  }

  const handleItemKeyDown = (event, index, gameId) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(index + 1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(index - 1)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      moveFocus(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      moveFocus(games.length - 1)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(gameId)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      onToggle()
    }
  }

  return (
    <div className="game-selector">
      <button type="button" className="game-selector__trigger" onClick={onToggle} ref={triggerRef}>
        {activeGame?.name ?? emptyLabel}
      </button>
      {open && (
        <>
          <button type="button" className="game-selector__backdrop" aria-label="Close menu" onClick={onToggle} />
          <div className="game-selector__menu" role="menu">
            {games.map((game, index) => (
              <button
                key={game.id}
                type="button"
                role="menuitem"
                className={`game-selector__item${game.id === activeGameId ? ' is-active' : ''}`}
                ref={(element) => {
                  itemRefs.current[index] = element
                }}
                tabIndex={game.id === activeGameId ? 0 : -1}
                onClick={() => onSelect(game.id)}
                onKeyDown={(event) => handleItemKeyDown(event, index, game.id)}
              >
                {game.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
