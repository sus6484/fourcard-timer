import { useEffect, useMemo, useRef, useState } from 'react'
import { cloneBranches } from '../lib/branches.js'
import { cloneGame, createGame, createLevel, duplicateGame } from '../lib/presets.js'

function emptyLevel(levelNumber) {
  return createLevel(levelNumber, 8, 100, 200)
}

function cloneGamesList(games) {
  return games.map(cloneGame)
}

function createDraft({ games, activeGameId, adminPin, branches }) {
  return {
    games: cloneGamesList(games),
    activeGameId,
    adminPin,
    branches: branches ? cloneBranches(branches) : null,
  }
}

export default function AdminPanel({
  open,
  tier,
  games,
  activeGameId,
  adminPin,
  branches,
  branchCode,
  onClose,
  onSave,
  saveError = '',
  saving = false,
}) {
  const [draft, setDraft] = useState(null)
  const [branchSettingsOpen, setBranchSettingsOpen] = useState(false)
  const [bulkMinutes, setBulkMinutes] = useState(8)
  const savedSnapshot = useRef('')

  useEffect(() => {
    if (!open) {
      setBranchSettingsOpen(false)
      return
    }
    const nextDraft = createDraft({
      games,
      activeGameId,
      adminPin,
      branches: tier === 'global' ? branches : null,
    })
    setDraft(nextDraft)
    savedSnapshot.current = JSON.stringify(nextDraft)
    setBranchSettingsOpen(false)
  }, [open, tier, games, activeGameId, adminPin, branches, branchCode])

  useEffect(() => {
    if (!open || !draft) return
    const game = draft.games.find((g) => g.id === draft.activeGameId) ?? draft.games[0]
    if (game?.levels?.length) {
      setBulkMinutes(game.levels[0].minutes)
    }
  }, [open, draft?.activeGameId, draft?.games])

  const isDirty = useMemo(() => {
    if (!draft) return false
    return JSON.stringify(draft) !== savedSnapshot.current
  }, [draft])

  if (!open || !draft) return null

  const activeGame = draft.games.find((game) => game.id === draft.activeGameId) ?? draft.games[0]
  const isGlobal = tier === 'global'
  const branchCount = draft.branches ? Object.keys(draft.branches).length : 0
  const title = isGlobal ? '전체 게임 설정' : '지점 게임 설정'
  const eyebrow = isGlobal ? '전체게임 · 전체 관리자' : `지점게임 · ${branchCode ?? '지점'}`

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
    const game = createGame(`custom-${Date.now()}`, '새 게임', [emptyLevel(1)], { custom: true })
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

  const updateBranch = (code, field, value) => {
    updateDraft((prev) => ({
      ...prev,
      branches: {
        ...prev.branches,
        [code]: { ...prev.branches[code], [field]: value },
      },
    }))
  }

  const addBranch = () => {
    updateDraft((prev) => {
      const code = `FC${String(Object.keys(prev.branches).length + 1).padStart(3, '0')}`
      return {
        ...prev,
        branches: {
          ...prev.branches,
          [code]: { name: '새 지점', pin: '0000' },
        },
      }
    })
  }

  const removeBranch = (code) => {
    if (Object.keys(draft.branches).length <= 1) return
    if (!window.confirm(`${code} 지점을 삭제할까요?`)) return
    updateDraft((prev) => {
      const next = { ...prev.branches }
      delete next[code]
      return { ...prev, branches: next }
    })
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

  const handleCloseBranchSettings = () => {
    setBranchSettingsOpen(false)
  }

  return (
    <>
    <div className="admin-overlay">
      <div className="admin-panel">
        <header className="admin-panel__header">
          <div>
            <p className="admin-panel__eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
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
            <span>{isGlobal ? '전체 관리자 PIN (4자리)' : '지점 관리 PIN (4자리)'}</span>
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

        {isGlobal && draft.branches && (
          <section className="admin-panel__section">
            <button
              type="button"
              className="admin-panel__nav-btn"
              onClick={() => setBranchSettingsOpen(true)}
            >
              <span className="admin-panel__nav-btn-label">지점 코드 설정</span>
              <span className="admin-panel__nav-btn-meta">{branchCount}개 지점</span>
            </button>
          </section>
        )}

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
                <button type="button" onClick={addLevel}>레벨 추가</button>
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
          </>
        ) : (
          <section className="admin-panel__section">
            <p className="admin-panel__note">지점 게임이 없습니다. 새 게임을 추가하세요.</p>
            <button type="button" onClick={handleCreate}>새 게임</button>
          </section>
        )}

        <footer className="admin-panel__footer">
          {isDirty ? (
            <p className="admin-panel__dirty">저장되지 않은 변경 사항이 있습니다.</p>
          ) : (
            <p>모든 변경 사항이 저장되었습니다.</p>
          )}
          {isGlobal ? (
            <p>전체 게임은 저장 시 구글 시트에 반영되어 모든 기기에 동기화됩니다. 지점 코드는 이 기기에만 저장됩니다.</p>
          ) : (
            <p>지점 게임은 이 기기의 localStorage에만 저장되며 구글 시트로 전송되지 않습니다.</p>
          )}
        </footer>
      </div>
    </div>

    {branchSettingsOpen && draft.branches && (
      <div className="admin-overlay admin-overlay--stack">
        <div className="admin-panel">
          <header className="admin-panel__header">
            <div>
              <button type="button" className="admin-panel__back" onClick={handleCloseBranchSettings}>
                ← 전체 게임 설정
              </button>
              <p className="admin-panel__eyebrow">전체게임 · 전체 관리자</p>
              <h2>지점 코드 설정</h2>
            </div>
            <div className="admin-panel__header-actions">
              <button type="button" className="admin-panel__save" onClick={handleSave} disabled={!isDirty || saving}>
                {saving ? '저장 중…' : '저장'}
              </button>
              <button type="button" className="admin-panel__close" onClick={handleCloseBranchSettings} disabled={saving}>
                닫기
              </button>
            </div>
          </header>

          <section className="admin-panel__section">
            <div className="admin-panel__row admin-panel__row--between">
              <p className="admin-panel__note">
                지점게임 로그인에 사용됩니다. 전 지점에 동일하게 배포·미러링됩니다.
              </p>
              <button type="button" onClick={addBranch}>지점 추가</button>
            </div>
            <div className="admin-branches">
              {Object.entries(draft.branches).map(([code, branch]) => (
                <div key={code} className="admin-branch-row">
                  <label>
                    <span>코드</span>
                    <input type="text" value={code} readOnly />
                  </label>
                  <label>
                    <span>지점명</span>
                    <input
                      type="text"
                      value={branch.name}
                      onChange={(event) => updateBranch(code, 'name', event.target.value)}
                    />
                  </label>
                  <label>
                    <span>PIN</span>
                    <input
                      type="password"
                      maxLength={4}
                      value={branch.pin}
                      onChange={(event) =>
                        updateBranch(code, 'pin', event.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                    />
                  </label>
                  <button type="button" onClick={() => removeBranch(code)} disabled={Object.keys(draft.branches).length <= 1}>
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </section>

          <footer className="admin-panel__footer">
            {isDirty ? (
              <p className="admin-panel__dirty">저장되지 않은 변경 사항이 있습니다.</p>
            ) : (
              <p>모든 변경 사항이 저장되었습니다.</p>
            )}
            <p>지점 코드는 이 기기의 localStorage에만 저장됩니다.</p>
          </footer>
        </div>
      </div>
    )}
    </>
  )
}

export function PinModal({ open, onClose, onSubmit, error, title = '관리자 PIN', hint = '처음 사용 시 기본 PIN: 0000' }) {
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
        <p className="pin-modal__hint">{hint}</p>
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

export function BranchLoginModal({ open, onClose, onSubmit, error }) {
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')

  if (!open) return null

  return (
    <div className="pin-overlay">
      <form
        className="pin-modal pin-modal--wide"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(code, pin)
          setCode('')
          setPin('')
        }}
      >
        <h2>지점 로그인</h2>
        <p className="pin-modal__hint">지점 코드와 PIN을 입력하면 지점게임이 표시됩니다.</p>
        <label className="admin-field">
          <span>지점 코드</span>
          <input
            autoFocus
            type="text"
            value={code}
            placeholder="FC001"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </label>
        <label className="admin-field">
          <span>지점 PIN</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            placeholder="0000"
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </label>
        {error && <p className="pin-modal__error">{error}</p>}
        <div className="pin-modal__actions">
          <button type="button" onClick={onClose}>취소</button>
          <button type="submit">로그인</button>
        </div>
      </form>
    </div>
  )
}
