import GameSelector from './GameSelector.jsx'

export default function TopGameBar({
  globalGames,
  activeGlobalGameId,
  globalMenuOpen,
  onToggleGlobalMenu,
  onSelectGlobalGame,
  onOpenGlobalSettings,
}) {
  return (
    <div className="top-game-bar">
      <div className="top-game-bar__row">
        <span className="top-game-bar__label">전체게임</span>
        <GameSelector
          games={globalGames}
          activeGameId={activeGlobalGameId}
          open={globalMenuOpen}
          onToggle={onToggleGlobalMenu}
          onSelect={onSelectGlobalGame}
        />
        <button type="button" className="top-game-bar__settings" onClick={onOpenGlobalSettings}>
          설정
        </button>
      </div>
    </div>
  )
}
