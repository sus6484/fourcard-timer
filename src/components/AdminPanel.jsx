import { useState } from 'react'
import { createGame, createLevel, duplicateGame } from '../lib/presets.js'

function emptyLevel(levelNumber) {
  return createLevel(levelNumber, 8, 100, 200)
}

export default function AdminPanel({
  open,
  games,
  activeGameId,
  adminPin,
  onClose,
  onSavePin,
  onSaveGames,
  onSelectGame,
}) {
  if (!open) return null

  const activeGame = games.find((game) => game.id === activeGameId) ?? games[0]

  const updateActiveGame = (updater) => {
    onSaveGames(
      games.map((game) => {
        if (game.id !== activeGame.id) return game
        return typeof updater === 'function' ? updater(game) : { ...game, ...updater }
      }),
    )
  }

  const updateLevel = (index, field, value) => {
    updateActiveGame((game) => ({
      ...game,
      levels: game.levels.map((level, levelIndex) => {
        if (levelIndex !== index) return level
        return { ...level, [field]: value }
      }),
    }))
  }

  const addLevel = () => {
    updateActiveGame((game) => ({
      ...game,
      levels: [...game.levels, emptyLevel(game.levels.length + 1)],
    }))
  }

  const removeLevel = (index) => {
    updateActiveGame((game) => ({
      ...game,
      levels: game.levels
        .filter((_, levelIndex) => levelIndex !== index)
        .map((level, levelIndex) => ({ ...level, level: levelIndex + 1 })),
    }))
  }

  const handleDuplicate = () => {
    const copy = duplicateGame(activeGame)
    onSaveGames([...games, copy])
    onSelectGame(copy.id)
  }

  const handleCreate = () => {
    const game = createGame(`custom-${Date.now()}`, '새 게임', [emptyLevel(1)], { custom: true })
    onSaveGames([...games, game])
    onSelectGame(game.id)
  }

  const handleDelete = () => {
    if (games.length <= 1) return
    if (!window.confirm(`"${activeGame.name}" 게임을 삭제할까요?`)) return
    const nextGames = games.filter((game) => game.id !== activeGame.id)
    onSaveGames(nextGames)
    onSelectGame(nextGames[0].id)
  }

  return (
    <div className="admin-overlay">
      <div className="admin-panel">
        <header className="admin-panel__header">
          <div>
            <p className="admin-panel__eyebrow">관리자 모드</p>
            <h2>게임 설정</h2>
          </div>
          <button type="button" className="admin-panel__close" onClick={onClose}>
            닫기
          </button>
        </header>

        <section className="admin-panel__section">
          <label className="admin-field">
            <span>관리자 PIN (4자리)</span>
            <input
              type="password"
              maxLength={4}
              value={adminPin}
              onChange={(event) => onSavePin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </label>
        </section>

        <section className="admin-panel__section admin-panel__games">
          <div className="admin-panel__row">
            <label className="admin-field admin-field--grow">
              <span>게임 선택</span>
              <select value={activeGame.id} onChange={(event) => onSelectGame(event.target.value)}>
                {games.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={handleDuplicate}>복사</button>
            <button type="button" onClick={handleCreate}>새 게임</button>
            <button type="button" onClick={handleDelete} disabled={games.length <= 1}>삭제</button>
          </div>

          <label className="admin-field">
            <span>게임 이름</span>
            <input
              type="text"
              value={activeGame.name}
              onChange={(event) => updateActiveGame({ name: event.target.value })}
            />
          </label>

          <label className="admin-field">
            <span>메모 (상금, 리엔트리 등)</span>
            <textarea
              rows={4}
              value={activeGame.memo}
              placeholder={'1등 상금\n2등 상금\n리엔트리 2회'}
              onChange={(event) => updateActiveGame({ memo: event.target.value })}
            />
          </label>
        </section>

        <section className="admin-panel__section">
          <div className="admin-panel__row admin-panel__row--between">
            <h3>레벨 / 블라인드</h3>
            <button type="button" onClick={addLevel}>레벨 추가</button>
          </div>

          <div className="admin-levels">
            {activeGame.levels.map((level, index) => (
              <div key={`${activeGame.id}-${index}`} className="admin-level-row">
                <label>
                  <span>Lv</span>
                  <input
                    type="number"
                    min="1"
                    value={level.level}
                    onChange={(event) => updateLevel(index, 'level', Number(event.target.value))}
                  />
                </label>
                <label>
                  <span>분</span>
                  <input
                    type="number"
                    min="1"
                    value={level.minutes}
                    onChange={(event) => updateLevel(index, 'minutes', Number(event.target.value))}
                  />
                </label>
                <label>
                  <span>SB</span>
                  <input
                    type="number"
                    min="0"
                    value={level.smallBlind}
                    disabled={level.isBreak}
                    onChange={(event) => updateLevel(index, 'smallBlind', Number(event.target.value))}
                  />
                </label>
                <label>
                  <span>BB</span>
                  <input
                    type="number"
                    min="0"
                    value={level.bigBlind}
                    disabled={level.isBreak}
                    onChange={(event) => updateLevel(index, 'bigBlind', Number(event.target.value))}
                  />
                </label>
                <label>
                  <span>Ante</span>
                  <input
                    type="number"
                    min="0"
                    value={level.ante}
                    disabled={level.isBreak}
                    onChange={(event) => updateLevel(index, 'ante', Number(event.target.value))}
                  />
                </label>
                <label className="admin-level-row__break">
                  <input
                    type="checkbox"
                    checked={level.isBreak}
                    onChange={(event) => updateLevel(index, 'isBreak', event.target.checked)}
                  />
                  <span>브레이크</span>
                </label>
                <button type="button" onClick={() => removeLevel(index)} disabled={activeGame.levels.length <= 1}>
                  삭제
                </button>
              </div>
            ))}
          </div>
        </section>

        <footer className="admin-panel__footer">
          <p>변경 내용은 이 기기에 자동 저장됩니다.</p>
        </footer>
      </div>
    </div>
  )
}

export function PinModal({ open, onClose, onSubmit, error }) {
  const [pin, setPin] = useState('')

  if (!open) return null

  return (
    <div className="pin-overlay">
      <form
        className="pin-modal"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(pin)
          setPin('')
        }}
      >
        <h2>관리자 PIN</h2>
        <p className="pin-modal__hint">처음 사용 시 기본 PIN: 0000</p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          placeholder="0000"
          onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
        />
        {error && <p className="pin-modal__error">{error}</p>}
        <div className="pin-modal__actions">
          <button type="button" onClick={onClose}>취소</button>
          <button type="submit">확인</button>
        </div>
      </form>
    </div>
  )
}
