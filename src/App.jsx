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
import { hardReloadToLatest } from './lib/hardReload.js'
import {
  startClockOffsetSync,
  stopClockOffsetSync,
  syncServerClockOffset,
  calibrateOffsetFromStartedAt,
} from './lib/serverClock.js'
import {
  fetchPresetsFromCloud,
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
  buildPausedPatch,
  buildRunningAbsoluteEndsAtPatch,
  buildRunningServerStartPatch,
  deriveEndsAtFromSession,
  deriveRemainingFromSession,
  fetchSession,
  publishSession,
  subscribeSession,
  withDerivedEndsAt,
} from './lib/sessionSync.js'
import {
  ensureAudioRunning,
  getAudioDebugState,
  playDoorong,
  playTick,
  speakBreakTime,
  speakGameStart,
  speakNextLevelBlindsUp,
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
  const [presetsLinkStatus, setPresetsLinkStatus] = useState('idle')
  const [sessionLinkStatus, setSessionLinkStatus] = useState('idle')
  const [adminSaveError, setAdminSaveError] = useState('')
  const [adminSaving, setAdminSaving] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [branchLoginOpen, setBranchLoginOpen] = useState(false)
  const [branchLoginError, setBranchLoginError] = useState('')
  const [branchLoginLoading, setBranchLoginLoading] = useState(false)
  const [latestRefreshing, setLatestRefreshing] = useState(false)

  const autoStartNextLevelRef = useRef(false)
  const skipLevelResetRef = useRef(false)
  const localAdvanceRef = useRef(false)
  const applyingRemoteRef = useRef(false)
  const audioStartStartedRef = useRef(false)
  /** Metis-style cue marks: voice at 6s, ticks at 3·2·1 before level end. */
  const transitionCueMarksRef = useRef({})
  const prevRemainingForCueRef = useRef(null)
  const lastDoorongAtRef = useRef(0)
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
  const applyRemoteSessionRef = useRef(null)
  const syncFromServerClockRef = useRef(null)
  const applyIncomingSessionRef = useRef(null)
  const resumeSyncInFlightRef = useRef(null)
  const lastResumeSyncAtRef = useRef(0)
  const presetsViewerBranchIdRef = useRef(null)

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

  useEffect(() => {
    presetsViewerBranchIdRef.current = presetsViewerBranchId
  }, [presetsViewerBranchId])

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

  const resetTransitionCues = useCallback(() => {
    transitionCueMarksRef.current = {}
    prevRemainingForCueRef.current = null
  }, [])

  const playTransitionDoorong = useCallback(() => {
    const nowMs = Date.now()
    if (nowMs - lastDoorongAtRef.current < 800) return
    lastDoorongAtRef.current = nowMs
    ensureAudioRunning('doorong')
    playDoorong()
  }, [])

  /** Crossed a countdown threshold (Metis crossedThreshold). */
  const crossedThreshold = useCallback((prevSec, curSec, threshold) => {
    if (curSec == null) return false
    if (prevSec == null) return curSec <= threshold
    return prevSec > threshold && curSec <= threshold
  }, [])

  /**
   * Announce upcoming transition + 띵 countdown.
   * Metis: voice at 6s, ticks at 3·2·1 (only while on a non-break play level).
   */
  const runTransitionCues = useCallback(
    (prevSec, curSec, idPrefix, { speak, voiceAt = 6, tickHi = 3, tickLo = 1 } = {}) => {
      if (curSec == null) return
      const marks = transitionCueMarksRef.current

      if (voiceAt != null && typeof speak === 'function') {
        const vKey = `${idPrefix}-voice`
        if (!marks[vKey] && crossedThreshold(prevSec, curSec, voiceAt)) {
          marks[vKey] = true
          ensureAudioRunning('cue-voice')
          speak()
        }
      }

      for (let t = tickHi; t >= tickLo; t -= 1) {
        const tKey = `${idPrefix}-t${t}`
        if (!marks[tKey] && crossedThreshold(prevSec, curSec, t)) {
          marks[tKey] = true
          ensureAudioRunning('cue-tick')
          playTick()
        }
      }
    },
    [crossedThreshold],
  )

  const announceUpcomingLevel = useCallback(
    (upcoming) => {
      if (!upcoming) return
      if (upcoming.isBreak) speakBreakTime()
      else speakNextLevelBlindsUp()
    },
    [],
  )

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

  /**
   * startedAt: serverTimestamp() 발행 후 서버에 확정된 시각으로 로컬 타이머를 재정렬.
   * (자체 revision 스냅샷은 스킵되므로 getDocFromServer 로 강제 보정)
   */
  const reconcileAfterServerStart = useCallback(async () => {
    const branchId = activeBranchIdRef.current
    if (!branchId) return
    try {
      const session = await fetchSession(branchId)
      if (!session?.isRunning) return
      // 서버 startedAt 으로 offset 을 맞춘 뒤 endsAt 을 파생·적용
      if (typeof session.startedAt === 'number') {
        calibrateOffsetFromStartedAt(session.startedAt)
      }
      const derived = withDerivedEndsAt(session)
      if (typeof derived?.endsAt !== 'number') return
      applyRemoteSessionRef.current?.(derived)
      syncFromServerClockRef.current?.()
    } catch (error) {
      console.log('[session] reconcile after server start failed:', error)
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
    syncFromServerClock,
  } = useTimer(initialSeconds, {
    onComplete: (completedEndsAt) => completeHandlerRef.current?.(completedEndsAt),
  })

  resetRef.current = reset
  publishTimerStateRef.current = publishTimerState
  applyRemoteSessionRef.current = applyRemoteSession
  syncFromServerClockRef.current = syncFromServerClock

  useEffect(() => {
    resetTransitionCues()
  }, [levelIndex, activeGame?.id, resetTransitionCues])

  // Metis-style pre-transition cues while a play level is counting down.
  useEffect(() => {
    if (!isRunning) {
      prevRemainingForCueRef.current = null
      return
    }

    const schedule = levels
    const current = schedule[levelIndex]
    // Metis skips cues while on a break row.
    if (!current || current.isBreak) {
      prevRemainingForCueRef.current = remainingSeconds
      return
    }

    const nextIndex = findNextPlayableIndex(levelIndex, schedule)
    const upcoming = schedule[nextIndex]
    if (!upcoming) {
      prevRemainingForCueRef.current = remainingSeconds
      return
    }

    const prevSec = prevRemainingForCueRef.current
    const curSec = remainingSeconds
    prevRemainingForCueRef.current = curSec

    const toBreak = Boolean(upcoming.isBreak)
    const prefix = `${toBreak ? 'br' : 'lv'}-${levelIndex}`
    runTransitionCues(prevSec, curSec, prefix, {
      voiceAt: 6,
      speak: () => announceUpcomingLevel(upcoming),
      tickHi: 3,
      tickLo: 1,
    })
  }, [
    remainingSeconds,
    isRunning,
    levelIndex,
    levels,
    findNextPlayableIndex,
    runTransitionCues,
    announceUpcomingLevel,
  ])

  const handleLevelComplete = useCallback((completedEndsAt) => {
    const schedule = levelsRef.current
    if (!schedule.length) return

    const currentIndex = levelIndexRef.current
    const nextIndex = findNextPlayableIndex(currentIndex, schedule)

    if (nextIndex < schedule.length) {
      const upcoming = schedule[nextIndex]
      const current = schedule[currentIndex]
      const toBreak = Boolean(upcoming?.isBreak)
      const prefix = `${toBreak ? 'br' : 'lv'}-${currentIndex}`
      const voiceKey = `${prefix}-voice`
      // Fallback: short levels / skips may miss the 6s cue.
      if (!current?.isBreak && !transitionCueMarksRef.current[voiceKey]) {
        transitionCueMarksRef.current[voiceKey] = true
        announceUpcomingLevel(upcoming)
      }
      playTransitionDoorong()
      resetTransitionCues()

      const nextSeconds = levelSeconds(upcoming)
      localAdvanceRef.current = true
      autoStartNextLevelRef.current = false
      // 직후 들어오는 낡은 동기화 스냅샷이 레벨업을 되돌리지 못하게 합니다.
      localAuthorityUntilRef.current = Date.now() + 2000
      levelIndexRef.current = nextIndex
      setLevelIndex(nextIndex)

      // 자동 전환: 이전 레벨 절대 endsAt + duration (기기별 syncedNow 오차 누적 방지)
      const chainFromEndsAt =
        typeof completedEndsAt === 'number' && Number.isFinite(completedEndsAt)
          ? completedEndsAt
          : null
      const snapshot = reset(nextSeconds, {
        autoStart: true,
        chainFromEndsAt,
      })
      // 체인된 절대 endsAt 사용 (startedAt 아님 — 이미 서버 스케줄에 정렬됨)
      publishTimerState({
        levelIndex: nextIndex,
        activeGameId: settingsRef.current.activeGlobalGameId,
        ...buildRunningAbsoluteEndsAtPatch(
          snapshot.endsAt,
          snapshot.remainingSeconds,
        ),
      })
      // 로그인된 기기만 서버 시계 보정 (비로그인은 로컬 시각 fallback)
      if (authUidRef.current) {
        void syncServerClockOffset(false)
      }
      return
    }

    localAuthorityUntilRef.current = Date.now() + 2000
    publishTimerState({
      levelIndex: currentIndex,
      ...buildPausedPatch(0),
    })
  }, [
    announceUpcomingLevel,
    findNextPlayableIndex,
    levelSeconds,
    playTransitionDoorong,
    publishTimerState,
    reset,
    resetTransitionCues,
  ])

  completeHandlerRef.current = handleLevelComplete

  /**
   * Firestore 세션 스냅샷을 화면에 반영합니다.
   * 구독 콜백과 탭 복귀 시 강제 fetch가 동일 경로를 씁니다.
   */
  const applyIncomingSession = useCallback((session) => {
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

    // 시작 직후 startedAt 이 있으면 offset 을 서버 앵커에 맞춰 재보정 (15:04 류 오차 차단)
    // 남은 시간·만료 판정은 보정 이후에 수행한다.
    if (remoteRunning && typeof session.startedAt === 'number') {
      calibrateOffsetFromStartedAt(session.startedAt)
    }

    const remoteRemaining = deriveRemainingFromSession(session)
    const derivedEndsAt = deriveEndsAtFromSession(session)

    // 원격은 아직 running인데 endsAt이 지난 경우 → 로컬에서 레벨 완료 처리
    // 파생 endsAt 을 넘겨 다음 레벨 endsAt 체인에 사용
    if (
      remoteRunning &&
      remoteRemaining <= 0 &&
      remoteLevelIndex === levelIndexRef.current
    ) {
      completeHandlerRef.current?.(derivedEndsAt)
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
      completeHandlerRef.current?.(derivedEndsAt)
      return
    }

    // 원격이 이미 다음 레벨인데 그 레벨 endsAt도 지난 경우:
    // 레벨을 맞춘 뒤 타이머를 0으로 적용하고, 이어서 완료 처리로 따라잡습니다.
    const remoteExpiredOnOtherLevel =
      remoteRunning &&
      remoteRemaining <= 0 &&
      remoteLevelIndex !== levelIndexRef.current

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

    applyRemoteSessionRef.current?.(withDerivedEndsAt(session))

    if (remoteExpiredOnOtherLevel) {
      window.setTimeout(() => {
        completeHandlerRef.current?.(derivedEndsAt)
      }, 0)
    }
  }, [])

  applyIncomingSessionRef.current = applyIncomingSession

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
        activeGameId: settingsRef.current.activeGlobalGameId,
        ...buildRunningServerStartPatch(snapshot.remainingSeconds),
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
        applyIncomingSessionRef.current?.(session)
      },
      (error) => {
        console.log('[session] subscribe failed:', error)
      },
      (status) => {
        setSessionLinkStatus(status)
      },
    )

    return unsubscribe
  }, [authUid, activeBranchId])

  // Smart TV / 백그라운드 탭 복귀 시: 서버 시계·세션·프리셋 강제 동기화 (폴링 아님, 이벤트+쓰로틀)
  useEffect(() => {
    if (!authUid) return undefined

    /** 전체 서버 fetch(getDocFromServer + clock) 최소 간격 — 절전 플래핑 비용 상한 */
    const RESUME_SYNC_MIN_GAP_MS = 30 * 1000

    const resumeFromServer = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (resumeSyncInFlightRef.current) return

      const now = Date.now()
      if (now - lastResumeSyncAtRef.current < RESUME_SYNC_MIN_GAP_MS) {
        // 쓰로틀 안: Firestore Read 없이 로컬 endsAt 기준으로만 화면 보정
        syncFromServerClockRef.current?.()
        return
      }

      lastResumeSyncAtRef.current = now

      resumeSyncInFlightRef.current = (async () => {
        try {
          // force=false → serverClock 60초 가드 적용 (불필요한 clock 문서 R/W 억제)
          await syncServerClockOffset(false)
          syncFromServerClockRef.current?.()

          const branchId = activeBranchIdRef.current
          const viewerBranchId = presetsViewerBranchIdRef.current

          const presetsPromise = fetchPresetsFromCloud()
            .then((remote) => {
              if (!remote?.missing) {
                setSettings((current) =>
                  applyRemoteGlobalSettings(current, remote, { branchId: viewerBranchId }),
                )
              }
            })
            .catch((error) => {
              console.log('[presets] visibility resume sync failed:', error)
            })

          const sessionPromise = branchId
            ? fetchSession(branchId)
                .then((session) => {
                  if (session && activeBranchIdRef.current === branchId) {
                    applyIncomingSessionRef.current?.(session)
                  }
                })
                .catch((error) => {
                  console.log('[session] visibility resume sync failed:', error)
                })
            : Promise.resolve()

          await Promise.all([presetsPromise, sessionPromise])
        } catch (error) {
          console.log('[sync] visibility resume sync failed:', error)
        } finally {
          resumeSyncInFlightRef.current = null
        }
      })()

      await resumeSyncInFlightRef.current
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        resumeFromServer()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', resumeFromServer)
    window.addEventListener('pageshow', resumeFromServer)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', resumeFromServer)
      window.removeEventListener('pageshow', resumeFromServer)
    }
  }, [authUid, activeBranchId])

  const persistSettings = (nextSettings) => {
    setSettings(nextSettings)
  }

  /** Smart TV용: 서버 최신 프리셋/세션을 받은 뒤 페이지를 캐시 버스팅 새로고침 */
  const handleLoadLatestVersion = async () => {
    if (latestRefreshing) return
    setLatestRefreshing(true)

    try {
      if (authUid && isFirebaseConfigured() && !isFileProtocol()) {
        try {
          await syncServerClockOffset(true)
          syncFromServerClockRef.current?.()
        } catch (error) {
          console.log('[sync] latest clock sync failed:', error)
        }

        const viewerBranchId = presetsViewerBranchIdRef.current
        const branchId = activeBranchIdRef.current

        try {
          const remote = await fetchPresetsFromCloud()
          if (!remote?.missing) {
            const next = applyRemoteGlobalSettings(settingsRef.current, remote, {
              branchId: viewerBranchId,
            })
            setSettings(next)
            saveSettings(next)
          }
        } catch (error) {
          console.log('[presets] latest version fetch failed:', error)
        }

        if (branchId) {
          try {
            const session = await fetchSession(branchId)
            if (session && activeBranchIdRef.current === branchId) {
              applyIncomingSessionRef.current?.(session)
            }
          } catch (error) {
            console.log('[session] latest version fetch failed:', error)
          }
        }
      }
    } finally {
      await hardReloadToLatest({ reason: 'latest-version' })
    }
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
        ...buildPausedPatch(seconds),
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
          ...buildPausedPatch(seconds),
        })
        if (authUidRef.current) void syncServerClockOffset(false)
      }
      return
    }
    if (action === 'toggle') {
      if (!isRunning && levelIndex === 0 && remainingSeconds === initialSeconds) {
        speakGameStart()
      }
      const wasRunning = isRunning
      if (wasRunning) {
        // 정지: offset 보정 후 남은 초를 확정·발행
        void (async () => {
          if (authUidRef.current) {
            await syncServerClockOffset(true)
          }
          const snapshot = toggle()
          await publishTimerState({
            levelIndex,
            ...buildPausedPatch(snapshot.remainingSeconds),
          })
        })()
      } else {
        // 시작: UI 는 즉시, endsAt 기준점은 serverTimestamp 앵커로 확정
        const snapshot = toggle()
        void (async () => {
          if (authUidRef.current) {
            await syncServerClockOffset(true)
          }
          await publishTimerState({
            levelIndex,
            ...buildRunningServerStartPatch(snapshot.remainingSeconds),
          })
          await reconcileAfterServerStart()
        })()
      }
      return
    }
    if (action === 'next') {
      if (activeGame && levelIndex < levels.length - 1) {
        const nextIndex = findNextPlayableIndex(levelIndex, levels)
        if (nextIndex >= levels.length) return
        const upcoming = levels[nextIndex]
        const current = levels[levelIndex]
        if (!current?.isBreak) {
          announceUpcomingLevel(upcoming)
        }
        playTransitionDoorong()
        resetTransitionCues()
        const seconds = levelSeconds(upcoming)
        localAdvanceRef.current = true
        autoStartNextLevelRef.current = false
        localAuthorityUntilRef.current = Date.now() + 2000
        levelIndexRef.current = nextIndex
        setLevelIndex(nextIndex)
        void (async () => {
          if (authUidRef.current) {
            await syncServerClockOffset(true)
          }
          reset(seconds, { autoStart: true })
          await publishTimerState({
            levelIndex: nextIndex,
            ...buildRunningServerStartPatch(seconds),
          })
          await reconcileAfterServerStart()
        })()
      }
      return
    }
    if (action === 'minus10') {
      setResetConfirm(false)
      void (async () => {
        if (authUidRef.current) {
          await syncServerClockOffset(true)
        }
        const snapshot = adjustSeconds(-10)
        if (snapshot.isRunning) {
          await publishTimerState({
            levelIndex,
            ...buildRunningServerStartPatch(snapshot.remainingSeconds),
          })
          await reconcileAfterServerStart()
        } else {
          await publishTimerState({
            levelIndex,
            ...buildPausedPatch(snapshot.remainingSeconds),
          })
        }
      })()
      return
    }
    if (action === 'plus10') {
      setResetConfirm(false)
      void (async () => {
        if (authUidRef.current) {
          await syncServerClockOffset(true)
        }
        const snapshot = adjustSeconds(10)
        if (snapshot.isRunning) {
          await publishTimerState({
            levelIndex,
            ...buildRunningServerStartPatch(snapshot.remainingSeconds),
          })
          await reconcileAfterServerStart()
        } else {
          await publishTimerState({
            levelIndex,
            ...buildPausedPatch(snapshot.remainingSeconds),
          })
        }
      })()
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
        ...buildPausedPatch(firstLevelSeconds),
      })
      if (authUidRef.current) void syncServerClockOffset(true)
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
    // 메모만 갱신 — getSnapshot() endsAt 을 넣으면 startedAt 앵커와 충돌할 수 있음
    publishTimerState({
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

  const handleStartGame = (event) => {
    event?.preventDefault?.()
    // Ref guard: pointerdown + click can both fire before React re-renders.
    if (audioStartStartedRef.current || audioReady) return
    audioStartStartedRef.current = true

    console.log('[audio] start button gesture:', event?.type ?? 'unknown')
    // Dismiss overlay immediately — never wait on audio unlock / network.
    setAudioReady(true)

    // Keep unlock in the same gesture turn (starts sync until first await),
    // but do not block the UI if resume/fetch/decode hangs on mobile.
    void unlockAudio()
      .then(() => {
        console.log('[audio] start complete:', getAudioDebugState())
      })
      .catch((error) => {
        console.log('[audio] start failed:', error)
      })
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
                autoFocus
                onPointerDown={handleStartGame}
                onClick={handleStartGame}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ' || event.key === 'OK') {
                    handleStartGame(event)
                  }
                }}
              >
                게임 시작 (음소거 해제)
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

          <div className="connection-bar">
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
            <button
              type="button"
              className="connection-refresh-btn"
              disabled={latestRefreshing}
              onClick={handleLoadLatestVersion}
              title={`서버에서 최신 프리셋/세션을 받고 캐시를 비운 뒤 새로고침합니다${import.meta.env.VITE_APP_BUILD_ID ? ` (build ${import.meta.env.VITE_APP_BUILD_ID})` : ''}`}
            >
              {latestRefreshing ? '불러오는 중…' : '최신 버전'}
            </button>
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
                    void (async () => {
                      if (authUidRef.current) {
                        await syncServerClockOffset(true)
                      }
                      const snapshot = setSeconds(seconds)
                      if (snapshot.isRunning) {
                        await publishTimerState({
                          levelIndex,
                          ...buildRunningServerStartPatch(snapshot.remainingSeconds),
                        })
                        await reconcileAfterServerStart()
                      } else {
                        await publishTimerState({
                          levelIndex,
                          ...buildPausedPatch(snapshot.remainingSeconds),
                        })
                      }
                    })()
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
