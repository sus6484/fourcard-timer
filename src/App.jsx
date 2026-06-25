import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AdminPanel, { PinModal } from './components/AdminPanel.jsx'
import Controls from './components/Controls.jsx'
import MemoPanel from './components/MemoPanel.jsx'
import TopGameBar from './components/TopGameBar.jsx'
import { useTimer, useWakeLock } from './hooks/useTimer.js'
import logoUrl from '../image/logo.png'
import {
  fetchGlobalFromCloud,
  getNetworkSyncBlockedReason,
  saveGlobalToCloud,
} from './lib/globalSync.js'
import { formatAnte, formatBlinds, formatTime } from './lib/presets.js'
import {
  applyRemoteGlobalSettings,
  withCloudUpdatedAt,
  getActiveGame,
  loadSettings,
  saveSettings,
  selectGlobalGame,
  updateScreenMemo,
} from './lib/settings.js'
import { playLevelComplete, playLevelWarning } from './lib/sound.js'

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
  const [levelIndex, setLevelIndex] = useState(0)
  const [globalMenuOpen, setGlobalMenuOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pinError, setPinError] = useState('')
  const [resetConfirm, setResetConfirm] = useState(false)
  const [memoOpen, setMemoOpen] = useState(false)
  const [globalSyncStatus, setGlobalSyncStatus] = useState('loading')
  const [globalSyncError, setGlobalSyncError] = useState('')
  const [adminSaveError, setAdminSaveError] = useState('')
  const [adminSaving, setAdminSaving] = useState(false)
  const verifiedGlobalPin = useRef('')

  useEffect(() => {
    let cancelled = false
    const blocked = getNetworkSyncBlockedReason()

    if (blocked) {
      setGlobalSyncStatus('local')
      return undefined
    }

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
    playLevelComplete(currentLevel?.isBreak)
    if (levelIndex < levels.length - 1) {
      setLevelIndex((index) => index + 1)
    }
  }, [activeGame, currentLevel?.isBreak, levelIndex, levels.length])

  const handleMinuteWarning = useCallback(() => {
    playLevelWarning(currentLevel?.isBreak)
  }, [currentLevel?.isBreak])

  const { remainingSeconds, isRunning, toggle, reset, adjustSeconds } = useTimer(initialSeconds, {
    onComplete: handleLevelComplete,
    onMinuteWarning: handleMinuteWarning,
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
    reset(initialSeconds)
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
      toggle()
      return
    }
    if (action === 'forward') {
      adjustSeconds(60)
      return
    }
    if (action === 'next') {
      if (activeGame && levelIndex < levels.length - 1) setLevelIndex((index) => index + 1)
      return
    }
    if (action === 'reset') {
      if (!resetConfirm) {
        setResetConfirm(true)
        return
      }
      reset(initialSeconds)
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

  const levelLabel = currentLevel?.isBreak ? 'BREAK' : `LEVEL ${currentLevel?.level ?? 1}`
  const nextLevelLabel = nextLevel?.isBreak ? 'BREAK' : nextLevel ? `LEVEL ${nextLevel.level}` : '—'

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
        : globalSyncStatus === 'blocked'
          ? '구글 시트 연동 불가'
          : ''
  const syncStatusDetail =
    globalSyncStatus === 'error' || globalSyncStatus === 'blocked' ? globalSyncError : ''

  return (
    <div className="app-shell">
      {syncStatusLabel && (
        <p
          className={`app-sync-status app-sync-status--${globalSyncStatus === 'blocked' ? 'blocked' : globalSyncStatus === 'error' ? 'error' : globalSyncStatus}`}
          role="status"
        >
          {syncStatusLabel}
          {syncStatusDetail ? `: ${syncStatusDetail}` : ''}
        </p>
      )}

      <main className="timer-screen">
        <aside
          className={`timer-screen__memo-rail${memoOpen ? ' is-open' : ''}`}
          aria-label="메모"
        >
          <button
            type="button"
            className={`memo-panel__toggle${memoOpen ? ' is-active' : ''}`}
            aria-expanded={memoOpen}
            onClick={() => setMemoOpen((open) => !open)}
          >
            메모
          </button>
          <MemoPanel
            open={memoOpen}
            memo={settings.screenMemo}
            onChange={(value) => persistSettings(updateScreenMemo(settings, value))}
          />
        </aside>

        <header className="timer-screen__top">
          <div className="timer-screen__level-block">
            <p className="timer-screen__level">{levelLabel}</p>
          </div>

          <div className="brand-lock" aria-label="FOURCARD logo">
            <img src={logoUrl} alt="" className="brand-lock__logo" />
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
            {resetConfirm && <p className="reset-hint">한 번 더 누르면 리셋됩니다</p>}
          </div>
        </footer>

      </main>

      <PinModal
        open={pinOpen}
        error={pinError}
        title="전체 관리자 PIN"
        hint="전체게임 · 기본 PIN: 0000"
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
  )
}
