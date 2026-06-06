export default function GameSelector({ games, activeGameId, open, onToggle, onSelect }) {
  const activeGame = games.find((game) => game.id === activeGameId)

  return (
    <div className="game-selector">
      <button type="button" className="game-selector__trigger" onClick={onToggle}>
        {activeGame?.name ?? 'Game'}
      </button>
      {open && (
        <>
          <button type="button" className="game-selector__backdrop" aria-label="Close menu" onClick={onToggle} />
          <div className="game-selector__menu" role="menu">
            {games.map((game) => (
              <button
                key={game.id}
                type="button"
                role="menuitem"
                className={`game-selector__item${game.id === activeGameId ? ' is-active' : ''}`}
                onClick={() => onSelect(game.id)}
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
