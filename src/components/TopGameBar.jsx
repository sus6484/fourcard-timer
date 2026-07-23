import GameSelector from './GameSelector.jsx'

export default function TopGameBar({
  globalGames,
  activeGlobalGameId,
  globalMenuOpen,
  onToggleGlobalMenu,
  onSelectGlobalGame,
  onOpenGlobalSettings,
  onOpenBranchManager,
  onLogout,
  canManagePresets = false,
  sessionLabel = '',
  branches = [],
  selectedBranchId = '',
  onSelectBranch,
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
        {canManagePresets ? (
          <>
            <button type="button" className="top-game-bar__settings" onClick={onOpenGlobalSettings}>
              설정
            </button>
            <button type="button" className="top-game-bar__settings" onClick={onOpenBranchManager}>
              지점
            </button>
            {branches.length > 0 ? (
              <label className="top-game-bar__branch">
                <span className="visually-hidden">지점 선택</span>
                <select
                  value={selectedBranchId}
                  onChange={(event) => onSelectBranch?.(event.target.value)}
                >
                  <option value="">지점 선택</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name || branch.id}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : null}
        {sessionLabel ? <span className="top-game-bar__session">{sessionLabel}</span> : null}
        <button type="button" className="top-game-bar__settings" onClick={onLogout}>
          로그아웃
        </button>
      </div>
    </div>
  )
}
