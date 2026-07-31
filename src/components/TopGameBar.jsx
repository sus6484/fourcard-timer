import GameSelector from './GameSelector.jsx'

export default function TopGameBar({
  globalGames,
  activeGlobalGameId,
  globalMenuOpen,
  onToggleGlobalMenu,
  onSelectGlobalGame,
  onOpenGlobalSettings,
  onOpenBranchLogin,
  onLogout,
  isLoggedIn = false,
  sessionLabel = '',
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

      <div className="top-game-bar__row top-game-bar__row--actions">
        <button
          type="button"
          className="top-game-bar__settings top-game-bar__session-btn"
          onClick={onOpenBranchLogin}
        >
          {sessionLabel || '지점선택'}
        </button>
        {isLoggedIn ? (
          <button type="button" className="top-game-bar__settings" onClick={onLogout}>
            로그아웃
          </button>
        ) : null}
      </div>
    </div>
  )
}
