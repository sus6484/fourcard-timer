import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AdminPanel from './components/AdminPanel.jsx'
import BranchLoginScreen from './components/BranchLoginScreen.jsx'
import Controls from './components/Controls.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import TimeScrubber from './components/TimeScrubber.jsx'
import MemoPanel from './components/MemoPanel.jsx'
import TopGameBar from './components/TopGameBar.jsx'
import { useTimer, useWakeLock } from './hooks/useTimer.js'
import { DESIGN_HEIGHT, DESIGN_WIDTH, useFitScale } from './hooks/useFitScale.js'
import logoUrl from '../image/logo.png'
import {
  isAdminSession,
  loadCachedSession,
  loginWithBranchPassword,
  loginWithUsernamePassword,
  logout,
  subscribeAuth,
} from './lib/auth.js'
import { isFirebaseConfigured } from './lib/firebase.js'
import {
  isFileProtocol,
  savePresetsToCloud,
  subscribePresets,
} from './lib/presetsSync.js'
import {
  formatAnte,
  formatBlinds,
  formatTime,
  getScheduleLabel,
  getSecondsUntilNextBreak,
} from './lib/presets.js'
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
import {
  publishSession,
  subscribeSession,
} from './lib/sessionSync.js'
import {
  ensureAudioRunning,
  getAudioDebugState,
  playBlindsUp,
  playBreakTime,
  playGameStart,
  unlockAudio,
} from './lib/sound.js'

