import { useEffect, useMemo, useRef, useState } from 'react'
import { cloneGame, createBreak, createGame, createLevel, duplicateGame, getPokerLevelNumber, normalizeScheduleLevels } from '../lib/presets.js'

function emptyLevel(levels) {
  const pokerCount = levels.filter((level) => !level.isBreak).length
  return createLevel(pokerCount + 1, 8, 100, 200)
}

function cloneGamesList(games) {
  return games.map(cloneGame)
}

function createDraft({ games, activeGameId, adminPin }) {
  return {
    games: cloneGamesList(games),
    activeGameId,
    adminPin,
  }
}

export default function AdminPanel({
  open,
  games,
  activeGameId,
  adminPin,
  onClose,
  onSave,
  saveError = '',
  saving = false,
}) {
  const [draft, setDraft] = useState(null)
  const [bulkMinutes, setBulkMinutes] = useState(8)
  const savedSnapshot = useRef('')

  useEffect(() => {
    if (!open) return
    const nextDraft = createDraft({ games, activeGameId, adminPin })
    setDraft(nextDraft)
    savedSnapshot.current = JSON.stringify(nextDraft)
  }, [open, games, activeGameId, adminPin])

  useEffect(() => {
    if (!open || !draft) return
    const game = draft.games.find((g) => g.id === draft.activeGameId) ?? draft.games[0]
    const firstPlayLevel = game?.levels?.find((level) => !level.isBreak)
    if (firstPlayLevel) {
      setBulkMinutes(firstPlayLevel.minutes)
    }
  }, [open, draft?.activeGameId, draft?.games])

  const isDirty = useMemo(() => {
    if (!draft) return false
    return JSON.stringify(draft) !== savedSnapshot.current
  }, [draft])

  if (!open || !draft) return null

  const activeGame = draft.games.find((game) => game.id === draft.activeGameId) ?? draft.games[0]

  const updateDraft = (updater) => {
    setDraft((prev) => (typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }))
  }

  const updateActiveGame = (updater) => {
    if (!activeGame) return
    updateDraft((prev) => ({
      ...prev,
      games: prev.games.map((game) => {
        if (game.id !== activeGame.id) return game
        return typeof updater === 'function' ? updater(game) : { ...game, ...updater }
      }),
    }))
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
      levels: normalizeScheduleLevels([...game.levels, emptyLevel(game.levels)]),
    }))
  }

  const addBreak = () => {
    updateActiveGame((game) => ({
      ...game,
      levels: normalizeScheduleLevels([...game.levels, createBreak(bulkMinutes || 8)]),
    }))
  }

  const insertBreakAfter = (index) => {
    updateActiveGame((game) => {
      const levels = [...game.levels]
      levels.splice(index + 1, 0, createBreak(bulkMinutes || 8))
      return { ...game, levels: normalizeScheduleLevels(levels) }
    })
  }

  const removeLevel = (index) => {
    updateActiveGame((game) => ({
      ...game,
      levels: normalizeScheduleLevels(game.levels.filter((_, levelIndex) => levelIndex !== index)),
    }))
  }

  const applyBulkMinutes = () => {
    const value = Number(bulkMinutes)
    if (!value || value < 1) return
    updateActiveGame((game) => ({
      ...game,
      levels: game.levels.map((level) => ({ ...level, minutes: value })),
    }))
  }

  const handleDuplicate = () => {
    const copy = duplicateGame(activeGame)
    updateDraft((prev) => ({
      ...prev,
      games: [...prev.games, copy],
      activeGameId: copy.id,
    }))
  }

  const handleCreate = () => {
    const game = createGame(`custom-${Date.now()}`, '새 게임', [createLevel(1, 8, 100, 200)], { custom: true })
    updateDraft((prev) => ({
      ...prev,
      games: [...prev.games, game],
      activeGameId: game.id,
    }))
  }

  const handleDelete = () => {
    if (draft.games.length <= 1) return
    if (!window.confirm(`"${activeGame.name}" 게임을 삭제할까요?`)) return
    const nextGames = draft.games.filter((game) => game.id !== activeGame.id)
    updateDraft((prev) => ({
      ...prev,
      games: nextGames,
      activeGameId: nextGames[0].id,
    }))
  }

  const handleSave = async () => {
    const result = onSave(draft)
    if (result && typeof result.then === 'function') {
      await result
    }
    savedSnapshot.current = JSON.stringify(draft)
  }

  const handleClose = () => {
    if (isDirty && !window.confirm('변경 사항이 저장되지 않았습니다. 닫으시겠습니까?')) return
    onClose()
  }

  return (
    <div className="admin-overlay">
      <div className="admin-panel">
        <header className="admin-panel__header">
          <div>
            <p className="admin-panel__eyebrow">전체게임 · 전체 관리자</p>
            <h2>전체 게임 설정</h2>
          </div>
          <div className="admin-panel__header-actions">
            <button type="button" className="admin-panel__save" onClick={handleSave} disabled={!isDirty || saving}>
              {saving ? '저장 중…' : '저장'}
            </button>
            <button type="button" className="admin-panel__close" onClick={handleClose} disabled={saving}>
              닫기
            </button>
          </div>
        </header>

        {saveError && <p className="admin-panel__sync-error">{saveError}</p>}

        <section className="admin-panel__section">
          <label className="admin-field">
            <span>전체 관리자 PIN (4자리)</span>
            <input
              type="password"
              maxLength={4}
              value={draft.adminPin}
              onChange={(event) =>
                updateDraft({ adminPin: event.target.value.replace(/\D/g, '').slice(0, 4) })
              }
            />
          </label>
        </section>

        {activeGame ? (
          <>
            <section className="admin-panel__section admin-panel__games">
              <div className="admin-panel__row">
                <label className="admin-field admin-field--grow">
                  <span>게임 선택</span>
                  <select
                    value={activeGame.id}
                    onChange={(event) => updateDraft({ activeGameId: event.target.value })}
                  >
                    {draft.games.map((game) => (
                      <option key={game.id} value={game.id}>
                        {game.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={handleDuplicate}>복사</button>
                <button type="button" onClick={handleCreate}>새 게임</button>
                <button type="button" onClick={handleDelete} disabled={draft.games.length <= 1}>삭제</button>
              </div>

              <label className="admin-field">
                <span>게임 이름</span>
                <input
                  type="text"
                  value={activeGame.name}
                  onChange={(event) => updateActiveGame({ name: event.target.value })}
                />
              </label>

            </section>

            <section className="admin-panel__section">
              <div className="admin-panel__row admin-panel__row--between">
                <h3>레벨 / 블라인드</h3>
                <div className="admin-panel__row">
                  <button type="button" onClick={addLevel}>레벨 추가</button>
                  <button type="button" onClick={addBreak}>브레이크 추가</button>
                </div>
              </div>

              <div className="admin-level-bulk">
                <span className="admin-level-bulk__label">분 일괄</span>
                <input
                  type="number"
                  min="1"
                  aria-label="블라인드 분 일괄 적용"
                  value={bulkMinutes}
                  onChange={(event) => setBulkMinutes(Number(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      applyBulkMinutes()
                    }
                  }}
                />
                <button type="button" onClick={applyBulkMinutes}>일괄 적용</button>
              </div>

              <div className="admin-levels">
                {activeGame.levels.map((level, index) => (
                  level.isBreak ? (
                    <div key={`${activeGame.id}-${index}`} className="admin-level-row admin-level-row--break">
                      <span className="admin-level-row__type">브레이크</span>
                      <label>
                        <span>분</span>
                        <input
                          type="number"
                          min="1"
                          value={level.minutes}
                          onChange={(event) => updateLevel(index, 'minutes', Number(event.target.value))}
                        />
                      </label>
                      <button type="button" onClick={() => removeLevel(index)} disabled={activeGame.levels.length <= 1}>
                        삭제
                      </button>
                    </div>
                  ) : (
                    <div key={`${activeGame.id}-${index}`} className="admin-level-row">
                      <label>
                        <span>Lv</span>
                        <input
                          type="number"
                          min="1"
                          value={getPokerLevelNumber(activeGame.levels, index) ?? level.level}
                          readOnly
                          tabIndex={-1}
                          aria-readonly="true"
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
                          onChange={(event) => updateLevel(index, 'smallBlind', Number(event.target.value))}
                        />
                      </label>
                      <label>
                        <span>BB</span>
                        <input
                          type="number"
                          min="0"
                          value={level.bigBlind}
                          onChange={(event) => updateLevel(index, 'bigBlind', Number(event.target.value))}
                        />
                      </label>
                      <label>
                        <span>Ante</span>
                        <input
                          type="number"
                          min="0"
                          value={level.ante}
                          onChange={(event) => updateLevel(index, 'ante', Number(event.target.value))}
                        />
                      </label>
                      <button type="button" onClick={() => insertBreakAfter(index)}>
                        브레이크
                      </button>
                      <button type="button" onClick={() => removeLevel(index)} disabled={activeGame.levels.length <= 1}>
                        삭제
                      </button>
                    </div>
                  )
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="admin-panel__section">
            <p className="admin-panel__note">게임이 없습니다. 새 게임을 추가하세요.</p>
            <button type="button" onClick={handleCreate}>새 게임</button>
          </section>
        )}

        <footer className="admin-panel__footer">
          {isDirty ? (
            <p className="admin-panel__dirty">저장되지 않은 변경 사항이 있습니다.</p>
          ) : (
            <p>모든 변경 사항이 저장되었습니다.</p>
          )}
          <p>전체 게임은 저장 시 구글 시트에 반영되어 모든 기기에 동기화됩니다.</p>
        </footer>
      </div>
    </div>
  )
}

export function PinModal({ open, onClose, onSubmit, error, title = '관리자 PIN', hint = '' }) {
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
        <h2>{title}</h2>
        {hint ? <p className="pin-modal__hint">{hint}</p> : null}
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          placeholder="PIN"
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
