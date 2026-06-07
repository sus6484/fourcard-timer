import GameSelector from './GameSelector.jsx'

export default function TopGameBar({
  globalGames,
  activeGlobalGameId,
  globalMenuOpen,
  onToggleGlobalMenu,
  onSelectGlobalGame,
  onOpenGlobalSettings,
  branchGames,
  activeBranchGameId,
  branchMenuOpen,
  onToggleBranchMenu,
  onSelectBranchGame,
  onOpenBranchSettings,
  onOpenBranchLogin,
  branchCode,
  branchName,
  onBranchLogout,
}) {
  const branchLoggedIn = Boolean(branchCode)

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

      <div className="top-game-bar__row top-game-bar__row--branch">
        <span className="top-game-bar__label">지점게임</span>
        {branchLoggedIn ? (
          <GameSelector
            games={branchGames}
            activeGameId={activeBranchGameId}
            emptyLabel="지점 게임 없음"
            open={branchMenuOpen}
            onToggle={onToggleBranchMenu}
            onSelect={onSelectBranchGame}
          />
        ) : (
          <button
            type="button"
            className="game-selector__trigger game-selector__trigger--locked"
            onClick={onOpenBranchLogin}
          >
            지점 로그인 필요
          </button>
        )}
        <button type="button" className="top-game-bar__settings" onClick={onOpenBranchSettings}>
          설정
        </button>
        {branchLoggedIn && (
          <div className="top-game-bar__branch-meta">
            <span className="top-game-bar__branch-tag">{branchName ?? branchCode}</span>
            <button type="button" className="top-game-bar__logout" onClick={onBranchLogout}>
              로그아웃
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
