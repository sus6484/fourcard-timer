import GameSelector from './GameSelector.jsx'
import { GAME_SLOTS, gameSlotLabel } from '../lib/sessionSync.js'

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
  showGameSlot = false,
  gameSlot = '1',
  gameSlotMenuOpen = false,
  onToggleGameSlotMenu,
  onSelectGameSlot,
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
        {showGameSlot ? (
          <div className="game-slot">
            <button
              type="button"
              className="top-game-bar__settings"
              aria-expanded={gameSlotMenuOpen}
              aria-haspopup="menu"
              onClick={onToggleGameSlotMenu}
            >
              {gameSlotLabel(gameSlot)}
            </button>
            {gameSlotMenuOpen ? (
              <>
                <button
                  type="button"
                  className="game-selector__backdrop"
                  aria-label="게임 번호 닫기"
                  tabIndex={-1}
                  onClick={onToggleGameSlotMenu}
                />
                <div className="game-slot__menu" role="menu">
                  <p className="game-slot__note">이 화면만 이동합니다</p>
                  {GAME_SLOTS.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      role="menuitem"
                      className={`game-slot__item${slot === gameSlot ? ' is-active' : ''}`}
                      onClick={() => onSelectGameSlot?.(slot)}
                    >
                      {gameSlotLabel(slot)}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
        {isLoggedIn ? (
          <button type="button" className="top-game-bar__settings" onClick={onLogout}>
            로그아웃
          </button>
        ) : null}
      </div>
    </div>
  )
}