export default function App() {
  const [authSession, setAuthSession] = useState(() => loadCachedSession())
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [settings, setSettings] = useState(loadSettings)
  const [levelIndex, setLevelIndex] = useState(0)
  const [globalMenuOpen, setGlobalMenuOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [memoOpen, setMemoOpen] = useState(false)
  const [memoEditing, setMemoEditing] = useState(false)
  const [globalSyncStatus, setGlobalSyncStatus] = useState('idle')
  const [globalSyncError, setGlobalSyncError] = useState('')
  const [adminSaveError, setAdminSaveError] = useState('')
  const [adminSaving, setAdminSaving] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  const [audioUnlocking, setAudioUnlocking] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [branchLoginOpen, setBranchLoginOpen] = useState(false)
  const [branchLoginError, setBranchLoginError] = useState('')
  const [branchLoginLoading, setBranchLoginLoading] = useState(false)

  const autoStartNextLevelRef = useRef(false)
  const skipLevelResetRef = useRef(false)
  const applyingRemoteRef = useRef(false)
  const lastPublishedRevisionRef = useRef(0)
  const activeBranchIdRef = useRef('')
  const settingsRef = useRef(settings)
  const levelIndexRef = useRef(levelIndex)

  const isAdmin = isAdminSession(authSession)
  const activeBranchId = authSession?.branchId || ''

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    levelIndexRef.current = levelIndex
  }, [levelIndex])

  useEffect(() => {
    activeBranchIdRef.current = activeBranchId
  }, [activeBranchId])

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      return undefined
    }

    const unsubscribe = subscribeAuth(
      (session) => {
        setAuthSession(session)
      },
      (error) => {
        setLoginError(error?.message ?? '인증 상태를 확인하지 못했습니다.')
      },
    )
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!authSession) {
      setGlobalSyncStatus('idle')
      return undefined
    }
    if (isFileProtocol()) {
      setGlobalSyncStatus('local')
      return undefined
    }
    if (!isFirebaseConfigured()) {
      setGlobalSyncStatus('error')
      setGlobalSyncError('Firebase 설정이 없습니다. .env의 VITE_FIREBASE_* 값을 확인하세요.')
      return undefined
    }

    setGlobalSyncStatus('loading')
    setGlobalSyncError('')

    const unsubscribe = subscribePresets(
      (remote) => {
        if (!remote.missing) {
          setSettings((current) => applyRemoteGlobalSettings(current, remote))
        }
        setGlobalSyncStatus('ready')
        setGlobalSyncError('')
      },
      (error) => {
        setGlobalSyncStatus('error')
        setGlobalSyncError(error?.message ?? '전체 게임을 불러오지 못했습니다.')
      },
    )

    return unsubscribe
  }, [authSession])

  const activeGame = useMemo(() => getActiveGame(settings), [settings])
  const levels = activeGame?.levels ?? []
  const currentLevel = levels[levelIndex] ?? levels[0]
  const nextLevel = levels[levelIndex + 1] ?? null
  const initialSeconds = (currentLevel?.minutes ?? 0) * 60

  const publishTimerState = useCallback(async (partial) => {
    const branchId = activeBranchIdRef.current
    if (!branchId || !authSession) return

    const revision = Date.now()
    lastPublishedRevisionRef.current = revision

    try {
      await publishSession(
        branchId,
        {
          activeGameId: settingsRef.current.activeGlobalGameId,
          levelIndex: levelIndexRef.current,
          screenMemo: settingsRef.current.screenMemo,
          memoFontSize: settingsRef.current.memoFontSize,
          memoColor: settingsRef.current.memoColor,
          revision,
          ...partial,
        },
        { uid: authSession.uid },
      )
    } catch (error) {
      console.log('[session] publish failed:', error)
    }
  }, [authSession])

  const handleLevelComplete = useCallback(() => {
    if (!activeGame) return
    if (levelIndex < levels.length - 1) {
      const upcoming = levels[levelIndex + 1]
      if (upcoming?.isBreak) playBreakTime()
      else playBlindsUp()
      autoStartNextLevelRef.current = true
      setLevelIndex((index) => index + 1)
    } else {
      publishTimerState({
        isRunning: false,
        endsAt: null,
        remainingSeconds: 0,
        levelIndex,
      })
    }
  }, [activeGame, levelIndex, levels, publishTimerState])

  const {
    remainingSeconds,
    isRunning,
    toggle,
    reset,
    adjustSeconds,
    setSeconds,
    applyRemoteSession,
    getSnapshot,
  } = useTimer(initialSeconds, {
    onComplete: handleLevelComplete,
  })

  useWakeLock(isRunning)

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    if (skipLevelResetRef.current) {
      skipLevelResetRef.current = false
      return
    }
    setLevelIndex(0)
    setResetConfirm(false)
  }, [activeGame?.id])

  useEffect(() => {
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false
      return
    }

    const autoStart = autoStartNextLevelRef.current
    autoStartNextLevelRef.current = false
    const snapshot = reset(initialSeconds, { autoStart })

    if (autoStart && activeBranchIdRef.current) {
      publishTimerState({
        levelIndex: levelIndexRef.current,
        isRunning: snapshot.isRunning,
        endsAt: snapshot.endsAt,
        remainingSeconds: snapshot.remainingSeconds,
        activeGameId: settingsRef.current.activeGlobalGameId,
      })
    }
  }, [activeGame?.id, levelIndex, initialSeconds, reset, publishTimerState])

  useEffect(() => {
    if (!authSession || !activeBranchId) return undefined

    const unsubscribe = subscribeSession(
      activeBranchId,
      (session) => {
        if (!session) return
        if (session.revision && session.revision === lastPublishedRevisionRef.current) {
          return
        }

        applyingRemoteRef.current = true

        if (session.activeGameId && session.activeGameId !== settingsRef.current.activeGlobalGameId) {
          skipLevelResetRef.current = true
          setSettings((current) => selectGlobalGame(current, session.activeGameId))
        }

        if (typeof session.screenMemo === 'string') {
          setSettings((current) =>
            updateMemoStyle(updateScreenMemo(current, session.screenMemo), {
              fontSize: session.memoFontSize,
              color: session.memoColor,
            }),
          )
        }

        const nextLevelIndex = Number(session.levelIndex) || 0
        if (nextLevelIndex !== levelIndexRef.current) {
          skipLevelResetRef.current = true
          setLevelIndex(nextLevelIndex)
        }

        applyRemoteSession(session)
      },
      (error) => {
        console.log('[session] subscribe failed:', error)
      },
    )

    return unsubscribe
  }, [authSession, activeBranchId, applyRemoteSession])

  const persistSettings = (nextSettings) => {
    setSettings(nextSettings)
  }

  const selectGlobal = (gameId) => {
    persistSettings(selectGlobalGame(settings, gameId))
    setGlobalMenuOpen(false)
    if (activeBranchId) {
      const game = settings.globalGames.find((item) => item.id === gameId)
      const seconds = (game?.levels?.[0]?.minutes ?? 0) * 60
      publishTimerState({
        activeGameId: gameId,
        levelIndex: 0,
        isRunning: false,
        endsAt: null,
        remainingSeconds: seconds,
      })
    }
  }

  const handleControl = (action) => {
    ensureAudioRunning(`control:${action}`)

    if (action === 'prev') {
      if (levelIndex > 0) {
        const nextIndex = levelIndex - 1
        setLevelIndex(nextIndex)
        const seconds = (levels[nextIndex]?.minutes ?? 0) * 60
        publishTimerState({
          levelIndex: nextIndex,
          isRunning: false,
          endsAt: null,
          remainingSeconds: seconds,
        })
      }
      return
    }
    if (action === 'toggle') {
      if (!isRunning && levelIndex === 0 && remainingSeconds === initialSeconds) {
        playGameStart()
      }
      const snapshot = toggle()
      publishTimerState({
        levelIndex,
        isRunning: snapshot.isRunning,
        endsAt: snapshot.endsAt,
        remainingSeconds: snapshot.remainingSeconds,
      })
      return
    }
    if (action === 'next') {
      if (activeGame && levelIndex < levels.length - 1) {
        const nextIndex = levelIndex + 1
        setLevelIndex(nextIndex)
        const seconds = (levels[nextIndex]?.minutes ?? 0) * 60
        publishTimerState({
          levelIndex: nextIndex,
          isRunning: false,
          endsAt: null,
          remainingSeconds: seconds,
        })
      }
      return
    }
    if (action === 'minus10') {
      setResetConfirm(false)
      const snapshot = adjustSeconds(-10)
      publishTimerState({
        levelIndex,
        isRunning: snapshot.isRunning,
        endsAt: snapshot.endsAt,
        remainingSeconds: snapshot.remainingSeconds,
      })
      return
    }
    if (action === 'plus10') {
      setResetConfirm(false)
      const snapshot = adjustSeconds(10)
      publishTimerState({
        levelIndex,
        isRunning: snapshot.isRunning,
        endsAt: snapshot.endsAt,
        remainingSeconds: snapshot.remainingSeconds,
      })
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
      publishTimerState({
        levelIndex: 0,
        isRunning: false,
        endsAt: null,
        remainingSeconds: firstLevelSeconds,
      })
    }
  }

  const handleLogin = async ({ username, password }) => {
    setLoginLoading(true)
    setLoginError('')
    try {
      const session = await loginWithUsernamePassword(username, password)
      setAuthSession(session)
      setLoginOpen(false)
      if (isAdminSession(session)) {
        setAdminSaveError('')
        setAdminOpen(true)
      }
    } catch (error) {
      const message =
        error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password'
          ? '아이디 또는 비밀번호가 올바르지 않습니다.'
          : error?.message ?? '로그인에 실패했습니다.'
      setLoginError(message)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleBranchLogin = async ({ branchId, password }) => {
    setBranchLoginLoading(true)
    setBranchLoginError('')
    try {
      const session = await loginWithBranchPassword(branchId, password)
      setAuthSession(session)
      setBranchLoginOpen(false)
    } catch (error) {
      const message =
        error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password'
          ? '비밀번호가 올바르지 않습니다.'
          : error?.message ?? '지점 로그인에 실패했습니다.'
      setBranchLoginError(message)
    } finally {
      setBranchLoginLoading(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    setAuthSession(null)
    setAdminOpen(false)
    setLoginOpen(false)
    setBranchLoginOpen(false)
  }

  const handleOpenGlobalSettings = () => {
    if (isAdmin) {
      setAdminSaveError('')
      setAdminOpen(true)
      return
    }
    setLoginError('')
    setLoginOpen(true)
  }

  const handleOpenBranchLogin = () => {
    setBranchLoginError('')
    setBranchLoginOpen(true)
  }

  const handleCloseLogin = () => {
    if (loginLoading) return
    setLoginOpen(false)
    setLoginError('')
  }

  const handleCloseBranchLogin = () => {
    if (branchLoginLoading) return
    setBranchLoginOpen(false)
    setBranchLoginError('')
  }

  const handleGlobalAdminSave = async (draft) => {
    setAdminSaving(true)
    setAdminSaveError('')

    try {
      const result = await savePresetsToCloud({
        globalGames: draft.games,
      })

      persistSettings(
        withCloudUpdatedAt(
          {
            ...settings,
            globalGames: draft.games,
            activeGlobalGameId: draft.activeGameId,
          },
          result.updatedAt,
        ),
      )

      setGlobalSyncStatus('ready')
      setGlobalSyncError('')
    } catch (error) {
      setAdminSaveError(error?.message ?? 'Firebase 저장에 실패했습니다.')
      throw error
    } finally {
      setAdminSaving(false)
    }
  }

  const persistMemo = (nextSettings) => {
    persistSettings(nextSettings)
    if (!activeBranchId) return
    publishTimerState({
      ...getSnapshot(),
      levelIndex,
      screenMemo: nextSettings.screenMemo,
      memoFontSize: nextSettings.memoFontSize,
      memoColor: nextSettings.memoColor,
    })
  }

  const syncStatusLabel =
    globalSyncStatus === 'loading'
      ? 'Firebase 동기화 중…'
      : globalSyncStatus === 'error'
        ? 'Firebase 동기화 실패'
        : ''

  const sessionLabel = !authSession
    ? ''
    : isAdmin
      ? '관리자'
      : authSession?.displayName || authSession?.username || '지점'

  const stageScale = useFitScale(DESIGN_WIDTH, DESIGN_HEIGHT)
  const firebaseReady = isFirebaseConfigured()

  const handleStartGame = async (event) => {
    event?.preventDefault?.()
    if (audioUnlocking || audioReady) return

    console.log('[audio] start button gesture:', event?.type ?? 'unknown')
    setAudioUnlocking(true)
    try {
      await unlockAudio()
      console.log('[audio] start complete:', getAudioDebugState())
    } catch (error) {
      console.log('[audio] start failed:', error)
    } finally {
      setAudioReady(true)
      setAudioUnlocking(false)
    }
  }

  return (
    <div className="app-shell">
      <div className="stage-viewport">
        <div
          className="stage-slot"
          style={{
            width: DESIGN_WIDTH * stageScale,
            height: DESIGN_HEIGHT * stageScale,
          }}
        >
          <div
            className="stage-canvas"
            style={{
              width: DESIGN_WIDTH,
              height: DESIGN_HEIGHT,
              transform: `translate(-50%, -50%) scale(${stageScale})`,
            }}
          >
          {!audioReady && (
            <div className="start-overlay" role="dialog" aria-modal="true" aria-labelledby="start-overlay-title">
              <p id="start-overlay-title" className="start-overlay__eyebrow">
                FOURCARD Timer
              </p>
              <button
                type="button"
                className="start-overlay__btn"
                disabled={audioUnlocking}
                autoFocus
                onPointerDown={handleStartGame}
                onClick={handleStartGame}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ' || event.key === 'OK') {
                    handleStartGame(event)
                  }
                }}
              >
                {audioUnlocking ? '오디오 활성화 중…' : '게임 시작 (음소거 해제)'}
              </button>
              <p className="start-overlay__hint">
                이 버튼을 눌러 TV 브라우저 오디오를 활성화합니다
              </p>
            </div>
          )}

          {syncStatusLabel && (
            <p
              className={`app-sync-status app-sync-status--${globalSyncStatus === 'error' ? 'error' : globalSyncStatus}`}
              role="status"
            >
              {syncStatusLabel}
              {globalSyncStatus === 'error' && globalSyncError ? `: ${globalSyncError}` : ''}
            </p>
          )}

          <main className="timer-screen" aria-hidden={!audioReady}>
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
                onChange={(value) => persistMemo(updateScreenMemo(settings, value))}
                onFontSizeChange={(size) => persistMemo(updateMemoStyle(settings, { fontSize: size }))}
                onColorChange={(value) => persistMemo(updateMemoStyle(settings, { color: value }))}
              />
            </aside>

            <div className="timer-screen__watermark" aria-hidden="true">
              <img src={logoUrl} alt="" className="timer-screen__watermark-logo" />
            </div>

            <header className={`timer-screen__top${globalMenuOpen ? ' is-menu-open' : ''}`}>
              <div className="timer-screen__level-block">
                <p className="timer-screen__level">{getScheduleLabel(levels, levelIndex)}</p>
              </div>

              <TopGameBar
                globalGames={settings.globalGames}
                activeGlobalGameId={settings.activeGlobalGameId}
                globalMenuOpen={globalMenuOpen}
                onToggleGlobalMenu={() => setGlobalMenuOpen((open) => !open)}
                onSelectGlobalGame={selectGlobal}
                onOpenGlobalSettings={handleOpenGlobalSettings}
                onOpenBranchLogin={handleOpenBranchLogin}
                onLogout={handleLogout}
                isLoggedIn={Boolean(authSession)}
                sessionLabel={sessionLabel}
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
                  <strong>{getScheduleLabel(levels, levelIndex + 1)}</strong>
                </div>
                <div className="next-card__row">
                  <span className="next-card__label">Blinds</span>
                  <strong>{formatBlinds(nextLevel)}</strong>
                </div>
                <div className="next-card__row">
                  <span className="next-card__label">Ante</span>
                  <strong>{formatAnte(nextLevel)}</strong>
                </div>
                <div className="next-card__row next-card__row--break">
                  <span className="next-card__label">Next Break</span>
                  <strong>
                    {(() => {
                      const secondsUntilNextBreak = getSecondsUntilNextBreak(
                        levels,
                        levelIndex,
                        remainingSeconds,
                      )
                      return secondsUntilNextBreak != null ? formatTime(secondsUntilNextBreak) : '—'
                    })()}
                  </strong>
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
                    const snapshot = setSeconds(seconds)
                    publishTimerState({
                      levelIndex,
                      isRunning: snapshot.isRunning,
                      endsAt: snapshot.endsAt,
                      remainingSeconds: snapshot.remainingSeconds,
                    })
                  }}
                />
              </div>
            </footer>
          </main>

          {isAdmin ? (
            <AdminPanel
              open={adminOpen}
              games={settings.globalGames}
              activeGameId={settings.activeGlobalGameId}
              onClose={() => {
                setAdminOpen(false)
                setAdminSaveError('')
              }}
              onSave={handleGlobalAdminSave}
              saveError={adminSaveError}
              saving={adminSaving}
            />
          ) : null}
          </div>
        </div>
      </div>

      {loginOpen ? (
        <LoginScreen
          configured={firebaseReady}
          loading={loginLoading}
          error={loginError}
          onSubmit={handleLogin}
          onClose={handleCloseLogin}
        />
      ) : null}

      {branchLoginOpen ? (
        <BranchLoginScreen
          configured={firebaseReady}
          loading={branchLoginLoading}
          error={branchLoginError}
          onSubmit={handleBranchLogin}
          onClose={handleCloseBranchLogin}
          canCreateAccounts={isAdmin}
        />
      ) : null}
    </div>
  )
}
