import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AdminPanel, { PinModal } from './components/AdminPanel.jsx'
import Controls from './components/Controls.jsx'
import TimeScrubber from './components/TimeScrubber.jsx'
import MemoPanel from './components/MemoPanel.jsx'
import TopGameBar from './components/TopGameBar.jsx'
import { useTimer, useWakeLock } from './hooks/useTimer.js'
import { DESIGN_HEIGHT, DESIGN_WIDTH, useFitScale } from './hooks/useFitScale.js'
import logoUrl from '../image/logo.png'
import {
  fetchGlobalFromCloud,
  isFileProtocol,
  saveGlobalToCloud,
} from './lib/globalSync.js'
import { formatAnte, formatBlinds, formatTime, getScheduleLabel } from './lib/presets.js'
import {
  applyRemoteGlobalSettings,
  withCloudUpdatedAt,
  getActiveGame,
  loadSettings,
  saveSettings,
  selectGlobalGame,
  updateScreenMemo,
  updateMemoStyle,
} from './lib/settings.js'
import { playBlindsUp, playBreakTime, playGameStart } from './lib/sound.js'

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
  const [levelIndex, setLevelIndex] = useState(0)
  const [globalMenuOpen, setGlobalMenuOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pinError, setPinError] = useState('')
  const [resetConfirm, setResetConfirm] = useState(false)
  const [memoOpen, setMemoOpen] = useState(false)
  const [memoEditing, setMemoEditing] = useState(false)
  const [globalSyncStatus, setGlobalSyncStatus] = useState('loading')
  const [globalSyncError, setGlobalSyncError] = useState('')
  const [adminSaveError, setAdminSaveError] = useState('')
  const [adminSaving, setAdminSaving] = useState(false)
  const verifiedGlobalPin = useRef('')
  const autoStartNextLevelRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function syncGlobalOnBoot() {
      setGlobalSyncStatus('loading')
      setGlobalSyncError('')

      try {
        const remote = await fetchGlobalFromCloud()
        if (cancelled) return

        setSettings((current) => applyRemoteGlobalSettings(current, remote))
        setGlobalSyncStatus('ready')
      } catch (error) {
        if (cancelled) return
        if (isFileProtocol()) {
          setGlobalSyncStatus('local')
          return
        }
        setGlobalSyncStatus('error')
        setGlobalSyncError(error?.message ?? '전체 게임을 불러오지 못했습니다.')
      }
    }

    syncGlobalOnBoot()
    return () => {
      cancelled = true
    }
  }, [])

  const activeGame = useMemo(() => getActiveGame(settings), [settings])
  const levels = activeGame?.levels ?? []
  const currentLevel = levels[levelIndex] ?? levels[0]
  const nextLevel = levels[levelIndex + 1] ?? null
  const initialSeconds = (currentLevel?.minutes ?? 0) * 60

  const handleLevelComplete = useCallback(() => {
    if (!activeGame) return
    if (levelIndex < levels.length - 1) {
      const upcoming = levels[levelIndex + 1]
      if (upcoming?.isBreak) playBreakTime()
      else playBlindsUp()
      autoStartNextLevelRef.current = true
      setLevelIndex((index) => index + 1)
    }
  }, [activeGame, levelIndex, levels])

  const { remainingSeconds, isRunning, toggle, reset, adjustSeconds, setSeconds } = useTimer(initialSeconds, {
    onComplete: handleLevelComplete,
  })

  useWakeLock(isRunning)

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    setLevelIndex(0)
    setResetConfirm(false)
  }, [activeGame?.id])

  useEffect(() => {
    const autoStart = autoStartNextLevelRef.current
    autoStartNextLevelRef.current = false
    reset(initialSeconds, { autoStart })
  }, [activeGame?.id, levelIndex, initialSeconds, reset])

  const persistSettings = (nextSettings) => {
    setSettings(nextSettings)
  }

  const selectGlobal = (gameId) => {
    persistSettings(selectGlobalGame(settings, gameId))
    setGlobalMenuOpen(false)
  }

  const handleControl = (action) => {
    if (action === 'prev') {
      if (levelIndex > 0) setLevelIndex((index) => index - 1)
      return
    }
    if (action === 'toggle') {
      if (!isRunning && levelIndex === 0 && remainingSeconds === initialSeconds) {
        playGameStart()
      }
      toggle()
      return
    }
    if (action === 'next') {
      if (activeGame && levelIndex < levels.length - 1) setLevelIndex((index) => index + 1)
      return
    }
    if (action === 'minus10') {
      setResetConfirm(false)
      adjustSeconds(-10)
      return
    }
    if (action === 'plus10') {
      setResetConfirm(false)
      adjustSeconds(10)
      return
    }
    if (action === 'reset') {
      if (!resetConfirm) {
        setResetConfirm(true)
        return
      }
      const firstLevelSeconds = (levels[0]?.minutes ?? 0) * 60
      setLevelIndex(0)
      reset(firstLevelSeconds)
      setResetConfirm(false)
    }
  }

  const openGlobalSettings = () => {
    setPinError('')
    setPinOpen(true)
  }

  const handleGlobalPinSubmit = (pin) => {
    if (pin !== settings.adminPin) {
      setPinError('PIN이 올바르지 않습니다.')
      return
    }
    verifiedGlobalPin.current = pin
    setPinOpen(false)
    setPinError('')
    setAdminSaveError('')
    setAdminOpen(true)
  }

  const levelLabel = getScheduleLabel(levels, levelIndex)
  const nextLevelLabel = getScheduleLabel(levels, levelIndex + 1)

  const handleGlobalAdminSave = async (draft) => {
    setAdminSaving(true)
    setAdminSaveError('')

    try {
      const result = await saveGlobalToCloud({
        pin: verifiedGlobalPin.current || settings.adminPin,
        globalGames: draft.games,
        adminPin: draft.adminPin,
      })

      persistSettings(
        withCloudUpdatedAt(
          {
            ...settings,
            globalGames: draft.games,
            activeGlobalGameId: draft.activeGameId,
            adminPin: draft.adminPin,
          },
          result.updatedAt,
        ),
      )

      if (draft.adminPin !== verifiedGlobalPin.current) {
        verifiedGlobalPin.current = draft.adminPin
      }

      setGlobalSyncStatus('ready')
      setGlobalSyncError('')
    } catch (error) {
      setAdminSaveError(error?.message ?? '구글 시트 저장에 실패했습니다.')
      throw error
    } finally {
      setAdminSaving(false)
    }
  }

  const syncStatusLabel =
    globalSyncStatus === 'loading'
      ? '전체 게임 동기화 중…'
      : globalSyncStatus === 'error'
        ? '전체 게임 동기화 실패'
        : ''

  const stageScale = useFitScale(DESIGN_WIDTH, DESIGN_HEIGHT)

  return (
    <div className="app-shell">
      <div className="stage-viewport">
        <div
          className="stage-canvas"
          style={{
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
            transform: `scale(${stageScale})`,
          }}
        >
          {syncStatusLabel && (
            <p
              className={`app-sync-status app-sync-status--${globalSyncStatus === 'error' ? 'error' : globalSyncStatus}`}
              role="status"
            >
              {syncStatusLabel}
              {globalSyncStatus === 'error' && globalSyncError ? `: ${globalSyncError}` : ''}
            </p>
          )}

          <main className="timer-screen">
            <aside
              className={`timer-screen__memo-rail${memoOpen ? ' is-open' : ''}`}
              aria-label="메모"
            >
              <div className="memo-panel__actions">
                <button
                  type="button"
                  className={`memo-panel__action-btn${memoOpen ? ' is-active' : ''}`}
                  aria-expanded={memoOpen}
                  onClick={() => {
                    setMemoOpen((open) => {
                      if (open) setMemoEditing(false)
                      return !open
                    })
                  }}
                >
                  {memoOpen ? '닫기' : '메모'}
                </button>
                {memoEditing ? (
                  <button
                    type="button"
                    className="memo-panel__action-btn memo-panel__action-btn--primary"
                    onClick={() => setMemoEditing(false)}
                  >
                    완료
                  </button>
                ) : (
                  <button
                    type="button"
                    className="memo-panel__action-btn"
                    onClick={() => {
                      setMemoOpen(true)
                      setMemoEditing(true)
                    }}
                  >
                    수정
                  </button>
                )}
              </div>
              <MemoPanel
                open={memoOpen}
                editing={memoEditing}
                memo={settings.screenMemo}
                fontSize={settings.memoFontSize}
                color={settings.memoColor}
                onChange={(value) => persistSettings(updateScreenMemo(settings, value))}
                onFontSizeChange={(size) => persistSettings(updateMemoStyle(settings, { fontSize: size }))}
                onColorChange={(value) => persistSettings(updateMemoStyle(settings, { color: value }))}
              />
            </aside>

            <div className="timer-screen__watermark" aria-hidden="true">
              <img src={logoUrl} alt="" className="timer-screen__watermark-logo" />
            </div>

            <header className={`timer-screen__top${globalMenuOpen ? ' is-menu-open' : ''}`}>
              <div className="timer-screen__level-block">
                <p className="timer-screen__level">{levelLabel}</p>
              </div>

              <TopGameBar
                globalGames={settings.globalGames}
                activeGlobalGameId={settings.activeGlobalGameId}
                globalMenuOpen={globalMenuOpen}
                onToggleGlobalMenu={() => setGlobalMenuOpen((open) => !open)}
                onSelectGlobalGame={selectGlobal}
                onOpenGlobalSettings={openGlobalSettings}
              />
            </header>

            <section className="timer-screen__clock">
              <p className="timer-screen__time">{formatTime(remainingSeconds)}</p>
            </section>

            <footer className="timer-screen__bottom">
              <div className="info-card">
                <div className="info-card__row">
                  <span className="info-card__label">Blinds</span>
                  <strong>{formatBlinds(currentLevel)}</strong>
                </div>
                <div className="info-card__row">
                  <span className="info-card__label">Ante</span>
                  <strong>{formatAnte(currentLevel)}</strong>
                </div>
              </div>

              <div className="next-card">
                <div className="next-card__row">
                  <span className="next-card__label">Next</span>
                  <strong>{nextLevelLabel}</strong>
                </div>
                <div className="next-card__row">
                  <span className="next-card__label">Blinds</span>
                  <strong>{formatBlinds(nextLevel)}</strong>
                </div>
                <div className="next-card__row">
                  <span className="next-card__label">Ante</span>
                  <strong>{formatAnte(nextLevel)}</strong>
                </div>
                <Controls isRunning={isRunning} onAction={handleControl} />
                {resetConfirm && <p className="reset-hint">한 번 더 누르면 LEVEL 1부터 리셋됩니다</p>}
              </div>

              <div className="timer-screen__scrubber">
                <TimeScrubber
                  isRunning={isRunning}
                  remainingSeconds={remainingSeconds}
                  maxSeconds={Math.max(initialSeconds, remainingSeconds)}
                  onToggle={() => handleControl('toggle')}
                  onSeek={(seconds) => {
                    setResetConfirm(false)
                    setSeconds(seconds)
                  }}
                />
              </div>
            </footer>
          </main>

          <PinModal
            open={pinOpen}
            error={pinError}
            title="전체 관리자 PIN"
            onClose={() => {
              setPinOpen(false)
              setPinError('')
            }}
            onSubmit={handleGlobalPinSubmit}
          />

          <AdminPanel
            open={adminOpen}
            games={settings.globalGames}
            activeGameId={settings.activeGlobalGameId}
            adminPin={settings.adminPin}
            onClose={() => {
              setAdminOpen(false)
              setAdminSaveError('')
            }}
            onSave={handleGlobalAdminSave}
            saveError={adminSaveError}
            saving={adminSaving}
          />
        </div>
      </div>
    </div>
  )
}
