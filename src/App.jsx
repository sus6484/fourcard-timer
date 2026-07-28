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
  startClockOffsetSync,
  stopClockOffsetSync,
  syncServerClockOffset,
  syncedNow,
} from './lib/serverClock.js'
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
  filterGamesForBranch,
  getActiveGame,
  loadSettings,
  saveSettings,
  selectGlobalGame,
  updateScreenMemo,
  updateMemoStyle,
  updateGlobalGames,
} from './lib/settings.js'
import {
  publishSession,
  subscribeSession,
} from './lib/sessionSync.js'
import {
  ensureAudioRunning,
  getAnnouncementVoice,
  getAudioDebugState,
  playBlindsUp,
  playBreakTime,
  playGameStart,
  setAnnouncementVoice,
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
  const [announcementVoice, setAnnouncementVoiceState] = useState(getAnnouncementVoice)
  const [globalSyncStatus, setGlobalSyncStatus] = useState('idle')
  const [globalSyncError, setGlobalSyncError] = useState('')
  const [presetsLinkStatus, setPresetsLinkStatus] = useState('idle')
  const [sessionLinkStatus, setSessionLinkStatus] = useState('idle')
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
  const localAdvanceRef = useRef(false)
  const applyingRemoteRef = useRef(false)
  const localAuthorityUntilRef = useRef(0)
  const lastPublishedRevisionRef = useRef(0)
  const lastTimerSyncKeyRef = useRef('')
  const activeBranchIdRef = useRef('')
  const authUidRef = useRef(authSession?.uid || '')
  const settingsRef = useRef(settings)
  const levelIndexRef = useRef(levelIndex)
  const levelsRef = useRef([])
  const resetRef = useRef(null)
  const publishTimerStateRef = useRef(null)

  const isAdmin = isAdminSession(authSession)
  const activeBranchId = authSession?.branchId || ''
  const authUid = authSession?.uid || ''
  // 프리셋 구독은 uid/지점만 바뀔 때 재연결 (auth 객체 참조 변경으로는 재구독하지 않음)
  const presetsViewerBranchId = isAdmin ? null : activeBranchId || null

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
    authUidRef.current = authUid
  }, [authUid])

  // Firestore 서버 절대 시간 offset — 로그인 후 백그라운드 유지
  useEffect(() => {
    if (!authUid || !isFirebaseConfigured()) {
      stopClockOffsetSync()
      return undefined
    }
    startClockOffsetSync()
    return () => {
      stopClockOffsetSync()
    }
  }, [authUid])

  // 지점 로그인 직후 localStorage에 남아 있는 타 지점 전용 프리셋을 바로 가립니다.
  useEffect(() => {
    if (!authUid || isAdmin) return
    if (!activeBranchId) return

    setSettings((current) => {
      const filtered = filterGamesForBranch(current.globalGames, activeBranchId)
      const activeVisible = filtered.some((game) => game.id === current.activeGlobalGameId)
      if (filtered.length === current.globalGames.length && activeVisible) {
        return current
      }
      return updateGlobalGames(current, filtered, current.activeGlobalGameId)
    })
  }, [authUid, isAdmin, activeBranchId])

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      return undefined
    }

    const unsubscribe = subscribeAuth(
      (session) => {
        // 동일 계정의 프로필 재전달은 state를 유지해 하위 이펙트/타이머 리셋을 막음
        setAuthSession((prev) => {
          if (!prev && !session) return prev
          if (
            prev &&
            session &&
            prev.uid === session.uid &&
            prev.branchId === session.branchId &&
            prev.role === session.role &&
            prev.displayName === session.displayName &&
            prev.username === session.username
          ) {
            return prev
          }
          return session
        })
      },
      (error) => {
        setLoginError(error?.message ?? '인증 상태를 확인하지 못했습니다.')
      },
    )
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!authUid) {
      setGlobalSyncStatus('idle')
      setPresetsLinkStatus('idle')
      return undefined
    }
    if (isFileProtocol()) {
      setGlobalSyncStatus('local')
      setPresetsLinkStatus('offline')
      return undefined
    }
    if (!isFirebaseConfigured()) {
      setGlobalSyncStatus('error')
      setGlobalSyncError('Firebase 설정이 없습니다. .env의 VITE_FIREBASE_* 값을 확인하세요.')
      setPresetsLinkStatus('offline')
      return undefined
    }

    setGlobalSyncStatus('loading')
    setGlobalSyncError('')
    setPresetsLinkStatus('connecting')

    const unsubscribe = subscribePresets(
      (remote) => {
        if (!remote.missing) {
          setSettings((current) =>
            applyRemoteGlobalSettings(current, remote, { branchId: presetsViewerBranchId }),
          )
        }
        setGlobalSyncStatus('ready')
        setGlobalSyncError('')
      },
      (error) => {
        setGlobalSyncStatus('error')
        setGlobalSyncError(error?.message ?? '전체 게임을 불러오지 못했습니다.')
      },
      (status) => {
        setPresetsLinkStatus(status)
        if (status === 'connected') {
          setGlobalSyncStatus('ready')
          setGlobalSyncError('')
        } else if (status === 'reconnecting' || status === 'connecting') {
          setGlobalSyncStatus((current) => (current === 'ready' ? 'ready' : 'loading'))
        } else if (status === 'offline') {
          setGlobalSyncStatus('error')
          setGlobalSyncError('네트워크 연결이 끊어졌습니다. 재연결을 시도합니다…')
        }
      },
    )

    return unsubscribe
  }, [authUid, presetsViewerBranchId])

  const activeGame = useMemo(() => getActiveGame(settings), [settings])
  const levels = activeGame?.levels ?? []
  const currentLevel = levels[levelIndex] ?? levels[0]
  const nextLevel = levels[levelIndex + 1] ?? null
  const initialSeconds = Math.max(0, Math.round((Number(currentLevel?.minutes) || 0) * 60))

  useEffect(() => {
    levelsRef.current = levels
  }, [levels])

  const levelSeconds = useCallback((level) => {
    const minutes = Number(level?.minutes)
    if (!Number.isFinite(minutes) || minutes <= 0) return 0
    return Math.round(minutes * 60)
  }, [])

  const findNextPlayableIndex = useCallback((fromIndex, schedule) => {
    let nextIndex = fromIndex + 1
    while (nextIndex < schedule.length && levelSeconds(schedule[nextIndex]) <= 0) {
      nextIndex += 1
    }
    return nextIndex
  }, [levelSeconds])

  const publishTimerState = useCallback(async (partial) => {
    const branchId = activeBranchIdRef.current
    const uid = authUidRef.current
    if (!branchId || !uid) return

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
        { uid },
      )
    } catch (error) {
      console.log('[session] publish failed:', error)
    }
  }, [])

  const completeHandlerRef = useRef(() => {})

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
    onComplete: () => completeHandlerRef.current?.(),
  })

  resetRef.current = reset
  publishTimerStateRef.current = publishTimerState

  const handleLevelComplete = useCallback(() => {
    const schedule = levelsRef.current
    if (!schedule.length) return

    const currentIndex = levelIndexRef.current
    const nextIndex = findNextPlayableIndex(currentIndex, schedule)

    if (nextIndex < schedule.length) {
      const upcoming = schedule[nextIndex]
      if (upcoming?.isBreak) playBreakTime()
      else playBlindsUp()

      const nextSeconds = levelSeconds(upcoming)
      localAdvanceRef.current = true
      autoStartNextLevelRef.current = false
      // 직후 들어오는 낡은 동기화 스냅샷이 레벨업을 되돌리지 못하게 합니다.
      localAuthorityUntilRef.current = Date.now() + 2000
      levelIndexRef.current = nextIndex
      setLevelIndex(nextIndex)

      const snapshot = reset(nextSeconds, { autoStart: true })
      publishTimerState({
        levelIndex: nextIndex,
        isRunning: snapshot.isRunning,
        endsAt: snapshot.endsAt,
        remainingSeconds: snapshot.remainingSeconds,
        activeGameId: settingsRef.current.activeGlobalGameId,
      })
      syncServerClockOffset(false)
      return
    }

    localAuthorityUntilRef.current = Date.now() + 2000
    publishTimerState({
      isRunning: false,
      endsAt: null,
      remainingSeconds: 0,
      levelIndex: currentIndex,
    })
  }, [findNextPlayableIndex, levelSeconds, publishTimerState, reset])

  completeHandlerRef.current = handleLevelComplete

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

  // 게임/레벨/지속시간이 실제로 바뀔 때만 로컬 타이머를 reset.
  // currentLevel 객체·publishTimerState 콜백 참조 변경으로는 절대 리셋하지 않음.
  useEffect(() => {
    const syncKey = `${activeGame?.id ?? ''}:${levelIndex}:${initialSeconds}`

    if (localAdvanceRef.current) {
      localAdvanceRef.current = false
      applyingRemoteRef.current = false
      lastTimerSyncKeyRef.current = syncKey
      return
    }

    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false
      lastTimerSyncKeyRef.current = syncKey
      return
    }

    // Firebase 프리셋 재수신 등으로 같은 키인데 effect만 다시 돈 경우 방어
    if (lastTimerSyncKeyRef.current === syncKey) {
      return
    }
    lastTimerSyncKeyRef.current = syncKey

    const seconds = initialSeconds
    const autoStart = autoStartNextLevelRef.current
    autoStartNextLevelRef.current = false
    const snapshot = resetRef.current?.(seconds, { autoStart: autoStart && seconds > 0 })

    if (autoStart && activeBranchIdRef.current && snapshot) {
      publishTimerStateRef.current?.({
        levelIndex: levelIndexRef.current,
        isRunning: snapshot.isRunning,
        endsAt: snapshot.endsAt,
        remainingSeconds: snapshot.remainingSeconds,
        activeGameId: settingsRef.current.activeGlobalGameId,
      })
    }
  }, [activeGame?.id, levelIndex, initialSeconds])

  useEffect(() => {
    if (!authUid || !activeBranchId) {
      setSessionLinkStatus('idle')
      return undefined
    }

    setSessionLinkStatus('connecting')

    const unsubscribe = subscribeSession(
      activeBranchId,
      (session) => {
        if (!session) return

        // 로컬에서 방금 레벨을 넘긴 직후에는 원격 덮어쓰기를 잠시 무시
        if (Date.now() < localAuthorityUntilRef.current) {
          return
        }

        const remoteRevision = Number(session.revision) || 0
        if (remoteRevision && remoteRevision <= lastPublishedRevisionRef.current) {
          return
        }

        const remoteLevelIndex = Number(session.levelIndex) || 0
        const remoteRunning = Boolean(session.isRunning)
        const remoteEndsAt = typeof session.endsAt === 'number' ? session.endsAt : null
        const remoteRemaining = remoteRunning && remoteEndsAt
          ? Math.max(0, Math.ceil((remoteEndsAt - syncedNow()) / 1000))
          : Math.max(0, Number(session.remainingSeconds) || 0)

        // 원격은 아직 running인데 endsAt이 지난 경우 → 로컬에서 레벨 완료 처리
        if (
          remoteRunning &&
          remoteRemaining <= 0 &&
          remoteLevelIndex === levelIndexRef.current
        ) {
          completeHandlerRef.current?.()
          return
        }

        // 로컬이 이미 다음 레벨로 넘어간 뒤 도착한 0초 스냅샷은 무시
        if (
          !remoteRunning &&
          remoteRemaining <= 0 &&
          remoteLevelIndex < levelIndexRef.current
        ) {
          return
        }

        // 같은 레벨의 0초 paused 스냅샷은 자동 레벨업을 가로채지 않도록 무시
        if (
          !remoteRunning &&
          remoteRemaining <= 0 &&
          remoteLevelIndex === levelIndexRef.current &&
          remoteLevelIndex < levelsRef.current.length - 1
        ) {
          completeHandlerRef.current?.()
          return
        }

        if (remoteRevision) {
          lastPublishedRevisionRef.current = Math.max(
            lastPublishedRevisionRef.current,
            remoteRevision,
          )
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

        if (remoteLevelIndex !== levelIndexRef.current) {
          skipLevelResetRef.current = true
          levelIndexRef.current = remoteLevelIndex
          setLevelIndex(remoteLevelIndex)
        }

        applyRemoteSession(session)
      },
      (error) => {
        console.log('[session] subscribe failed:', error)
      },
      (status) => {
        setSessionLinkStatus(status)
      },
    )

    return unsubscribe
  }, [authUid, activeBranchId, applyRemoteSession])

  const persistSettings = (nextSettings) => {
    setSettings(nextSettings)
  }

  const selectGlobal = (gameId) => {
    persistSettings(selectGlobalGame(settings, gameId))
    setGlobalMenuOpen(false)
    if (activeBranchId) {
      const game = settings.globalGames.find((item) => item.id === gameId)
      const seconds = levelSeconds(game?.levels?.[0])
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
        const seconds = levelSeconds(levels[nextIndex])
        publishTimerState({
          levelIndex: nextIndex,
          isRunning: false,
          endsAt: null,
          remainingSeconds: seconds,
        })
        syncServerClockOffset(false)
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
      // 시작/정지 시 서버 시계 offset 조용히 재측정
      syncServerClockOffset(true)
      return
    }
    if (action === 'next') {
      if (activeGame && levelIndex < levels.length - 1) {
        const nextIndex = findNextPlayableIndex(levelIndex, levels)
        if (nextIndex >= levels.length) return
        setLevelIndex(nextIndex)
        const seconds = levelSeconds(levels[nextIndex])
        publishTimerState({
          levelIndex: nextIndex,
          isRunning: false,
          endsAt: null,
          remainingSeconds: seconds,
        })
        syncServerClockOffset(false)
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
      syncServerClockOffset(false)
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
      syncServerClockOffset(false)
      return
    }
    if (action === 'reset') {
      if (!resetConfirm) {
        setResetConfirm(true)
        return
      }
      const firstLevelSeconds = levelSeconds(levels[0])
      setLevelIndex(0)
      reset(firstLevelSeconds)
      setResetConfirm(false)
      publishTimerState({
        levelIndex: 0,
        isRunning: false,
        endsAt: null,
        remainingSeconds: firstLevelSeconds,
      })
      syncServerClockOffset(true)
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
    // 설정은 항상 관리자 로그인(관리자 모드)을 거친 뒤에만 게임 수정 패널을 연다.
    setAdminOpen(false)
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
      const nextSettings = updateGlobalGames(settings, draft.games, draft.activeGameId)
      const result = await savePresetsToCloud({
        globalGames: nextSettings.globalGames,
      })

      persistSettings(withCloudUpdatedAt(nextSettings, result.updatedAt))

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

  // 관리자는 하단 상태 버튼에 표시하지 않음 (지점 로그인 시에만 지점명 표시)
  const sessionLabel =
    authSession && !isAdmin
      ? authSession?.displayName || authSession?.username || '지점'
      : ''

  const connectionBadge = useMemo(() => {
    if (!authSession) {
      return { tone: 'local', icon: '🔴', label: '로컬 모드' }
    }
    if (isFileProtocol() || !isFirebaseConfigured()) {
      return { tone: 'local', icon: '🔴', label: '로컬 모드' }
    }

    const links = [presetsLinkStatus]
    if (activeBranchId) links.push(sessionLinkStatus)

    if (links.some((status) => status === 'offline')) {
      return { tone: 'offline', icon: '🔴', label: '오프라인' }
    }
    if (links.some((status) => status === 'reconnecting' || status === 'connecting' || status === 'idle')) {
      return { tone: 'reconnecting', icon: '🟡', label: '재연결 중' }
    }
    if (links.every((status) => status === 'connected')) {
      return { tone: 'synced', icon: '🟢', label: '동기화 중' }
    }
    return { tone: 'offline', icon: '🔴', label: '오프라인' }
  }, [authSession, activeBranchId, presetsLinkStatus, sessionLinkStatus])

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

          <div
            className={`connection-badge connection-badge--${connectionBadge.tone}`}
            role="status"
            aria-live="polite"
            title={
              authSession
                ? `프리셋: ${presetsLinkStatus}${activeBranchId ? ` / 세션: ${sessionLinkStatus}` : ''}`
                : '지점 로그인 후 Firebase와 동기화됩니다'
            }
          >
            <span className="connection-badge__icon" aria-hidden="true">
              {connectionBadge.icon}
            </span>
            <span className="connection-badge__label">{connectionBadge.label}</span>
          </div>

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
                <label className="memo-panel__voice">
                  <select
                    className="memo-panel__voice-select"
                    value={announcementVoice}
                    aria-label="안내 음성 선택"
                    onChange={(event) => {
                      const next = setAnnouncementVoice(Number(event.target.value))
                      setAnnouncementVoiceState(next)
                    }}
                  >
                    <option value={1}>Voice 1</option>
                    <option value={2}>Voice 2</option>
                  </select>
                </label>
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
                    syncServerClockOffset(false)
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
