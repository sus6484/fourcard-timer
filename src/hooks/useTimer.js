import { useCallback, useEffect, useRef, useState } from 'react'
import { syncedNow } from '../lib/serverClock.js'

function remainingFromEndsAt(endsAt, now = syncedNow()) {
  if (typeof endsAt !== 'number') return 0
  return Math.max(0, Math.ceil((endsAt - now) / 1000))
}

export function useTimer(initialSeconds, { onComplete } = {}) {
  const [remainingSeconds, setRemainingSeconds] = useState(initialSeconds)
  const [isRunning, setIsRunning] = useState(false)
  const endTimeRef = useRef(null)
  const isRunningRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  const suppressCompleteRef = useRef(false)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    isRunningRef.current = isRunning
  }, [isRunning])

  /**
   * endsAt(서버 동기화 시각) 기준으로 남은 시간을 즉시 재계산합니다.
   * setInterval이 스로틀돼도 탭 복귀·포커스 시 이 경로로 따라잡습니다.
   */
  const syncFromServerClock = useCallback(() => {
    if (!isRunningRef.current || !endTimeRef.current) return

    const nextRemaining = remainingFromEndsAt(endTimeRef.current)
    setRemainingSeconds(nextRemaining)

    if (nextRemaining <= 0) {
      setIsRunning(false)
      isRunningRef.current = false
      endTimeRef.current = null
      if (!suppressCompleteRef.current) {
        onCompleteRef.current?.()
      }
      suppressCompleteRef.current = false
      // onComplete → reset({ autoStart: true }) 가 동기적으로 endTimeRef 를 다시 심을 수 있다.
      // isRunning 이 true→false→true 로 배칭되면 useEffect 가 스킵되어
      // isRunningRef 가 false 에 남고 틱이 영구 정지한다. 동기 복구가 필수.
      if (endTimeRef.current) {
        isRunningRef.current = true
        setIsRunning(true)
      }
    }
  }, [])

  useEffect(() => {
    if (!isRunning) return undefined

    const tick = () => {
      syncFromServerClock()
    }

    tick()
    const intervalId = window.setInterval(tick, 200)
    return () => window.clearInterval(intervalId)
  }, [isRunning, syncFromServerClock])

  // 백그라운드 스로틀 후 복귀 시 즉시 서버 시각 기준으로 보정
  useEffect(() => {
    const catchUp = () => {
      if (document.visibilityState === 'visible') {
        syncFromServerClock()
      }
    }

    document.addEventListener('visibilitychange', catchUp)
    window.addEventListener('focus', catchUp)
    window.addEventListener('pageshow', catchUp)
    return () => {
      document.removeEventListener('visibilitychange', catchUp)
      window.removeEventListener('focus', catchUp)
      window.removeEventListener('pageshow', catchUp)
    }
  }, [syncFromServerClock])

  const start = useCallback(() => {
    endTimeRef.current = syncedNow() + remainingSeconds * 1000
    isRunningRef.current = true
    setIsRunning(true)
    return endTimeRef.current
  }, [remainingSeconds])

  const pause = useCallback(() => {
    if (!isRunning || !endTimeRef.current) {
      return remainingSeconds
    }
    const nextRemaining = remainingFromEndsAt(endTimeRef.current)
    setRemainingSeconds(nextRemaining)
    isRunningRef.current = false
    setIsRunning(false)
    endTimeRef.current = null
    return nextRemaining
  }, [isRunning, remainingSeconds])

  const toggle = useCallback(() => {
    if (isRunning) {
      return { isRunning: false, remainingSeconds: pause(), endsAt: null }
    }
    const endsAt = start()
    return { isRunning: true, remainingSeconds, endsAt }
  }, [isRunning, pause, remainingSeconds, start])

  const reset = useCallback((seconds = initialSeconds, { autoStart = false } = {}) => {
    const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
    setRemainingSeconds(safeSeconds)
    if (autoStart && safeSeconds > 0) {
      endTimeRef.current = syncedNow() + safeSeconds * 1000
      isRunningRef.current = true
      setIsRunning(true)
      return { isRunning: true, remainingSeconds: safeSeconds, endsAt: endTimeRef.current }
    }
    isRunningRef.current = false
    setIsRunning(false)
    endTimeRef.current = null
    return { isRunning: false, remainingSeconds: safeSeconds, endsAt: null }
  }, [initialSeconds])

  const adjustSeconds = useCallback((delta) => {
    let nextValue = 0
    let nextEndsAt = null
    setRemainingSeconds((current) => {
      const base = isRunning && endTimeRef.current
        ? remainingFromEndsAt(endTimeRef.current)
        : current
      nextValue = Math.max(0, base + delta)
      if (isRunning) {
        nextEndsAt = syncedNow() + nextValue * 1000
        endTimeRef.current = nextEndsAt
      }
      return nextValue
    })
    return {
      isRunning,
      remainingSeconds: nextValue,
      endsAt: isRunning ? nextEndsAt : null,
    }
  }, [isRunning])

  const setSeconds = useCallback((seconds) => {
    const next = Math.max(0, Math.round(seconds))
    setRemainingSeconds(next)

    if (next <= 0) {
      isRunningRef.current = false
      setIsRunning(false)
      endTimeRef.current = null
      onCompleteRef.current?.()
      // 블라인드 자동 전환이 endTimeRef 를 다시 심었으면 틱이 멈추지 않게 복구
      if (endTimeRef.current) {
        isRunningRef.current = true
        setIsRunning(true)
      }
      return { isRunning: false, remainingSeconds: 0, endsAt: null }
    }

    if (isRunning) {
      endTimeRef.current = syncedNow() + next * 1000
      isRunningRef.current = true
      return { isRunning: true, remainingSeconds: next, endsAt: endTimeRef.current }
    }

    return { isRunning: false, remainingSeconds: next, endsAt: null }
  }, [isRunning])

  /**
   * Firestore 세션을 로컬 타이머에 반영합니다.
   * 같은 기기에서 방금 발행한 revision은 호출측에서 스킵하세요.
   * 남은 시간은 항상 endsAt − syncedNow() 로 계산합니다.
   */
  const applyRemoteSession = useCallback((session) => {
    if (!session) return

    const remoteRunning = Boolean(session.isRunning)
    const remoteEndsAt = typeof session.endsAt === 'number' ? session.endsAt : null
    const remoteRemaining = remoteRunning && remoteEndsAt
      ? remainingFromEndsAt(remoteEndsAt)
      : Math.max(0, Number(session.remainingSeconds) || 0)

    // 만료된 running 세션은 타이머를 0으로 맞춘 뒤, 호출측에서 레벨 완료로 처리합니다.
    // (이전처럼 early return 하면 레벨만 바뀌고 카운트다운이 멈춘 채로 남을 수 있음)
    if (remoteRunning && remoteRemaining <= 0) {
      suppressCompleteRef.current = true
      setRemainingSeconds(0)
      isRunningRef.current = false
      setIsRunning(false)
      endTimeRef.current = null
      window.setTimeout(() => {
        suppressCompleteRef.current = false
      }, 0)
      return
    }

    suppressCompleteRef.current = true
    setRemainingSeconds(remoteRemaining)
    const nextRunning = remoteRunning && remoteRemaining > 0
    isRunningRef.current = nextRunning
    setIsRunning(nextRunning)
    endTimeRef.current = nextRunning ? remoteEndsAt : null

    window.setTimeout(() => {
      suppressCompleteRef.current = false
    }, 0)
  }, [])

  const getSnapshot = useCallback(() => {
    const remaining = isRunning && endTimeRef.current
      ? remainingFromEndsAt(endTimeRef.current)
      : remainingSeconds
    return {
      isRunning,
      remainingSeconds: remaining,
      endsAt: isRunning ? endTimeRef.current : null,
    }
  }, [isRunning, remainingSeconds])

  return {
    remainingSeconds,
    isRunning,
    start,
    pause,
    toggle,
    reset,
    adjustSeconds,
    setSeconds,
    applyRemoteSession,
    getSnapshot,
    syncFromServerClock,
  }
}

export function useWakeLock(enabled) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return undefined

    let lock = null
    const requestLock = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch {
        lock = null
      }
    }

    requestLock()

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requestLock()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      lock?.release?.()
    }
  }, [enabled])
}
