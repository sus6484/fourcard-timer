import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AdminPanel, { PinModal } from './components/AdminPanel.jsx'
import Controls from './components/Controls.jsx'
import GameSelector from './components/GameSelector.jsx'
import MemoPanel from './components/MemoPanel.jsx'
import { useTimer, useWakeLock } from './hooks/useTimer.js'
import { formatAnte, formatBlinds, formatTime } from './lib/presets.js'
import { getActiveGame, loadSettings, saveSettings } from './lib/settings.js'
import { playLevelComplete, playLevelWarning } from './lib/sound.js'

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
  const [levelIndex, setLevelIndex] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pinError, setPinError] = useState('')
  const [resetConfirm, setResetConfirm] = useState(false)
  const logoPressTimer = useRef(null)
  const logoPressStart = useRef(0)

  const activeGame = useMemo(() => getActiveGame(settings), [settings])
  const currentLevel = activeGame.levels[levelIndex] ?? activeGame.levels[0]
  const nextLevel = activeGame.levels[levelIndex + 1] ?? null
  const initialSeconds = (currentLevel?.minutes ?? 0) * 60

  const handleLevelComplete = useCallback(() => {
    playLevelComplete(currentLevel?.isBreak)
    if (levelIndex < activeGame.levels.length - 1) {
      setLevelIndex((index) => index + 1)
    }
  }, [activeGame.levels.length, currentLevel?.isBreak, levelIndex])

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
  }, [activeGame.id])

  useEffect(() => {
    reset(initialSeconds)
  }, [activeGame.id, levelIndex, initialSeconds, reset])

  const persistSettings = (nextSettings) => {
    setSettings(nextSettings)
  }

  const selectGame = (gameId) => {
    persistSettings({ ...settings, activeGameId: gameId })
    setMenuOpen(false)
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
      if (levelIndex < activeGame.levels.length - 1) setLevelIndex((index) => index + 1)
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

  const openAdminEntry = () => {
    setPinOpen(true)
    setPinError('')
  }

  const handleLogoPointerDown = () => {
    logoPressStart.current = Date.now()
    logoPressTimer.current = window.setTimeout(() => {
      openAdminEntry()
    }, 2000)
  }

  const handleLogoPointerUp = () => {
    window.clearTimeout(logoPressTimer.current)
    if (Date.now() - logoPressStart.current >= 2000) return
  }

  const handlePinSubmit = (pin) => {
    if (pin !== settings.adminPin) {
      setPinError('PIN이 올바르지 않습니다.')
      return
    }
    setPinOpen(false)
    setPinError('')
    setAdminOpen(true)
  }

  const levelLabel = currentLevel?.isBreak ? 'BREAK' : `LEVEL ${currentLevel?.level ?? 1}`
  const nextLevelLabel = nextLevel?.isBreak ? 'BREAK' : nextLevel ? `LEVEL ${nextLevel.level}` : '—'

  return (
    <div className="app-shell">
      <main className="timer-screen">
        <header className="timer-screen__top">
          <GameSelector
            games={settings.games}
            activeGameId={settings.activeGameId}
            open={menuOpen}
            onToggle={() => setMenuOpen((open) => !open)}
            onSelect={selectGame}
          />

          <button
            type="button"
            className="brand-lock"
            aria-label="FOURCARD logo"
            onPointerDown={handleLogoPointerDown}
            onPointerUp={handleLogoPointerUp}
            onPointerLeave={handleLogoPointerUp}
            onPointerCancel={handleLogoPointerUp}
          >
            <img src="/assets/logo.png" alt="" className="brand-lock__logo" />
            <div className="brand-lock__text">
              <span>FOURCARD</span>
              <strong>TEXAS HOLD&apos;EM</strong>
            </div>
          </button>

          <div className="timer-screen__level-block">
            <p className="timer-screen__level">{levelLabel}</p>
            <MemoPanel memo={activeGame.memo} editable={false} />
          </div>
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

        <button type="button" className="settings-entry" onClick={openAdminEntry}>
          설정
        </button>
      </main>

      <PinModal
        open={pinOpen}
        error={pinError}
        onClose={() => {
          setPinOpen(false)
          setPinError('')
        }}
        onSubmit={handlePinSubmit}
      />

      <AdminPanel
        open={adminOpen}
        games={settings.games}
        activeGameId={settings.activeGameId}
        adminPin={settings.adminPin}
        onClose={() => setAdminOpen(false)}
        onSavePin={(adminPin) => persistSettings({ ...settings, adminPin })}
        onSaveGames={(games) => persistSettings({ ...settings, games })}
        onSelectGame={(activeGameId) => persistSettings({ ...settings, activeGameId })}
      />
    </div>
  )
}
